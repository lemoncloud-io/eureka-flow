import { isPlainObject } from '../utils/json';

import type { AgentEnvironmentSupportable } from '../environment';
import type { HttpRequestSupportable } from '../http';
import type { ChatRequest, Chunk, JsonSchema, LlmGateway, LlmGatewayCapabilities, ToolDef } from './llmGateway';

export interface GeminiLlmGatewayOptions {
    /** Provides tracing, time, and cancellation. */
    environment: AgentEnvironmentSupportable;
    /** HTTP port. */
    http: HttpRequestSupportable;
    /** Gemini API key; sent as the x-goog-api-key header, never traced. */
    apiKey: string;
    /** Defaults to gemini-2.5-flash. */
    model?: string;
    /** Override to route through a backend proxy. */
    baseUrl?: string;
    /** Optional generation parameters applied to every request. */
    generation?: { temperature?: number; maxOutputTokens?: number; thinkingBudget?: number };
}

/** The Gemini gateway: the shared contract plus provider/model identity. */
export interface GeminiLlmGateway extends LlmGateway {
    readonly capabilities: LlmGatewayCapabilities;
    readonly provider: 'gemini';
    readonly model: string;
}

const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com';
const ERROR_BODY_SNIPPET_LENGTH = 200;

/** A provider/proxy could echo request data back; scrub the key before it reaches an error. */
const redactText = (value: string, secret: string): string =>
    secret.length > 0 ? value.split(secret).join('[redacted]') : value;

// ── Gemini generateContent shapes (function-calling) ──────────────────────────────────────────
// Content.role is only user|model; a tool RESULT is a `user` turn carrying a functionResponse part.
interface GeminiFunctionCall {
    name: string;
    args?: Record<string, unknown>;
}
interface GeminiPart {
    text?: string;
    functionCall?: GeminiFunctionCall;
    functionResponse?: { name: string; response: Record<string, unknown> };
}
interface GeminiContent {
    role: 'user' | 'model';
    parts: GeminiPart[];
}

/** Parse a JSON args string into an object (Gemini wants an object, never a raw string / array). */
const parseArgsObject = (raw: string | undefined): Record<string, unknown> => {
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        return isPlainObject(parsed) ? parsed : {};
    } catch {
        return {};
    }
};

/** A tool result's `content` is a JSON string; Gemini's `functionResponse.response` must be an object. */
const toResponseObject = (content: string | null): Record<string, unknown> => {
    if (content === null || content === '') return { result: '' };
    try {
        const parsed = JSON.parse(content);
        if (isPlainObject(parsed)) return parsed;
        return { result: parsed };
    } catch {
        return { result: content };
    }
};

/** Our `ToolDef.parameters` is already an OpenAPI-subset JSON Schema; Gemini's functionDeclarations accept it as-is. */
const toGeminiParameters = (schema: JsonSchema): JsonSchema => schema;

/** Map the provider-neutral request onto Gemini's generateContent shape (tool `name` recovered from prior `toolCalls` by id). */
const toGeminiRequest = (req: ChatRequest, generation?: GeminiLlmGatewayOptions['generation']) => {
    const nameByCallId = new Map<string, string>();
    for (const message of req.messages) {
        for (const call of message.toolCalls ?? []) {
            nameByCallId.set(call.id, call.name);
        }
    }

    const systemTexts: string[] = [];
    const contents: GeminiContent[] = [];

    for (const message of req.messages) {
        if (message.role === 'system') {
            systemTexts.push(message.content ?? '');
            continue;
        }
        if (message.role === 'tool') {
            const name = (message.toolCallId ? nameByCallId.get(message.toolCallId) : undefined) ?? 'tool';
            contents.push({
                role: 'user',
                parts: [{ functionResponse: { name, response: toResponseObject(message.content) } }],
            });
            continue;
        }
        if (message.role === 'assistant') {
            const parts: GeminiPart[] = [];
            if (message.content) parts.push({ text: message.content });
            for (const call of message.toolCalls ?? []) {
                parts.push({ functionCall: { name: call.name, args: parseArgsObject(call.args) } });
            }
            // A model turn must carry at least one part.
            contents.push({ role: 'model', parts: parts.length > 0 ? parts : [{ text: '' }] });
            continue;
        }
        contents.push({ role: 'user', parts: [{ text: message.content ?? '' }] });
    }

    const generationConfig = {
        ...(generation?.temperature !== undefined ? { temperature: generation.temperature } : {}),
        ...(generation?.maxOutputTokens !== undefined ? { maxOutputTokens: generation.maxOutputTokens } : {}),
        // thinkingBudget 0 disables thinking; a positive value caps it (keeps it from starving the output budget).
        ...(generation?.thinkingBudget !== undefined
            ? { thinkingConfig: { thinkingBudget: generation.thinkingBudget } }
            : {}),
    };

    return {
        contents,
        ...(systemTexts.length > 0 ? { systemInstruction: { parts: [{ text: systemTexts.join('\n\n') }] } } : {}),
        ...(req.tools.length > 0
            ? {
                  tools: [
                      {
                          functionDeclarations: req.tools.map((tool: ToolDef) => ({
                              name: tool.name,
                              description: tool.description,
                              parameters: toGeminiParameters(tool.parameters),
                          })),
                      },
                  ],
              }
            : {}),
        ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : {}),
    };
};

