import { PRICING_CONFIG_VERSION, estimateCost } from './pricing';
import { NoopTracer } from '../trace';

import type { HttpClient } from '../http';
import type { Tracer } from '../trace';
import type {
    ChatMessage,
    ChatRequest,
    Chunk,
    LlmGateway,
    LlmGatewayCapabilities,
    ToolDef,
    UsageInfo,
} from './llmGateway';

/**
 * Tool-capable Claude gateway — Anthropic's Messages API (`/v1/messages`) with `tools`.
 *
 * Native gateway, not a `createOpenAiLlmGateway` `baseUrl` reuse: Anthropic's wire format differs
 * from OpenAI's in every place that matters here — `x-api-key` instead of `Authorization: Bearer`,
 * a required `anthropic-version` header, `input_schema` instead of `parameters`, a required
 * `max_tokens`, a top-level `system` field instead of a `role: 'system'` message, and a response
 * `content` array mixing text and `tool_use` blocks instead of separate fields. See
 * docs/browser-agent/design/provider-tool-calling.md §2 for the full mapping.
 *
 * Single-turn tool calling and multi-turn tool-result mapping are both implemented. Unlike Gemini
 * (which correlates tool results by function *name* and has no way to map `toolCallId`-keyed tool
 * messages), Anthropic correlates a tool result to the call it answers by `id` (`tool_use_id`) —
 * the exact same identifier as `ChatMessage.toolCallId` — so the round-trip is a direct mapping,
 * not a guess: an assistant tool-call message becomes an assistant `content[]` block array
 * (`{ type: 'tool_use', id, name, input }`, plus a leading `{ type: 'text', ... }` block if the
 * message also carries text), and a tool-result message becomes a **user** message
 * (`role: 'user'`) with one `{ type: 'tool_result', tool_use_id, content }` block — Anthropic has
 * no separate `role: 'tool'`, tool results are sent back as the user turn per the Messages API.
 * Offline-verified only (`AnthropicToolLlmGateway.spec.ts`); no real Anthropic API call has been
 * made — see `providerRegistry.ts`'s `ANTHROPIC_ENTRY`.
 */

export interface AnthropicToolLlmGatewayOptions {
    /** HTTP port. */
    http: HttpClient;
    /** Trace port; defaults to {@link NoopTracer}. Provider-specific request/response/error events. */
    tracer?: Tracer;
    /** Injectable clock for deterministic duration in tests; defaults to `Date.now`. */
    now?: () => number;
    /** Anthropic API key; sent as the x-api-key header, never traced. */
    apiKey: string;
    /** Defaults to claude-haiku-4-5. */
    model?: string;
    /** Override to route through a backend proxy. Defaults to the Anthropic API. */
    baseUrl?: string;
    /** Optional generation parameters. `maxOutputTokens` defaults to DEFAULT_MAX_TOKENS — Anthropic requires max_tokens on every request. */
    generation?: { temperature?: number; maxOutputTokens?: number };
    /**
     * Opt into Anthropic prompt caching for every call this gateway instance makes, via a
     * top-level `cache_control` field (Anthropic's "automatic caching" mode — the system manages
     * breakpoints itself; see docs/en/build-with-claude/prompt-caching). Omit entirely to never
     * request caching at all (the default — matches this gateway's behavior before this option
     * existed).
     *
     * `ttl` selects which cache-write rate a resulting cache-write is billed at
     * (`ModelPricing.cacheWritePerMillion` for `'5m'`, `cacheWrite1hPerMillion` for `'1h'`) —
     * omitting it requests Anthropic's own documented default, which is `'5m'`, and this gateway
     * treats it as exactly that for billing purposes, not as "unknown."
     *
     * This is deliberately the ONLY source of truth for `cacheWriteTtl` on the resulting
     * `UsageInfo` — never inferred from the response's usage numbers, which carry no field
     * indicating which TTL a reported `cache_creation_input_tokens` was actually billed under.
     */
    cacheControl?: { ttl?: '5m' | '1h' };
}

/** The tool-capable Claude gateway: the shared contract plus provider/model identity. */
export interface AnthropicToolLlmGateway extends LlmGateway {
    readonly capabilities: LlmGatewayCapabilities;
    readonly provider: 'anthropic';
    readonly model: string;
}

