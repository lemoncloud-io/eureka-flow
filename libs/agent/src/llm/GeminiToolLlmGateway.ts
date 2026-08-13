import { PRICING_CONFIG_VERSION, estimateCost } from './pricing';
import { NoopTracer } from '../trace';

import type { HttpClient } from '../http';
import type { Tracer } from '../trace';
import type {
    ChatMessage,
    ChatRequest,
    Chunk,
    JsonSchema,
    LlmGateway,
    LlmGatewayCapabilities,
    ToolDef,
    UsageInfo,
} from './llmGateway';

/**
 * Tool-capable Gemini gateway — `generateContent` with `functionDeclarations`.
 *
 * Separate from the text-only {@link createGeminiLlmGateway} (which stays as-is): this one
 * declares `capabilities.toolCalls = true`, maps `ToolDef` → Gemini `functionDeclarations`,
 * and parses `candidate.content.parts[].functionCall` back into {@link Chunk} `toolCall`s.
 *
 * Single-turn tool calling and multi-turn tool-result mapping are both implemented.
 * Gemini correlates a tool result to the call it answers by function **name** (`functionResponse.
 * name`), not by id — unlike OpenAI/Anthropic, which use `tool_call_id`/`tool_use_id` directly.
 * The `ChatMessage` tool-result shape only carries `toolCallId`, not a name, so the name is
 * recovered by scanning every assistant `toolCalls[]` entry earlier in the *same* request's
 * message list (see `buildToolCallNameById`) — safe because both `BaseAgent.mapTranscript` and
 * every verification harness here always place the assistant tool-call message immediately
 * before the tool-result message(s) that answer it, in the same `messages` array. If no matching
 * entry is found (a malformed/out-of-order transcript), this throws rather than guessing or
 * silently dropping the function name. Offline-verified only (`GeminiToolLlmGateway.spec.ts`); no
 * real Gemini API call exercises the tool-result round trip yet.
 */

export interface GeminiToolLlmGatewayOptions {
    /** HTTP port. */
    http: HttpClient;
    /** Trace port; defaults to {@link NoopTracer}. Provider-specific request/response/error events. */
    tracer?: Tracer;
    /** Injectable clock for deterministic duration in tests; defaults to `Date.now`. */
    now?: () => number;
    /** Gemini API key; sent as the x-goog-api-key header, never traced. */
    apiKey: string;
    /** Defaults to gemini-2.5-flash. */
    model?: string;
    /** Override to route through a backend proxy. */
    baseUrl?: string;
    /** Optional generation parameters applied to every request. */
    generation?: { temperature?: number; maxOutputTokens?: number };
}