interface GeminiResponse {
    candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    promptFeedback?: { blockReason?: string };
}

/** LlmGateway backed by Gemini's generateContent API with function-calling; non-streaming under the hood, response `functionCall`s surface as {@link Chunk} `toolCall`s. */
export const createGeminiLlmGateway = (options: GeminiLlmGatewayOptions): GeminiLlmGateway => {
    const { environment, http, apiKey } = options;
    const model = options.model ?? DEFAULT_MODEL;
    const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    const trace = environment.traceReporter;

    // Gemini returns no tool-call ids; synthesize a stable one so the agent loop can correlate results.
    let callCounter = 0;
    const nextCallId = () => `gemini-call-${(callCounter += 1)}`;

    async function* chat(req: ChatRequest, opts?: { signal?: AbortSignal }): AsyncIterable<Chunk> {
        const startedAt = environment.now();
        const body = toGeminiRequest(req, options.generation);

        trace?.debug('llm.gemini.request', {
            model,
            messageCount: req.messages.length,
            toolCount: req.tools.length,
        });

        // Retry a degenerate empty response (thinking-only / MAX_TOKENS, no parts) once; HTTP errors throw immediately.
        // An empty candidate that finished STOP and was not blocked is a legitimate empty turn — fall through, don't retry/throw.
        const MAX_ATTEMPTS = 2;
        let payload: GeminiResponse | undefined;
        let parts: GeminiPart[] | undefined;
        let emptyReason = 'no candidates';
        let cleanStop = false;

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
            const response = await http.request({
                method: 'POST',
                url: `${baseUrl}/v1beta/models/${model}:generateContent`,
                headers: { 'x-goog-api-key': apiKey },
                body,
                ...(opts?.signal ? { signal: opts.signal } : {}),
            });

            if (!response.ok) {
                const errorBody = await response.text().catch(() => '');
                const safeBody = redactText(errorBody, apiKey);

                trace?.error('llm.gemini.error', { model, status: response.status });
                throw new Error(
                    `Gemini request failed with status ${response.status}: ${safeBody.slice(0, ERROR_BODY_SNIPPET_LENGTH)}`
                );
            }

            payload = (await response.json()) as GeminiResponse;
            parts = payload.candidates?.[0]?.content?.parts;
            if (parts && parts.length > 0) break;

            const finishReason = payload.candidates?.[0]?.finishReason;
            const blockReason = payload.promptFeedback?.blockReason;
            if (finishReason === 'STOP' && !blockReason) {
                cleanStop = true;
                break;
            }

            emptyReason = finishReason ?? blockReason ?? 'no candidates';
            trace?.debug('llm.gemini.empty', { model, attempt, reason: emptyReason });
        }

        if (!cleanStop && (!parts || parts.length === 0)) {
            trace?.error('llm.gemini.error', { model, reason: emptyReason });
            throw new Error(
                `Gemini response contained no content parts after ${MAX_ATTEMPTS} attempt(s) (reason: ${emptyReason})`
            );
        }

        // A clean empty STOP has no parts; treat it as an empty completion (no text, no tool calls).
        const contentParts = parts ?? [];
        const text = contentParts.map(part => part.text ?? '').join('');
        const functionCalls = contentParts.filter(
            (part): part is GeminiPart & { functionCall: GeminiFunctionCall } => part.functionCall !== undefined
        );

        const usageMeta = payload?.usageMetadata;
        const usage = usageMeta
            ? {
                  ...(usageMeta.promptTokenCount !== undefined ? { inputTokens: usageMeta.promptTokenCount } : {}),
                  ...(usageMeta.candidatesTokenCount !== undefined
                      ? { outputTokens: usageMeta.candidatesTokenCount }
                      : {}),
              }
            : undefined;

        trace?.debug('llm.gemini.response', {
            model,
            textLength: text.length,
            toolCallCount: functionCalls.length,
            durationMs: environment.now() - startedAt,
            ...(usage ? { usage } : {}),
        });

        if (text) {
            yield { text };
        }
        for (const part of functionCalls) {
            yield {
                toolCall: {
                    id: nextCallId(),
                    name: part.functionCall.name,
                    argsDelta: JSON.stringify(part.functionCall.args ?? {}),
                },
            };
        }
        yield { done: true, ...(usage ? { usage } : {}) };
    }

    return {
        capabilities: { toolCalls: true },
        provider: 'gemini',
        model,
        chat,
    };
};