const DEFAULT_MODEL = 'claude-haiku-4-5';
const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const ANTHROPIC_VERSION = '2023-06-01';
/** Anthropic requires max_tokens on every request; 1024 matches the value used throughout
 * Anthropic's own docs examples. Exported so `providerRegistry.ts`'s `deriveGenerationConfiguration`
 * can report the EXACT value this gateway actually sends when the caller doesn't override it,
 * rather than re-hardcoding (and risking drifting from) this number in a second place. */
export const DEFAULT_MAX_TOKENS = 1024;
const ERROR_BODY_SNIPPET_LENGTH = 200;

/** A provider/proxy could echo request data back; scrub the key before it reaches an error. */
const redactText = (value: string, secret: string): string =>
    secret.length > 0 ? value.split(secret).join('[redacted]') : value;

const toAnthropicTool = (tool: ToolDef) => ({
    name: tool.name,
    description: tool.description,
    // Anthropic's input_schema is plain JSON Schema with lowercase `type` values — the exact shape
    // our own JsonSchema already uses, so this is a direct passthrough (unlike Gemini, which needs
    // an uppercase-type conversion).
    input_schema: tool.parameters,
});

/** Outbound content-block shapes only (`tool_use`/`tool_result` requests) — distinct from
 * {@link AnthropicContentBlock}, which types the response side and has no `tool_use_id`/`content`. */
interface AnthropicRequestContentBlock {
    type: 'text' | 'tool_use' | 'tool_result';
    text?: string;
    id?: string;
    name?: string;
    input?: unknown;
    tool_use_id?: string;
    content?: string;
}

interface AnthropicMessage {
    role: 'user' | 'assistant';
    content: string | AnthropicRequestContentBlock[];
}

/**
 * Map one provider-neutral chat message onto an Anthropic Messages API message. Anthropic has no
 * separate `role: 'tool'` — a tool result goes back as a `user` message carrying a `tool_result`
 * block, correlated to its call by `tool_use_id` (our own `toolCallId`, unchanged). An assistant
 * tool-call turn becomes a `content[]` array: a leading `text` block if the turn also has text,
 * then one `tool_use` block per call, with `input` as a parsed object (`args` is a JSON string on
 * our side, matching every other gateway's `ChatMessage.toolCalls[].args` contract).
 */
const toAnthropicMessage = (message: ChatMessage): AnthropicMessage => {
    if (message.role === 'tool') {
        return {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: message.toolCallId ?? '', content: message.content ?? '' }],
        };
    }
    if (message.role === 'assistant' && (message.toolCalls?.length ?? 0) > 0) {
        const blocks: AnthropicRequestContentBlock[] = [];
        if (message.content) {
            blocks.push({ type: 'text', text: message.content });
        }
        for (const call of message.toolCalls ?? []) {
            blocks.push({ type: 'tool_use', id: call.id, name: call.name, input: JSON.parse(call.args) });
        }
        return { role: 'assistant', content: blocks };
    }
    return { role: message.role as 'user' | 'assistant', content: message.content ?? '' };
};

/** Map the provider-neutral request onto Anthropic's Messages API shape: system pulled out to its
 * own top-level field, tools mapped to input_schema. `cacheControl`, when present, adds a
 * top-level `cache_control` field (Anthropic's "automatic caching" mode) with the explicit `ttl`
 * the caller configured — see `AnthropicToolLlmGatewayOptions.cacheControl`'s own doc for why this
 * is the gateway's only source of truth for the TTL a resulting cache-write is billed under. */
const toAnthropicRequest = (
    req: ChatRequest,
    model: string,
    generation?: AnthropicToolLlmGatewayOptions['generation'],
    cacheControl?: AnthropicToolLlmGatewayOptions['cacheControl']
) => {
    const systemTexts: string[] = [];
    const messages: AnthropicMessage[] = [];

    for (const message of req.messages) {
        if (message.role === 'system') {
            systemTexts.push(message.content ?? '');
            continue;
        }
        messages.push(toAnthropicMessage(message));
    }

    return {
        model,
        max_tokens: generation?.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
        messages,
        ...(systemTexts.length > 0 ? { system: systemTexts.join('\n\n') } : {}),
        ...(req.tools.length > 0 ? { tools: req.tools.map(toAnthropicTool) } : {}),
        ...(generation?.temperature !== undefined ? { temperature: generation.temperature } : {}),
        ...(cacheControl
            ? { cache_control: { type: 'ephemeral', ...(cacheControl.ttl ? { ttl: cacheControl.ttl } : {}) } }
            : {}),
    };
};