/** The tool-capable Gemini gateway: the shared contract plus provider/model identity. */
export interface GeminiToolLlmGateway extends LlmGateway {
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

/** JSON-Schema `type` (lowercase) → Gemini's OpenAPI `Type` enum (uppercase). */
const GEMINI_TYPE: Record<string, string> = {
    object: 'OBJECT',
    string: 'STRING',
    number: 'NUMBER',
    integer: 'INTEGER',
    boolean: 'BOOLEAN',
    array: 'ARRAY',
};

/** Recursively convert our JsonSchema to Gemini's schema shape: uppercase `type`, recurse into properties/items. */
const toGeminiSchema = (schema: JsonSchema): Record<string, unknown> => {
    const out: Record<string, unknown> = { ...schema };
    if (typeof schema.type === 'string' && GEMINI_TYPE[schema.type]) {
        out['type'] = GEMINI_TYPE[schema.type];
    }
    if (schema.properties) {
        out['properties'] = Object.fromEntries(
            Object.entries(schema.properties).map(([key, value]) => [key, toGeminiSchema(value)])
        );
    }
    if (schema.items) {
        out['items'] = toGeminiSchema(schema.items);
    }
    return out;
};

interface GeminiContentPart {
    text?: string;
    functionCall?: { name: string; args: unknown };
    functionResponse?: { name: string; response: unknown };
    /** Required by Gemini's "thinking" model family (3.x, and sometimes gemini-2.5-flash-lite) on
     * every replayed `functionCall` part — omitting it on a call that originally had one causes a
     * 400 ("Function call is missing a thought_signature..."; confirmed live, 2026-08-07; see
     * ai.google.dev/gemini-api/docs/thought-signatures). Opaque; never generated locally, only
     * ever round-tripped from a prior response. */
    thoughtSignature?: string;
}

interface GeminiContent {
    role: 'user' | 'model';
    parts: GeminiContentPart[];
}

const toGeminiTool = (tool: ToolDef) => ({
    name: tool.name,
    description: tool.description,
    parameters: toGeminiSchema(tool.parameters),
});

/**
 * Recover a `toolCallId -> function name` map from every assistant tool-call message in this
 * request's history. Gemini's `functionResponse` needs the function *name*, not an id — see the
 * module doc above for why this is safe.
 */
const buildToolCallNameById = (messages: ChatMessage[]): Map<string, string> => {
    const names = new Map<string, string>();
    for (const message of messages) {
        for (const call of message.toolCalls ?? []) {
            names.set(call.id, call.name);
        }
    }
    return names;
};

/** Gemini's `functionResponse.response` must be an object. Our tool-result `content` is always a
 * JSON-stringified object in practice (see `resultToContent` in `baseAgent.ts`); parse it through
 * when possible, and defensively wrap anything else (unparsable, or a parsed primitive) so the
 * request is never malformed even if a caller ever passes non-JSON content. */
const toGeminiFunctionResponsePayload = (content: string): Record<string, unknown> => {
    try {
        const parsed: unknown = JSON.parse(content);
        return typeof parsed === 'object' && parsed !== null
            ? (parsed as Record<string, unknown>)
            : { content: parsed };
    } catch {
        return { content };
    }
};

/** Map the provider-neutral request onto Gemini's generateContent shape with function declarations. */
const toGeminiToolRequest = (req: ChatRequest, generation?: GeminiToolLlmGatewayOptions['generation']) => {
    const systemTexts: string[] = [];
    const contents: GeminiContent[] = [];
    const toolCallNameById = buildToolCallNameById(req.messages);

    for (const message of req.messages) {
        if (message.role === 'system') {
            systemTexts.push(message.content ?? '');
            continue;
        }

        if (message.role === 'tool') {
            const name = message.toolCallId ? toolCallNameById.get(message.toolCallId) : undefined;
            if (!name) {
                throw new Error(
                    `Gemini tool gateway: no matching function-call name found for toolCallId ` +
                        `"${message.toolCallId ?? ''}" — the assistant tool-call message must appear ` +
                        'earlier in the same request'
                );
            }
            contents.push({
                role: 'user',
                parts: [
                    { functionResponse: { name, response: toGeminiFunctionResponsePayload(message.content ?? '{}') } },
                ],
            });
            continue;
        }

        if (message.role === 'assistant' && (message.toolCalls?.length ?? 0) > 0) {
            const parts: GeminiContentPart[] = [];
            if (message.content) {
                parts.push({ text: message.content });
            }
            // The `?? []` fallback below is unreachable: the guard above already proves
            // `message.toolCalls` is defined and non-empty (`(message.toolCalls?.length ?? 0) > 0`),
            // so `message.toolCalls` can never be nullish by the time this loop runs.
            for (const call of /* v8 ignore next */ message.toolCalls ?? []) {
                parts.push({
                    functionCall: { name: call.name, args: JSON.parse(call.args) },
                    ...(call.thoughtSignature !== undefined ? { thoughtSignature: call.thoughtSignature } : {}),
                });
            }
            contents.push({ role: 'model', parts });
            continue;
        }

        contents.push({
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: message.content ?? '' }],
        });
    }

    const generationConfig = {
        ...(generation?.temperature !== undefined ? { temperature: generation.temperature } : {}),
        ...(generation?.maxOutputTokens !== undefined ? { maxOutputTokens: generation.maxOutputTokens } : {}),
    };

    return {
        contents,
        ...(systemTexts.length > 0 ? { systemInstruction: { parts: [{ text: systemTexts.join('\n\n') }] } } : {}),
        ...(req.tools.length > 0 ? { tools: [{ functionDeclarations: req.tools.map(toGeminiTool) }] } : {}),
        ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : {}),
    };
};

/** Gemini's own enum-like fields — never the prompt or model output, safe to surface in errors. */
interface GeminiSafetyRating {
    category?: string;
    probability?: string;
    blocked?: boolean;
}

interface GeminiCandidate {
    content?: {
        parts?: Array<{ text?: string; functionCall?: { name: string; args?: unknown }; thoughtSignature?: string }>;
    };
    /** Why generation stopped for this candidate, e.g. `STOP`, `SAFETY`, `MAX_TOKENS`, `RECITATION`. */
    finishReason?: string;
    safetyRatings?: GeminiSafetyRating[];
}

interface GeminiPromptFeedback {
    /** Set when the prompt itself was blocked before any candidate was generated, e.g. `SAFETY`. */
    blockReason?: string;
    safetyRatings?: GeminiSafetyRating[];
}

