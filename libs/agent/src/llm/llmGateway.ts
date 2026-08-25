import type { Capability } from '../permissions';

/** Minimal JSON-Schema shape for tool parameters; extended as tools need it. */
export interface JsonSchema {
    type?: 'object' | 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'null';
    properties?: Record<string, JsonSchema>;
    required?: string[];
    items?: JsonSchema;
    description?: string;
    enum?: unknown[];
    [key: string]: unknown;
}

/** A tool as advertised to the model. */
export interface ToolDef {
    name: string;
    description: string;
    parameters: JsonSchema;
    /** The capability this tool needs (mutate tools set it; reads omit it). */
    requires?: Capability;
}

/** One message in the provider-neutral chat transcript. */
export interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    /** Present on assistant messages that call tools; `args` is the raw JSON string.
     * `thoughtSignature` is an opaque, provider-specific continuation token — currently only
     * Gemini's "thinking" model family (3.x, and sometimes `gemini-2.5-flash-lite`) populates it;
     * every other provider leaves it undefined. It must be replayed back verbatim on this exact
     * tool call when it appears again in a later request, or Gemini rejects the call with a 400
     * ("Function call is missing a thought_signature..."; see GeminiToolLlmGateway.ts). Never
     * inspect or transform its contents — treat it as an opaque blob to round-trip. */
    toolCalls?: { id: string; name: string; args: string; thoughtSignature?: string }[];
    /** Present on tool-result messages: the id of the assistant tool call it answers. */
    toolCallId?: string;
}

export interface ChatRequest {
    messages: ChatMessage[];
    tools: ToolDef[];
    stream?: boolean;
}

/**
 * Normalized per-call token/cost usage. Every field is optional so a gateway that only knows the
 * basics (or a provider that simply doesn't report a given breakdown) can populate a subset
 * without fabricating the rest — see `libs/agent/src/llm/pricing.ts` for how `estimatedCost` is
 * computed from these, and each gateway's own mapping comment for the exact provider field this
 * normalizes from.
 *
 * Every gateway is responsible for keeping `inputTokens`/`cachedInputTokens`/
 * `cacheWriteInputTokens`/`toolUseInputTokens` mutually disjoint, and `outputTokens`/
 * `reasoningTokens` mutually disjoint, BEFORE populating this shape — even when the provider's own
 * raw field nests one inside another (e.g. Gemini's `promptTokenCount` and OpenAI's `prompt_tokens`
 * both already include cached tokens; OpenAI's `completion_tokens` already includes
 * `reasoning_tokens`). That subtraction is deliberately done once, at the gateway boundary, so
 * every consumer downstream (aggregation, cost estimation, reporting) can just sum these fields
 * without needing provider-specific knowledge of which raw field nests which.
 */
