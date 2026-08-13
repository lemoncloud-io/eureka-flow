import { api } from '@flows/web-core';

import type { ChatMessage, ChatRequest, Chunk, LlmGateway, ToolDef } from '@flows/agent';

/**
 * Frontend gateway for eureka-flows-api's Generate endpoint (`POST /runs/0/generate`). Implements
 * the shared {@link LlmGateway} `chat()` contract and is tool-capable: it sends the provider-neutral
 * `messages` + `tools` transcript and surfaces the model's tool calls back to the browser, so it can
 * drive the orchestrator's client-side tool loop.
 *
 * The HTTP call is an ACK; the completed result is delivered one of two ways, chosen by whether a
 * tool-socket connection is available (read fresh on every call via {@link GenerateConnectionSnapshot}):
 * - **connection present** → `transport=1`: the result arrives over the tool WebSocket as a
 *   JSONTransport payload, reassembled by the injected {@link GenerateReceiver} and correlated by a
 *   per-request `requestId`.
 * - **no connection** → HTTP-only: the completed result comes back in the POST response body.
 *
 * This file lives in the app layer, not `libs/agent`, because it depends on the app's API client
 * (`@flows/web-core`, which owns `x-api-key` + base URL) and on the socket receiver concept.
 */

/** The injected result receiver: registers interest for a `requestId`, runs the HTTP trigger, and
 * resolves with the reassembled {@link GenerateResponse} once the socket delivers it. Aborting
 * `opts.signal` settles the pending wait immediately (rejects with an `AbortError`) so a cancelled
 * turn never holds its entry until the socket result or the timeout arrives. */
export interface GenerateReceiver<T> {
    wait(requestId: string, fire: () => Promise<unknown>, opts?: { signal?: AbortSignal }): Promise<T>;
}

export interface GenerateContent {
    role?: string;
    parts: Array<{
        text?: string;
        inlineData?: { data: string; mimeType?: string };
    }>;
}

export interface GenerateRequestBody {
    requestId?: string;
    model: string;
    prompt: string | { type?: string; content: string | GenerateContent | GenerateContent[] };
    system?: string;
    image?: boolean;
    config?: {
        responseMimeType?: string;
        responseSchema?: unknown;
        responseModalities?: string[];
        temperature?: number;
        topP?: number;
        imageConfig?: { aspectRatio?: string; imageSize?: string };
    };
    messages?: ChatMessage[];
    tools?: ToolDef[];
}

export interface GenerateResponse {
    requestId?: string;
    output: {
        content: string | { data?: string };
    };
    usage?: {
        model?: string;
        promptToken?: number;
        completionToken?: number;
        totalToken?: number;
        imageToken?: number;
    };
    toolCalls?: Array<{ id: string; name: string; args: unknown }>;
}

/** The live tool-socket state, read fresh on every `chat()` call — never cached, since a reconnect
 * issues a new `connectionId` (spec: "after reconnecting, use the latest value"). */
export interface GenerateConnectionSnapshot {
    isConnected: boolean;
    connectionId: string | null;
    generateReceiver: GenerateReceiver<GenerateResponse> | null;
}

export type GeneratePostConfig = { params: Record<string, unknown>; signal?: AbortSignal };
export type GeneratePostFn = (url: string, body: unknown, config: GeneratePostConfig) => Promise<unknown>;

export interface CreateGenerateApiLlmGatewayOptions {
    /** Read the live connection state; called fresh on every `chat()` call. */
    getConnection: () => GenerateConnectionSnapshot;
    /** Defaults to `api.post` from `@flows/web-core` (adds `/_api_` + `x-api-key` automatically). */
    post?: GeneratePostFn;
    /** Defaults to `gemini-2.5-flash`. */
    model?: string;
    generation?: { temperature?: number };
    /** Generate route; defaults to the production Run endpoint. */
    endpointPath?: string;
}

const DEFAULT_MODEL = 'gemini-2.5-flash';