interface AnthropicContentBlock {
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: unknown;
}

interface AnthropicUsage {
    /** Tokens NOT read from or used to create a cache (tokens after the last cache breakpoint) —
     * unlike Gemini/OpenAI, this is ALREADY disjoint from the two cache fields below (Anthropic's
     * own docs: total input = cache_read_input_tokens + cache_creation_input_tokens +
     * input_tokens), so — unlike those two gateways — no subtraction is needed here; this maps
     * straight onto the normalized `inputTokens`. */
    input_tokens?: number;
    output_tokens?: number;
    /** Tokens read from a previously-written cache, billed at Anthropic's discounted cache-read
     * rate (10% of base input price). */
    cache_read_input_tokens?: number;
    /** Tokens newly written to a cache this call, billed at a premium over the base input rate
     * (1.25x for a 5-minute cache, 2x for a 1-hour cache — see pricing.ts's own caveat about only
     * the 5-minute rate being modeled). */
    cache_creation_input_tokens?: number;
}

interface AnthropicResponse {
    content?: AnthropicContentBlock[];
    stop_reason?: string;
    usage?: AnthropicUsage;
    /** The model that actually served the request, e.g. the pinned snapshot a bare alias like
     * `claude-haiku-4-5` resolved to. Typed `unknown`, not `string` — this is straight off
     * `JSON.parse`, so a malformed/misbehaving response body could hand back anything; see
     * {@link asNonEmptyString} for the runtime check that decides whether to trust it. */
    model?: unknown;
}

/** `payload.model` is untrusted JSON, not a value this code controls — never assume it's a
 * string just because the response type says so. Absent, empty, or non-string all map to
 * `undefined` (never fabricated from the requested model) — mirrors OpenAI's `Chunk.actualModel`
 * convention but with an explicit runtime type check, since Anthropic's response shape here is
 * declared `unknown` rather than `string`. */
const asNonEmptyString = (value: unknown): string | undefined =>
    typeof value === 'string' && value.length > 0 ? value : undefined;

/**
 * Maps Anthropic's `usage` onto the normalized {@link UsageInfo} shape. Anthropic's own
 * `input_tokens` already excludes both cache fields (see {@link AnthropicUsage.input_tokens}'s
 * doc) — the opposite convention from Gemini/OpenAI, where the raw prompt-token count includes
 * the cached portion and the gateway has to subtract it out. No reasoning/thinking-token or
 * tool-use-prompt-token concept exists in this API's `usage` object (Claude's extended thinking,
 * when enabled, surfaces as content blocks, not a separate usage count) — left undefined rather
 * than guessed. Anthropic's Messages API also reports no total-tokens figure, so
 * `providerTotalTokens` stays undefined too, never locally summed and passed off as
 * provider-reported.
 *
 * `requestedCacheTtl` is this call's effective TTL as derived from `options.cacheControl` (the
 * request the gateway actually sent) — NOT read from `usage` itself, which carries no field
 * indicating which TTL a reported `cache_creation_input_tokens` was billed under (requirement:
 * never infer TTL from response usage alone). When `cache_creation_input_tokens` is reported and
 * nonzero, `cacheWriteTtl` becomes `requestedCacheTtl` if known, or the explicit literal
 * `'unknown'` if this call never configured `cacheControl` at all (a cache write happening
 * without us having requested one is unexpected, and cannot be safely priced at either rate).
 * Exactly 0 cache-write tokens sets no TTL at all — there's nothing to price, so nothing to
 * disambiguate.
 */