export interface UsageInfo {
    /** Input tokens billed at the provider's standard (non-cached, non-tool-use) rate — always
     * disjoint from the three fields below. */
    inputTokens?: number;
    /** Input tokens served from a cache, billed at the provider's discounted cached-read rate. */
    cachedInputTokens?: number;
    /** Input tokens newly written to a cache this call, billed at the provider's cache-write rate
     * (often a premium over the standard input rate). */
    cacheWriteInputTokens?: number;
    /** Which cache TTL tier `cacheWriteInputTokens` was billed under, when it's nonzero — kept as
     * its own field, deliberately separate from the token count above, because the count alone
     * doesn't say which rate applies (e.g. Anthropic prices a 1-hour cache write at roughly 1.6x
     * a 5-minute one). Always derived from what the gateway itself requested on the outgoing call
     * (its own `cache_control`/equivalent configuration), never inferred from response usage
     * numbers alone — the response has no field that says which TTL was used.
     * - `'5m'` / `'1h'`: the gateway explicitly requested this TTL (or a documented default
     *   applied when the provider allows omitting it).
     * - `'unknown'`: the response reported nonzero cache-write tokens but the gateway has no
     *   record of requesting any particular TTL for this call — the rate cannot be determined,
     *   so cost estimation must not guess (see `pricing.ts`'s `estimateCost`).
     * - absent: no cache-write tokens were reported at all; the question doesn't arise. */
    cacheWriteTtl?: '5m' | '1h' | 'unknown';
    /** Visible/generated output tokens — the actual response content, always disjoint from
     * `reasoningTokens`. */
    outputTokens?: number;
    /** "Thinking"/reasoning tokens the model spent before responding (also called "thought
     * tokens" in some docs) — billed at the output rate by every provider observed so far. */
    reasoningTokens?: number;
    /** Input tokens from tool-execution results fed back to the model on a later turn (e.g.
     * Gemini's `toolUsePromptTokenCount`) — billed at the input rate, but reported by the
     * provider as its own separate component, not nested inside `inputTokens`. */
    toolUseInputTokens?: number;
    /** The provider's own raw total-tokens figure, exactly as reported (e.g. Gemini's
     * `totalTokenCount`, OpenAI's `total_tokens`) — a diagnostic sanity-check value, independent
     * of and never derived from the cost-bucket breakdown above. Absent when the provider doesn't
     * report one at all, rather than computed locally. */
    providerTotalTokens?: number;
    /** Cost in USD as the provider itself reported it in the response (e.g. OpenRouter's
     * `usage.cost`) — always preferred over `estimatedCost` when present. */
    providerReportedCost?: number;
    /** Cost in USD computed locally from the token buckets above and a pricing table entry.
     * `null` (never fabricated as 0) when pricing for this exact provider/model isn't registered.
     * `undefined` when cost estimation was never attempted. */
    estimatedCost?: number | null;
    /** Which of `providerReportedCost`/`estimatedCost` is authoritative for this call — absent
     * when neither is available. */
    costSource?: 'provider-reported' | 'estimated';
    /** The pricing table version (`PRICING_CONFIG_VERSION` in `pricing.ts`) that produced
     * `estimatedCost`, when it was computed — absent when `estimatedCost` is absent, or when cost
     * came from `providerReportedCost` instead (that figure doesn't depend on this table at all).
     * Lets a later-merged report (see `mergeVerificationRecords`) detect and disclose when it
     * combines estimates computed under different pricing snapshots, rather than presenting them
     * as directly comparable. */
    pricingVersion?: string;
}

/** A streamed fragment: text delta and/or a tool-call arg delta, and/or done. */
export interface Chunk {
    text?: string;
    /** `thoughtSignature` — see `ChatMessage.toolCalls`'s doc; a gateway that receives one from the
     * provider on this exact call sets it here so `collect()` can carry it into the persisted
     * message for later replay. Every chunk carrying the same `id` should repeat the same
     * `thoughtSignature` if the provider only sends it once — `collect()` keeps the first
     * non-undefined value it sees per id. */
    toolCall?: { id: string; name: string; argsDelta: string; thoughtSignature?: string };
    done?: boolean;
    /** Optional token/cost accounting, emitted with the final (`done`) chunk when the provider
     * reports it. Supersedes an earlier, less detailed inline shape (`totalTokens`/`cachedTokens`)
     * that both this branch and upstream independently drafted for the same purpose — `UsageInfo`
     * below already covers both (`providerTotalTokens`, `cachedInputTokens`), so this stays the one
     * definition. */
    usage?: UsageInfo;
    /** The model that actually served the request, when the response reports it — distinct from
     * the requested model/route (e.g. OpenRouter's `openrouter/free` may route to a different
     * underlying model than the one requested). Emitted with the final (`done`) chunk. */
    actualModel?: string;
}

/** What a gateway/model supports; check before sending tool definitions. */
export interface LlmGatewayCapabilities {
    /** Whether the gateway/model can emit tool calls. */
    readonly toolCalls: boolean;
}

/** The one outbound LLM dependency, behind a single interface so it can be swapped. */
export interface LlmGateway {
    /** Capability metadata; absent means unspecified (don't assume tool support). */
    readonly capabilities?: LlmGatewayCapabilities;
    chat(req: ChatRequest, opts?: { signal?: AbortSignal }): AsyncIterable<Chunk>;
}
