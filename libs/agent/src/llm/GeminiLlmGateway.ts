import { isPlainObject } from '../utils/json';

import type { AgentEnvironmentSupportable } from '../environment';
import type { HttpRequestSupportable } from '../http';
import type { ChatRequest, Chunk, JsonSchema, LlmGateway, LlmGatewayCapabilities, ToolDef } from './llmGateway';

/** Generation parameters applied to every request. */
export interface GeminiGenerationConfig {
    temperature?: number;
    maxOutputTokens?: number;
    thinkingBudget?: number;
}

/**
 * Transient-throttle retry. Rate-limited Developer keys reject bursts with 429/503; backing off and retrying
 * lets a multi-call agent turn ride through instead of failing. Applies only to retryable HTTP statuses; other
 * errors still throw at once.
 */
export interface GeminiRetryConfig {
    /** Total HTTP attempts per request (1 = no retry). Default 4. */
    maxAttempts?: number;
    /** Base backoff in ms; grows exponentially (base·2^(n−1)) with jitter, capped. Default 1000. */
    baseDelayMs?: number;
}

export interface GeminiLlmGatewayOptions {
    /** Provides tracing, time, and cancellation. */
    environment: AgentEnvironmentSupportable;
    /** HTTP port. */
    http: HttpRequestSupportable;
    /** Gemini Developer API key; sent as the x-goog-api-key header, never traced. */
    apiKey: string;
    /** Defaults to gemini-2.5-flash. */
    model?: string;
    /** Override to route through a backend proxy. */
    baseUrl?: string;
    /** Optional generation parameters applied to every request. */
    generation?: GeminiGenerationConfig;
    /** Optional transient-throttle (429/503) retry-with-backoff; defaults to 4 attempts, 1s base. */
    retry?: GeminiRetryConfig;
}

/** The Gemini gateway backed by the Developer API: the shared contract plus provider/model identity. */
export interface GeminiLlmGateway extends LlmGateway {
    readonly capabilities: LlmGatewayCapabilities;
    readonly provider: 'gemini';
    readonly model: string;
}

const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com';
const ERROR_BODY_SNIPPET_LENGTH = 200;