const toUsageInfo = (
    usage: AnthropicUsage | undefined,
    model: string,
    requestedCacheTtl: '5m' | '1h' | undefined
): UsageInfo | undefined => {
    if (!usage) return undefined;

    const cacheWriteInputTokens = usage.cache_creation_input_tokens;
    const cacheWriteTtl =
        cacheWriteInputTokens !== undefined && cacheWriteInputTokens > 0 ? (requestedCacheTtl ?? 'unknown') : undefined;

    const normalized: UsageInfo = {
        ...(usage.input_tokens !== undefined ? { inputTokens: usage.input_tokens } : {}),
        ...(usage.cache_read_input_tokens !== undefined ? { cachedInputTokens: usage.cache_read_input_tokens } : {}),
        ...(cacheWriteInputTokens !== undefined ? { cacheWriteInputTokens } : {}),
        ...(cacheWriteTtl !== undefined ? { cacheWriteTtl } : {}),
        ...(usage.output_tokens !== undefined ? { outputTokens: usage.output_tokens } : {}),
    };

    const estimated = estimateCost('anthropic', model, normalized);
    return {
        ...normalized,
        estimatedCost: estimated,
        ...(estimated !== null ? { costSource: 'estimated', pricingVersion: PRICING_CONFIG_VERSION } : {}),
    };
};

/** LlmGateway backed by Anthropic's Messages API with tool use; declares `toolCalls: true`. */
export const createAnthropicToolLlmGateway = (options: AnthropicToolLlmGatewayOptions): AnthropicToolLlmGateway => {
    const { http, apiKey } = options;
    const tracer = options.tracer ?? NoopTracer;
    const now = options.now ?? Date.now;
    const model = options.model ?? DEFAULT_MODEL;
    const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    // The single source of truth for cacheWriteTtl billing — see cacheControl's own doc for why
    // this, and never the response, decides which TTL a cache-write is priced under. Omitting
    // `ttl` while cacheControl is present requests Anthropic's documented default, which is '5m'.
    const effectiveCacheWriteTtl: '5m' | '1h' | undefined = options.cacheControl
        ? (options.cacheControl.ttl ?? '5m')
        : undefined;

    async function* chat(req: ChatRequest, opts?: { signal?: AbortSignal }): AsyncIterable<Chunk> {
        const startedAt = now();
        const body = toAnthropicRequest(req, model, options.generation, options.cacheControl);

        tracer.emit({
            name: 'llm.anthropic.request',
            fields: { model, messageCount: req.messages.length, toolCount: req.tools.length },
        });

        const response = await http.request({
            method: 'POST',
            url: `${baseUrl}/v1/messages`,
            headers: { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION },
            body,
            ...(opts?.signal ? { signal: opts.signal } : {}),
        });

        if (!response.ok) {
            const errorBody = await response.text().catch(() => '');
            const safeBody = redactText(errorBody, apiKey);

            tracer.emit({ name: 'llm.anthropic.error', level: 'error', fields: { model, status: response.status } });
            throw new Error(
                `Anthropic request failed with status ${response.status}: ${safeBody.slice(0, ERROR_BODY_SNIPPET_LENGTH)}`
            );
        }

        const payload = (await response.json()) as AnthropicResponse;
        const content = payload.content;

        if (!content || content.length === 0) {
            tracer.emit({
                name: 'llm.anthropic.error',
                level: 'error',
                fields: { model, status: response.status, reason: 'no content blocks' },
            });
            throw new Error('Anthropic response contained no content blocks');
        }

        let text = '';
        const toolUses: Array<{ id: string; name: string; input: unknown }> = [];
        for (const block of content) {
            if (block.type === 'text' && block.text) {
                text += block.text;
            }
            if (block.type === 'tool_use' && block.id && block.name) {
                toolUses.push({ id: block.id, name: block.name, input: block.input ?? {} });
            }
        }

        const usage = toUsageInfo(payload.usage, model, effectiveCacheWriteTtl);
        const actualModel = asNonEmptyString(payload.model);

        tracer.emit({
            name: 'llm.anthropic.response',
            fields: {
                model,
                status: response.status,
                stopReason: payload.stop_reason,
                textLength: text.length,
                toolCallCount: toolUses.length,
                durationMs: now() - startedAt,
                ...(usage ? { usage } : {}),
                ...(actualModel !== undefined ? { actualModel } : {}),
            },
        });

        if (text) {
            yield { text };
        }
        for (const call of toolUses) {
            yield { toolCall: { id: call.id, name: call.name, argsDelta: JSON.stringify(call.input) } };
        }
        yield { done: true, ...(usage ? { usage } : {}), ...(actualModel !== undefined ? { actualModel } : {}) };
    }

    return {
        capabilities: { toolCalls: true },
        provider: 'anthropic',
        model,
        chat,
    };
};
