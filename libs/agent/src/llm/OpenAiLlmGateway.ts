import { PRICING_CONFIG_VERSION, estimateCost } from './pricing';

import type { AgentEnvironmentSupportable } from '../environment';
import type { HttpRequestSupportable } from '../http';
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
 * OpenAI Chat Completions gateway — the first *tool-capable* real-provider gateway.
 *
 * eureka-flows-api's Generate endpoint is text-only and not designed for tool calling (see
 * docs/browser-agent/foundations/provider-tool-calling.md §1), so structured
 * tool-call verification runs directly against provider APIs behind the shared
 * {@link LlmGateway} contract. This gateway declares `capabilities.toolCalls = true` and maps
 * `ToolDef` → OpenAI `tools` / parses `tool_calls` back into {@link Chunk} `toolCall`s.
 *
 * OpenRouter is OpenAI-wire-compatible: point `baseUrl` at `https://openrouter.ai/api/v1`,
 * pass an OpenRouter key + model id, and this same gateway serves it.
 *
 * Non-streaming: one HTTP call, the whole response mapped to chunks — a tool call's full
 * arguments JSON is emitted as a single `argsDelta`, which `BaseAgent.collect()` accumulates
 * and JSON-parses exactly as it does the fake gateway's output.
 */

export interface OpenAiLlmGatewayOptions {
    /** Provides tracing, time, and cancellation. */
    environment: AgentEnvironmentSupportable;
    /** HTTP port. */
    http: HttpRequestSupportable;
    /** API key; sent as the `Authorization: Bearer` header, never traced. */
    apiKey: string;
    /** Defaults to `gpt-4o-mini` (a real, cheap, tool-capable OpenAI model). */
    model?: string;
    /** Override to point at OpenRouter (`https://openrouter.ai/api/v1`) or a proxy. Defaults to the OpenAI API. */
    baseUrl?: string;
    /** Optional generation parameters applied to every request. `reasoningEffort` is sent as
     * `reasoning_effort` only when set — needed for OpenAI's gpt-5.6 family, which (per OpenAI's
     * own error, confirmed 2026-08-07) rejects a `tools`-bearing /v1/chat/completions request
     * outright unless `reasoning_effort` is explicitly `'none'`; every other model this codebase
     * talks to has no such requirement, so this is opt-in, never a hardcoded default. */
    generation?: { temperature?: number; maxOutputTokens?: number; reasoningEffort?: string };
}

/** The OpenAI gateway: the shared contract plus provider/model identity. Tool-capable. */
export interface OpenAiLlmGateway extends LlmGateway {
    readonly capabilities: LlmGatewayCapabilities;
    readonly provider: 'openai';
    readonly model: string;
}

const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const ERROR_BODY_SNIPPET_LENGTH = 200;

/** A provider/proxy could echo request data back; scrub the key before it reaches an error. */
const redactText = (value: string, secret: string): string =>
    secret.length > 0 ? value.split(secret).join('[redacted]') : value;

interface OpenAiToolCall {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
}

interface OpenAiMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    tool_calls?: OpenAiToolCall[];
    tool_call_id?: string;
}

/** Map one provider-neutral chat message onto an OpenAI Chat Completions message. */
const toOpenAiMessage = (message: ChatMessage): OpenAiMessage => {
    if (message.role === 'tool') {
        return { role: 'tool', content: message.content ?? '', tool_call_id: message.toolCallId };
    }
    if (message.role === 'assistant' && message.toolCalls?.length) {
        return {
            role: 'assistant',
            content: message.content ?? null,
            // Our `args` is already the raw JSON string OpenAI expects for `arguments`.
            tool_calls: message.toolCalls.map(tc => ({
                id: tc.id,
                type: 'function',
                function: { name: tc.name, arguments: tc.args },
            })),
        };
    }
    return { role: message.role, content: message.content ?? null };
};

const toOpenAiTool = (tool: ToolDef) => ({
    type: 'function' as const,
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
});

const toOpenAiRequestBody = (req: ChatRequest, model: string, generation?: OpenAiLlmGatewayOptions['generation']) => ({
    model,
    messages: req.messages.map(toOpenAiMessage),
    ...(req.tools.length > 0 ? { tools: req.tools.map(toOpenAiTool), tool_choice: 'auto' } : {}),
    ...(generation?.temperature !== undefined ? { temperature: generation.temperature } : {}),
    ...(generation?.maxOutputTokens !== undefined ? { max_tokens: generation.maxOutputTokens } : {}),
    ...(generation?.reasoningEffort !== undefined ? { reasoning_effort: generation.reasoningEffort } : {}),
});