const defaultPost: GeneratePostFn = (url, body, config) => api.post(url, body, config);

const toGenerateRequestBody = (
    req: ChatRequest,
    requestId: string,
    model: string,
    generation?: { temperature?: number }
): GenerateRequestBody => {
    const systemTexts = req.messages.filter(message => message.role === 'system').map(message => message.content ?? '');
    const turnMessages = req.messages.filter(message => message.role === 'user' || message.role === 'assistant');

    const prompt: GenerateRequestBody['prompt'] =
        turnMessages.length === 1 && turnMessages[0].role === 'user'
            ? (turnMessages[0].content ?? '')
            : {
                  content: turnMessages.map(
                      (message): GenerateContent => ({
                          role: message.role === 'assistant' ? 'model' : 'user',
                          parts: [{ text: message.content ?? '' }],
                      })
                  ),
              };

    return {
        requestId,
        model,
        prompt,
        ...(systemTexts.length > 0 ? { system: systemTexts.join('\n\n') } : {}),
        ...(generation?.temperature !== undefined ? { config: { temperature: generation.temperature } } : {}),
        messages: req.messages,
        tools: req.tools,
    };
};

/** Implements the shared `chat()` contract over Generate HTTP ACK + WebSocket result delivery. */
export const createGenerateApiLlmGateway = (options: CreateGenerateApiLlmGatewayOptions): LlmGateway => {
    const {
        getConnection,
        post = defaultPost,
        model = DEFAULT_MODEL,
        generation,
        endpointPath = '/runs/0/generate',
    } = options;

    async function* chat(req: ChatRequest, opts?: { signal?: AbortSignal }): AsyncIterable<Chunk> {
        const { isConnected, connectionId, generateReceiver } = getConnection();
        if (connectionId && !isConnected) {
            throw new Error('Generate API gateway unavailable: the tool socket is not connected');
        }

        const requestId = crypto.randomUUID();
        const body = toGenerateRequestBody(req, requestId, model, generation);

        // Socket delivery when a connection exists (result reassembled by the receiver, keyed on
        // requestId); otherwise HTTP-only (the completed result comes back in the POST body).
        let response: GenerateResponse;
        if (connectionId) {
            if (!generateReceiver) {
                throw new Error('Generate API gateway unavailable: no generate receiver registered on the socket');
            }
            response = await generateReceiver.wait(
                requestId,
                () =>
                    post(endpointPath, body, {
                        params: { connection: connectionId, transport: 1 },
                        ...(opts?.signal ? { signal: opts.signal } : {}),
                    }),
                opts?.signal ? { signal: opts.signal } : undefined
            );
        } else {
            const http = await post(endpointPath, body, {
                params: {},
                ...(opts?.signal ? { signal: opts.signal } : {}),
            });
            response = ((http as { data?: unknown })?.data ?? http) as GenerateResponse;
        }

        if (opts?.signal?.aborted) {
            throw new DOMException('Aborted', 'AbortError');
        }

        const content = response.output?.content;
        const calls = response.toolCalls ?? [];
        if (typeof content === 'string') {
            if (content) yield { text: content };
        } else if (content != null) {
            throw new Error('Generate API response content is not text (image/object output)');
        } else if (calls.length === 0) {
            throw new Error('Generate API response is missing output.content');
        }

        for (const toolCall of calls) {
            yield {
                toolCall: { id: toolCall.id, name: toolCall.name, argsDelta: JSON.stringify(toolCall.args ?? {}) },
            };
        }

        const usage = response.usage
            ? {
                  ...(response.usage.promptToken !== undefined ? { inputTokens: response.usage.promptToken } : {}),
                  ...(response.usage.completionToken !== undefined
                      ? { outputTokens: response.usage.completionToken }
                      : {}),
              }
            : undefined;
        yield { done: true, ...(usage ? { usage } : {}) };
    }

    return {
        capabilities: { toolCalls: true },
        chat,
    };
};