interface GeminiUsageMetadata {
    /** Total prompt tokens — already INCLUDES `cachedContentTokenCount` (confirmed by Google's own
     * context-caching docs: "cached prompt tokens are included in promptTokenCount"). Subtracted
     * below so the normalized `inputTokens` never double-counts the cached portion. */
    promptTokenCount?: number;
    /** Subset of `promptTokenCount` served from cache — NOT additional tokens on top of it. */
    cachedContentTokenCount?: number;
    /** Visible response tokens — already excludes `thoughtsTokenCount` (Google's own docs: total
     * tokens = prompt + candidates + toolUsePrompt + thoughts, four separate additive terms, not
     * nested), so no subtraction needed here. */
    candidatesTokenCount?: number;
    /** "Thinking" tokens spent before responding — a separate additive term from
     * `candidatesTokenCount`, billed at the output rate. */
    thoughtsTokenCount?: number;
    /** Input tokens from tool-execution results fed back to the model on a later turn — a
     * separate additive term, NOT part of `promptTokenCount` (see the four-term totalTokenCount
     * sum above) — billed at the input rate, per Google's own docs describing it as "provided
     * back to the model as input". */
    toolUsePromptTokenCount?: number;
    /** The provider's own raw grand total — passed through as-is for `providerTotalTokens`,
     * never recomputed locally. */
    totalTokenCount?: number;
}

interface GeminiToolResponse {
    candidates?: GeminiCandidate[];
    promptFeedback?: GeminiPromptFeedback;
    usageMetadata?: GeminiUsageMetadata;
}

/**
 * Maps Gemini's `usageMetadata` onto the normalized {@link UsageInfo} shape and fills in
 * `estimatedCost` from `pricing.ts`. `promptTokenCount` already includes
 * `cachedContentTokenCount` (Google's own context-caching docs), so `inputTokens` here is
 * deliberately `promptTokenCount - cachedContentTokenCount`, never the raw `promptTokenCount` —
 * otherwise cached tokens would be billed twice: once folded into `inputTokens` at the standard
 * rate, and again via `cachedInputTokens` at the cached rate. `toolUsePromptTokenCount` is a
 * separate additive component of Gemini's own `totalTokenCount` (not nested inside
 * `promptTokenCount`), so it is never subtracted from `inputTokens` — seeverificationMetrics
 * .spec.ts / GeminiToolLlmGateway.spec.ts for the offline tests proving neither double-counts.
 */
const toUsageInfo = (metadata: GeminiUsageMetadata | undefined, model: string): UsageInfo | undefined => {
    if (!metadata) return undefined;

    const promptTokenCount = metadata.promptTokenCount;
    const cachedContentTokenCount = metadata.cachedContentTokenCount;
    const inputTokens =
        promptTokenCount !== undefined ? Math.max(promptTokenCount - (cachedContentTokenCount ?? 0), 0) : undefined;

    const usage: UsageInfo = {
        ...(inputTokens !== undefined ? { inputTokens } : {}),
        ...(cachedContentTokenCount !== undefined ? { cachedInputTokens: cachedContentTokenCount } : {}),
        ...(metadata.candidatesTokenCount !== undefined ? { outputTokens: metadata.candidatesTokenCount } : {}),
        ...(metadata.thoughtsTokenCount !== undefined ? { reasoningTokens: metadata.thoughtsTokenCount } : {}),
        ...(metadata.toolUsePromptTokenCount !== undefined
            ? { toolUseInputTokens: metadata.toolUsePromptTokenCount }
            : {}),
        ...(metadata.totalTokenCount !== undefined ? { providerTotalTokens: metadata.totalTokenCount } : {}),
    };

    const estimated = estimateCost('gemini', model, usage);
    return {
        ...usage,
        estimatedCost: estimated,
        ...(estimated !== null ? { costSource: 'estimated', pricingVersion: PRICING_CONFIG_VERSION } : {}),
    };
};

const DIAGNOSTIC_SNIPPET_LENGTH = 200;

/** `category:probability[:blocked]` per rating — enum-like fields only, never raw content. */
const summarizeSafetyRatings = (ratings: GeminiSafetyRating[] | undefined): string | undefined => {
    if (!ratings || ratings.length === 0) return undefined;
    return ratings
        .map(rating =>
            [rating.category, rating.probability, rating.blocked ? 'blocked' : undefined].filter(Boolean).join(':')
        )
        .join(', ');
};

/**
 * Build a sanitized diagnostic summary from whatever metadata Gemini did return alongside an
 * empty/unusable response — `finishReason`, `promptFeedback.blockReason`, and safety ratings are
 * all Gemini's own enum-like fields, never the raw prompt, raw response body, or model output.
 * Falls back to a clear "nothing to show" message rather than an empty string.
 */