interface OpenAiUsage {
    /** Total prompt tokens — already INCLUDES `prompt_tokens_details.cached_tokens` (and
     * `cache_write_tokens`, when present): both are documented as breakdowns *of*
     * `prompt_tokens`, not additional tokens on top of it. Subtracted below so the normalized
     * `inputTokens` never double-counts either. */
    prompt_tokens?: number;
    /** Total completion tokens — already INCLUDES `completion_tokens_details.reasoning_tokens`
     * for reasoning models (confirmed: "reasoning tokens are already a subset of
     * completion_tokens"). Subtracted below for the same reason as the cached-token case above. */
    completion_tokens?: number;
    total_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
    completion_tokens_details?: { reasoning_tokens?: number };
    /** OpenRouter-only: the actual USD cost of this generation, computed by OpenRouter itself
     * from whichever underlying model/provider it routed to plus its own markup — always
     * preferred over a local estimate (see `estimateCost` in pricing.ts, and this gateway's own
     * `isDirectOpenAi` guard, which skips local estimation entirely whenever a baseUrl override
     * — OpenRouter or otherwise — is in play). Never present on a direct OpenAI response. */
    cost?: number;
}

interface OpenAiResponse {
    choices?: Array<{ message?: { content?: string | null; tool_calls?: OpenAiToolCall[] } }>;
    usage?: OpenAiUsage;
    /** The model that actually served the request. Matters most through OpenRouter, where a
     * route like `openrouter/free` can be served by a different underlying model than requested. */
    model?: string;
}

/**
 * Maps OpenAI/OpenRouter's `usage` onto the normalized {@link UsageInfo} shape. `isDirectOpenAi`
 * gates local cost estimation: this gateway is reused (via `baseUrl` override) for OpenRouter,
 * DeepSeek, Qwen, and GLM (see `providerRegistry.ts`), none of which share OpenAI's own pricing —
 * `pricing.ts`'s table only has genuine OpenAI rates, so estimating against it for a
 * baseUrl-overridden call would silently produce a wrong number for a different provider entirely.
 * OpenRouter's own `usage.cost` (when present) is surfaced as `providerReportedCost` regardless of
 * `isDirectOpenAi` — that value comes from OpenRouter itself, never computed locally.
 */
/**
 * Whether `cache_write_tokens` can be trusted as a subset of `prompt_tokens` for THIS call.
 *
 * OpenAI's own prompt-caching guide documents `cache_write_tokens` as a breakdown component of
 * `prompt_tokens` (its worked example: 2,006 `prompt_tokens` = 1,920 `cached_tokens` + 0
 * `cache_write_tokens` + the rest uncached) — that's the confirmed, INTENDED relationship, so
 * subtracting it to get `inputTokens` is not a guess in the normal case.
 *
 * But OpenAI has also confirmed a real billing bug in this exact accounting: a user reported
 * `cached_tokens` (3,945) + `cache_write_tokens` (4,580) summing to nearly double
 * `prompt_tokens` (4,583) for "certain types of requests," and OpenAI staff confirmed it as a
 * genuine misreporting bug (since fixed, with refunds issued) — see
 * community.openai.com/t/question-about-gpt-5-6-api-cache-read-write-token-billing/1386256.
 * That bug report never specified exactly which request types were affected, so a single
 * internal-consistency check (does `cached_tokens + cache_write_tokens` exceed `prompt_tokens`?)
 * cannot be trusted as a complete detector — it would have caught THAT particular incident, but
 * offers no guarantee against a different failure mode in the same still-new (GPT-5.6+ only)
 * feature. Given that, ANY nonzero `cache_write_tokens` is treated as making the cost calculation
 * ambiguous, not just the specific inconsistent-sum case — the raw field is still preserved on
 * `UsageInfo.cacheWriteInputTokens` either way (never dropped), only `estimatedCost` is withheld.
 */
const isCacheWriteAmbiguous = (cacheWriteTokens: number | undefined): boolean =>
    cacheWriteTokens !== undefined && cacheWriteTokens > 0;

