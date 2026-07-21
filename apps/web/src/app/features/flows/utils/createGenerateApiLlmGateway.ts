import { api } from '@flows/web-core';

import type { ChatRequest, Chunk, LlmGateway } from '@flows/agent';

/**
 * Frontend adapter foundation for eureka-flow's Generate API (item 7, GenAI adaptor with
 * eureka-flows-api). Implements the shared {@link LlmGateway} `chat()` contract; text-only
 * for now (`capabilities.toolCalls = false`).
 *
 * Per Claire's spec, the HTTP call is only an ACK — the model's actual answer is meant to
 * arrive over the existing flow WebSocket, reassembled by a "generate receiver" keyed on
 * the socket's `connectionId`. That receiver does not exist in the socket layer yet, so
 * this gateway depends on a small local interface ({@link GenerateReceiver}) instead of
 * importing one — real socket wiring is a TODO once `libs/socket` grows one.
 *
 * Real-API smoke testing (see docs/browser-agent/foundations/llm-gateway.md) confirmed the
 * HTTP path works (ACK 200, inner `StatusCode: 202` = async acceptance) but **no WS result
 * frames were observed** in local dev. The inline ACK body is not the model's answer — an
 * empty `text`/`output.content` and the async-acceptance status rule that out — so this
 * gateway does not fall back to it. Until a real receiver is wired, `chat()` will hang
 * waiting on `generateReceiver.wait(...)`, exactly reflecting that unresolved state; nothing
 * here fabricates a result.
 *
 * This file lives in the app layer, not `libs/agent`, because it depends on the app's API
 * client (`@flows/web-core`) and on a socket/receiver concept the agent core knows nothing
 * about — same reasoning as `createCommandLlmGateway`.
 */

/** Structural stand-in for the eventual real receiver (e.g. `ProxyTransportReceiver`). */
export interface GenerateReceiver<T> {
    /** Registers interest for `connectionId`, runs `fire` (the HTTP POST), resolves with the reassembled result. */
    wait(connectionId: string, fire: () => Promise<unknown>): Promise<T>;
}

export interface GenerateContent {
    role?: string;
    parts: Array<{
        text?: string;
        inlineData?: { data: string; mimeType?: string };
    }>;
}

export interface GenerateRequestBody {
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
}

export interface GenerateResponse {
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
}

/** The live flow socket's state, read fresh on every `chat()` call — never cached, since a
 * reconnect issues a new `connectionId` (spec: "after reconnecting, use the latest value"). */
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
}

const DEFAULT_MODEL = 'gemini-2.5-flash';
const TEXT_ONLY = 'Generate API gateway is text-only in this slice (capabilities.toolCalls = false)';

const defaultPost: GeneratePostFn = (url, body, config) => api.post(url, body, config);

const toGenerateRequestBody = (
    req: ChatRequest,
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
        model,
        prompt,
        ...(systemTexts.length > 0 ? { system: systemTexts.join('\n\n') } : {}),
        ...(generation?.temperature !== undefined ? { config: { temperature: generation.temperature } } : {}),
    };
};

/**
 * The Generate API gateway: implements the shared `chat()` contract over Claire's
 * `POST /runs/0/generate` + WebSocket-receiver design. See the module doc for the current
 * (receiver-injected, fake-tested) scope and what remains TODO.
 */
export const createGenerateApiLlmGateway = (options: CreateGenerateApiLlmGatewayOptions): LlmGateway => {
    const { getConnection, post = defaultPost, model = DEFAULT_MODEL, generation } = options;

    async function* chat(req: ChatRequest, opts?: { signal?: AbortSignal }): AsyncIterable<Chunk> {
        const { isConnected, connectionId, generateReceiver } = getConnection();

        if (!isConnected) {
            throw new Error('Generate API gateway unavailable: the flow socket is not connected');
        }
        if (!connectionId) {
            throw new Error('Generate API gateway unavailable: no connectionId (socket not ready yet)');
        }
        if (!generateReceiver) {
            throw new Error('Generate API gateway unavailable: no generate receiver registered on the socket');
        }

        if (req.tools.length > 0) {
            throw new Error(`${TEXT_ONLY}: tool definitions are not supported`);
        }
        if (req.messages.some(message => message.role === 'tool' || (message.toolCalls?.length ?? 0) > 0)) {
            throw new Error(`${TEXT_ONLY}: tool messages are not supported`);
        }

        const body = toGenerateRequestBody(req, model, generation);

        const response = await generateReceiver.wait(connectionId, async () => {
            await post('/runs/0/generate', body, {
                params: { connection: connectionId, transport: 1 },
                ...(opts?.signal ? { signal: opts.signal } : {}),
            });
        });

        if (opts?.signal?.aborted) {
            throw new DOMException('Aborted', 'AbortError');
        }

        const content = response.output?.content;
        if (content === undefined || content === null) {
            throw new Error('Generate API response is missing output.content');
        }
        if (typeof content !== 'string') {
            throw new Error(`${TEXT_ONLY}: response content is not text (image/object output)`);
        }

        yield { text: content };

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
        capabilities: { toolCalls: false },
        chat,
    };
};