/** A provider/proxy could echo request data back; scrub the api key before it reaches an error. */
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
const toGeminiRequest = (req: ChatRequest, generation?: GeminiGenerationConfig) => {
    const nameByCallId = new Map<string, string>();
    for (const message of req.messages) {
        for (const call of message.toolCalls ?? []) {
            nameByCallId.set(call.id, call.name);
        }
    }

    const systemTexts: string[] = [];
    const contents: GeminiContent[] = [];

    // Append a part to the open trailing user turn, or start a new one. Gemini wants alternating roles and
    // requires a model turn's N functionCalls to be answered by N functionResponses in a SINGLE user turn — so
    // consecutive user-side parts coalesce into one content: parallel tool results become one turn, and any
    // trailing user text turn that follows the results rides that same turn as an extra text part.
    const appendUserPart = (part: GeminiPart) => {
        const last = contents[contents.length - 1];
        if (last?.role === 'user') {
            last.parts.push(part);
        } else {
            contents.push({ role: 'user', parts: [part] });
        }
    };

    for (const message of req.messages) {
        if (message.role === 'system') {
            systemTexts.push(message.content ?? '');
            continue;
        }
        if (message.role === 'tool') {
            const name = (message.toolCallId ? nameByCallId.get(message.toolCallId) : undefined) ?? 'tool';
            appendUserPart({ functionResponse: { name, response: toResponseObject(message.content) } });
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
        appendUserPart({ text: message.content ?? '' });
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
    usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
        cachedContentTokenCount?: number;
    };
    promptFeedback?: { blockReason?: string };
}

/**
 * LlmGateway backed by the Gemini Developer API (x-goog-api-key → generativelanguage.googleapis.com). Body
 * build → request loop (with 429/503 retry) → response parse → usageMetadata mapping → chunk yield.
 * Function-calling; non-streaming under the hood — response `functionCall`s surface as {@link Chunk} `toolCall`s.
 */
export const createGeminiLlmGateway = (options: GeminiLlmGatewayOptions): GeminiLlmGateway => {
    const { environment, http, generation, retry } = options;
    const model = options.model ?? DEFAULT_MODEL;
    const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    const apiKey = options.apiKey;
    const url = `${baseUrl}/v1beta/models/${model}:generateContent`;

    // Transient-throttle retry: rate-limited Developer keys reject bursts with 429/503. Back off and retry the
    // SAME request so a multi-call agent turn rides through. Other errors throw.
    const RETRYABLE_STATUS = new Set([429, 503]);
    const maxHttpAttempts = Math.max(1, retry?.maxAttempts ?? 4);
    const baseDelayMs = retry?.baseDelayMs ?? 1000;
    const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
    const trace = environment.traceReporter;

    // Gemini returns no tool-call ids; synthesize a stable one so the agent loop can correlate results.
    let callCounter = 0;
    const nextCallId = () => `gemini-call-${(callCounter += 1)}`;

    async function* chat(req: ChatRequest, opts?: { signal?: AbortSignal }): AsyncIterable<Chunk> {
        const startedAt = environment.now();
        const body = toGeminiRequest(req, generation);
        const headers = { 'x-goog-api-key': apiKey };
        const secrets = [apiKey];

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
            const send = () =>
                http.request({ method: 'POST', url, headers, body, ...(opts?.signal ? { signal: opts.signal } : {}) });
            // Send, then retry 429/503 with exponential backoff + jitter (capped) until it succeeds or attempts run out.
            let response = await send();
            for (
                let httpAttempt = 1;
                httpAttempt < maxHttpAttempts &&
                !response.ok &&
                RETRYABLE_STATUS.has(response.status) &&
                !opts?.signal?.aborted;
                httpAttempt += 1
            ) {
                const backoffMs =
                    Math.min(baseDelayMs * 2 ** (httpAttempt - 1), 15_000) + Math.floor(Math.random() * 250);
                trace?.debug('llm.gemini.retry', { model, status: response.status, httpAttempt, backoffMs });
                await sleep(backoffMs);
                response = await send();
            }

            if (!response.ok) {
                const errorBody = await response.text().catch(() => '');
                const safeBody = secrets.reduce((acc, secret) => redactText(acc, secret), errorBody);

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
        // Field names match the canonical UsageInfo shape (llmGateway.ts) — `providerTotalTokens`/
        // `cachedInputTokens`, not `totalTokens`/`cachedTokens` — so every consumer (wireLog.ts,
        // verificationMetrics.ts, metering.ts) actually receives them instead of silently falling
        // back to an input+output-only total that omits Gemini's hidden thinking-token cost (see
        // metering.ts's own `providerTotalTokens − inputTokens` derivation). `promptTokenCount`
        // already INCLUDES the cached portion (Gemini's own context-caching docs), so it is
        // subtracted here — mirrors GeminiToolLlmGateway.ts's `toUsageInfo`, this gateway's own
        // tool-capable sibling, which already gets this mapping right.
        const promptTokenCount = usageMeta?.promptTokenCount;
        const cachedContentTokenCount = usageMeta?.cachedContentTokenCount;
        const inputTokens =
            promptTokenCount !== undefined ? Math.max(promptTokenCount - (cachedContentTokenCount ?? 0), 0) : undefined;
        const usage = usageMeta
            ? {
                  ...(inputTokens !== undefined ? { inputTokens } : {}),
                  ...(usageMeta.candidatesTokenCount !== undefined
                      ? { outputTokens: usageMeta.candidatesTokenCount }
                      : {}),
                  ...(usageMeta.totalTokenCount !== undefined
                      ? { providerTotalTokens: usageMeta.totalTokenCount }
                      : {}),
                  ...(cachedContentTokenCount !== undefined ? { cachedInputTokens: cachedContentTokenCount } : {}),
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

    return { capabilities: { toolCalls: true }, chat, provider: 'gemini', model };
};