const toUsageInfo = (usage: OpenAiUsage | undefined, model: string, isDirectOpenAi: boolean): UsageInfo | undefined => {
    if (!usage) return undefined;

    const promptTokens = usage.prompt_tokens;
    const cachedTokens = usage.prompt_tokens_details?.cached_tokens;
    const cacheWriteTokens = usage.prompt_tokens_details?.cache_write_tokens;
    const inputTokens =
        promptTokens !== undefined
            ? Math.max(promptTokens - (cachedTokens ?? 0) - (cacheWriteTokens ?? 0), 0)
            : undefined;

    const completionTokens = usage.completion_tokens;
    const reasoningTokens = usage.completion_tokens_details?.reasoning_tokens;
    const outputTokens =
        completionTokens !== undefined ? Math.max(completionTokens - (reasoningTokens ?? 0), 0) : undefined;

    const normalized: UsageInfo = {
        ...(inputTokens !== undefined ? { inputTokens } : {}),
        ...(cachedTokens !== undefined ? { cachedInputTokens: cachedTokens } : {}),
        ...(cacheWriteTokens !== undefined ? { cacheWriteInputTokens: cacheWriteTokens } : {}),
        ...(outputTokens !== undefined ? { outputTokens } : {}),
        ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
        ...(usage.total_tokens !== undefined ? { providerTotalTokens: usage.total_tokens } : {}),
        ...(usage.cost !== undefined ? { providerReportedCost: usage.cost } : {}),
    };

    // Provider-reported cost (OpenRouter) is authoritative regardless of our own token-bucket
    // math — it's OpenRouter's own number, not derived from prompt_tokens_details at all.
    if (usage.cost !== undefined) {
        return { ...normalized, costSource: 'provider-reported' };
    }
    if (isDirectOpenAi) {
        if (isCacheWriteAmbiguous(cacheWriteTokens)) {
            return { ...normalized, estimatedCost: null };
        }
        const estimated = estimateCost('openai', model, normalized);
        return {
            ...normalized,
            estimatedCost: estimated,
            ...(estimated !== null ? { costSource: 'estimated', pricingVersion: PRICING_CONFIG_VERSION } : {}),
        };
    }
    return normalized;
};

/** LlmGateway backed by OpenAI's Chat Completions API; tool-capable (declares `toolCalls: true`). */
export const createOpenAiLlmGateway = (options: OpenAiLlmGatewayOptions): OpenAiLlmGateway => {
    const { environment, http, apiKey } = options;
    const model = options.model ?? DEFAULT_MODEL;
    const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    // Gates local cost estimation — see toUsageInfo's doc for why a baseUrl override (OpenRouter,
    // DeepSeek, Qwen, GLM) must never be priced against pricing.ts's OpenAI-only rates.
    const isDirectOpenAi = baseUrl === DEFAULT_BASE_URL;
    const trace = environment.traceReporter;

    async function* chat(req: ChatRequest, opts?: { signal?: AbortSignal }): AsyncIterable<Chunk> {
        const startedAt = environment.now();
        const body = toOpenAiRequestBody(req, model, options.generation);

        trace?.debug('llm.openai.request', {
            model,
            messageCount: req.messages.length,
            toolCount: req.tools.length,
        });

        const response = await http.request({
            method: 'POST',
            url: `${baseUrl}/chat/completions`,
            headers: { authorization: `Bearer ${apiKey}` },
            body,
            ...(opts?.signal ? { signal: opts.signal } : {}),
        });

        if (!response.ok) {
            const errorBody = await response.text().catch(() => '');
            const safeBody = redactText(errorBody, apiKey);

            trace?.error('llm.openai.error', { model, status: response.status });
            throw new Error(
                `OpenAI request failed with status ${response.status}: ${safeBody.slice(0, ERROR_BODY_SNIPPET_LENGTH)}`
            );
        }

        const payload = (await response.json()) as OpenAiResponse;
        const message = payload.choices?.[0]?.message;

        if (!message) {
            trace?.error('llm.openai.error', { model, status: response.status, reason: 'no choices' });
            throw new Error('OpenAI response contained no choices');
        }

        const toolCalls = message.tool_calls ?? [];
        const usage = toUsageInfo(payload.usage, model, isDirectOpenAi);

        trace?.debug('llm.openai.response', {
            model,
            status: response.status,
            hasText: typeof message.content === 'string' && message.content.length > 0,
            toolCallCount: toolCalls.length,
            durationMs: environment.now() - startedAt,
            ...(usage ? { usage } : {}),
        });

        // A tool-call turn legitimately has `content: null` — unlike the text-only gateways,
        // an empty content field here is not an error.
        if (typeof message.content === 'string' && message.content.length > 0) {
            yield { text: message.content };
        }
        for (const call of toolCalls) {
            yield { toolCall: { id: call.id, name: call.function.name, argsDelta: call.function.arguments } };
        }
        yield {
            done: true,
            ...(usage ? { usage } : {}),
            ...(payload.model ? { actualModel: payload.model } : {}),
        };
    }

    return {
        capabilities: { toolCalls: true },
        provider: 'openai',
        model,
        chat,
    };
};