const describeGeminiFailure = (payload: GeminiToolResponse): string => {
    const candidate = payload.candidates?.[0];
    const details: string[] = [];

    if (candidate?.finishReason) {
        details.push(`finishReason=${candidate.finishReason}`);
    }
    if (payload.promptFeedback?.blockReason) {
        details.push(`promptFeedback.blockReason=${payload.promptFeedback.blockReason}`);
    }
    const candidateSafety = summarizeSafetyRatings(candidate?.safetyRatings);
    if (candidateSafety) {
        details.push(`candidate.safetyRatings=[${candidateSafety}]`);
    }
    const promptSafety = summarizeSafetyRatings(payload.promptFeedback?.safetyRatings);
    if (promptSafety) {
        details.push(`promptFeedback.safetyRatings=[${promptSafety}]`);
    }

    return details.length > 0 ? details.join('; ') : 'no diagnostic metadata present';
};

/** LlmGateway backed by Gemini's generateContent API with function calling; declares `toolCalls: true`. */
export const createGeminiToolLlmGateway = (options: GeminiToolLlmGatewayOptions): GeminiToolLlmGateway => {
    const { http, apiKey } = options;
    const tracer = options.tracer ?? NoopTracer;
    const now = options.now ?? Date.now;
    const model = options.model ?? DEFAULT_MODEL;
    const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;

    // Gemini returns no tool-call ids; synthesize a stable one so the agent loop can correlate
    // results — same approach as the text-only GeminiLlmGateway's `nextCallId`. Declared HERE, in
    // the gateway-instance scope, not inside `chat()`: a fresh conversation turn calls `chat()`
    // again on the SAME gateway instance, and a per-call-scoped counter would restart at 1 on every
    // turn, producing the same id for two DIFFERENT calls across turns. `buildToolCallNameById`
    // rebuilds its id→name map from the full transcript on every request, so a repeated id from an
    // earlier turn silently overwrites that turn's real mapping — a later tool-result would then
    // replay under the wrong function name. Monotonic for the lifetime of this gateway instance
    // fixes that; it is never reset, and never shared across two separate `createGeminiToolLlmGateway`
    // calls (each gets its own closure), so two independent gateways/sessions can each start at 1
    // without colliding with each other.
    let toolCallSeq = 0;
    const nextToolCallId = (): string => `gemini-call-${(toolCallSeq += 1)}`;

    async function* chat(req: ChatRequest, opts?: { signal?: AbortSignal }): AsyncIterable<Chunk> {
        const startedAt = now();
        const body = toGeminiToolRequest(req, options.generation);

        tracer.emit({
            name: 'llm.gemini.request',
            fields: { model, messageCount: req.messages.length, toolCount: req.tools.length },
        });

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

            tracer.emit({ name: 'llm.gemini.error', level: 'error', fields: { model, status: response.status } });
            throw new Error(
                `Gemini request failed with status ${response.status}: ${safeBody.slice(0, ERROR_BODY_SNIPPET_LENGTH)}`
            );
        }

        const payload = (await response.json()) as GeminiToolResponse;
        const parts = payload.candidates?.[0]?.content?.parts;

        if (!parts || parts.length === 0) {
            // Covers all four empty/unusable shapes uniformly: no candidates, missing `content`,
            // missing `content.parts`, or an empty `content.parts` array.
            const diagnostics = redactText(describeGeminiFailure(payload), apiKey).slice(0, DIAGNOSTIC_SNIPPET_LENGTH);
            tracer.emit({
                name: 'llm.gemini.error',
                level: 'error',
                fields: { model, status: response.status, reason: 'no candidates', diagnostics },
            });
            throw new Error(`Gemini response contained no candidates or no usable content parts (${diagnostics})`);
        }

        let text = '';
        const functionCalls: Array<{ name: string; args: unknown; thoughtSignature?: string }> = [];
        for (const part of parts) {
            if (part.text) {
                text += part.text;
            }
            if (part.functionCall) {
                functionCalls.push({
                    name: part.functionCall.name,
                    args: part.functionCall.args ?? {},
                    ...(part.thoughtSignature !== undefined ? { thoughtSignature: part.thoughtSignature } : {}),
                });
            }
        }

        const usage = toUsageInfo(payload.usageMetadata, model);

        tracer.emit({
            name: 'llm.gemini.response',
            fields: {
                model,
                status: response.status,
                textLength: text.length,
                toolCallCount: functionCalls.length,
                durationMs: now() - startedAt,
                ...(usage ? { usage } : {}),
            },
        });

        if (text) {
            yield { text };
        }
        for (const call of functionCalls) {
            yield {
                toolCall: {
                    id: nextToolCallId(),
                    name: call.name,
                    argsDelta: JSON.stringify(call.args),
                    ...(call.thoughtSignature !== undefined ? { thoughtSignature: call.thoughtSignature } : {}),
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
