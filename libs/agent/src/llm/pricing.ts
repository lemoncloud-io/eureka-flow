import type { UsageInfo } from './llmGateway';

/**
 * Versioned, model-specific pricing table, deliberately kept outside every gateway implementation
 * (gateways only ever deal in token counts — see `UsageInfo` in `llmGateway.ts` — never in USD).
 * Consulted only by {@link estimateCost}, itself only called by the real-provider verification
 * runners (`realLocatorScenarios.spec.ts` and friends) after a live call — never invented, never
 * run without a real usage report to price.
 *
 * Rates are USD per 1,000,000 tokens, sourced from each provider's own public pricing page at the
 * time `PRICING_CONFIG_VERSION` was last bumped (see each entry's own comment for the exact
 * source and date). Pricing changes over time and this table is a point-in-time snapshot, not a
 * live feed — bump `PRICING_CONFIG_VERSION` whenever an entry changes so a stale estimate is at
 * least traceable to the config version that produced it.
 *
 * Only models actually registered in `providerRegistry.ts` are priced here. A model missing from
 * this table — including every OpenRouter route, deliberately never priced locally (see
 * `estimateCost`'s doc) — makes {@link getModelPricing} return `null`, which {@link estimateCost}
 * propagates as `null`, never a fabricated 0.
 */
export const PRICING_CONFIG_VERSION = '2026-07-31';

/** The single currency every cost figure in this codebase is denominated in — `providerReportedCost`
 * (OpenRouter's own `usage.cost`), every rate in {@link PRICING_TABLE}, and therefore every
 * `estimatedCost` this module produces. Shared by `ModelPricing.currency` and
 * `VerificationMetricsReport.costCurrency` so both stay in sync from one declaration. Introducing a
 * genuinely different-currency provider would need this to become per-entry rather than global —
 * not a change to make casually, since every consumer currently assumes one report-wide currency. */
export const COST_CURRENCY = 'USD';

export interface ModelPricing {
    /** ISO 4217 currency code every rate below is denominated in. Every entry in this table is
     * currently USD; the field exists so a future non-USD entry can't be silently summed against
     * a USD one — see `estimateCost`'s doc and the currency-mixing guard in
     * `verificationMetrics.ts`'s aggregation. */
    currency: typeof COST_CURRENCY;
    /** USD per 1M tokens billed at the standard (non-cached, non-tool-use) input rate. */
    inputPerMillion: number;
    /** USD per 1M cached-read input tokens. Omit only if the provider genuinely has no cached-read
     * discount for this model — never omit merely because a rate wasn't looked up. */
    cachedInputPerMillion?: number;
    /** USD per 1M cache-write input tokens at the provider's shorter/default TTL tier (e.g.
     * Anthropic's 5-minute cache write; often a premium over the standard input rate). Omit when
     * the provider doesn't report a cache-write token count for this model at all. Selected only
     * when `UsageInfo.cacheWriteTtl === '5m'` — see `estimateCost`'s doc for the other TTL cases. */
    cacheWritePerMillion?: number;
    /** USD per 1M cache-write input tokens at the provider's longer TTL tier (e.g. Anthropic's
     * 1-hour cache write) — a genuinely different rate from `cacheWritePerMillion`, not a variant
     * of it. Omit when the provider has no separate long-TTL cache-write tier at all. Selected
     * only when `UsageInfo.cacheWriteTtl === '1h'`. */
    cacheWrite1hPerMillion?: number;
    /** USD per 1M visible output tokens. */
    outputPerMillion: number;
    /** USD per 1M reasoning/thinking tokens. Every provider observed so far bills these at the
     * plain output rate (Gemini, OpenAI) — omit to fall back to `outputPerMillion` automatically;
     * only set this explicitly if a provider is ever found to bill reasoning differently. */
    reasoningPerMillion?: number;
    /** Prompt-side token count (`inputTokens + cachedInputTokens`, i.e. the full prompt before the
     * uncached/cached split) above which this model switches to a different, unmodeled pricing
     * tier — the rates above apply only at or below this threshold. When set, `estimateCost`
     * returns `null` for any call whose prompt size exceeds it, rather than silently applying the
     * wrong tier's rate. Omit for models with no documented tier break. */
    longContextThresholdTokens?: number;
    /** Free-text source citation for this entry — required so a stale or wrong rate can be traced
     * back to where it came from and re-verified, not just silently trusted. */
    source: string;
}

type PricingTable = Record<string, Record<string, ModelPricing>>;

/**
 * Google AI (ai.google.dev/gemini-api/docs/pricing), fetched 2026-07-31. "Standard" (non-audio,
 * ≤200k-token) tier only — Gemini 2.5 Pro's >200k tier ($2.50/$15/$0.25) is NOT modeled here; a
 * long-context 2.5 Pro call would under-estimate until this table grows a context-length-aware
 * tier. Cached rate is the text/image/video column, not the audio column.
 */
const GEMINI_PRICING: Record<string, ModelPricing> = {
    'gemini-2.5-flash': {
        currency: 'USD',
        inputPerMillion: 0.3,
        cachedInputPerMillion: 0.03,
        outputPerMillion: 2.5,
        source: 'ai.google.dev/gemini-api/docs/pricing, fetched 2026-07-31 (standard tier)',
    },
    'gemini-2.5-pro': {
        currency: 'USD',
        inputPerMillion: 1.25,
        cachedInputPerMillion: 0.125,
        outputPerMillion: 10.0,
        // Above this prompt size, Gemini switches to the $2.50/$15/$0.25 tier (not modeled here)
        // — estimateCost returns null past this point rather than silently applying this rate.
        longContextThresholdTokens: 200_000,
        source:
            'ai.google.dev/gemini-api/docs/pricing, fetched 2026-07-31 (standard tier, ≤200k tokens ' +
            'only — the >200k tier at $2.50/$15/$0.25 is not modeled here)',
    },
    'gemini-3-flash-preview': {
        currency: 'USD',
        inputPerMillion: 0.5,
        cachedInputPerMillion: 0.05,
        outputPerMillion: 3.0,
        source:
            'ai.google.dev/gemini-api/docs/pricing, fetched 2026-07-31 — preview model id, pricing ' +
            'may change or the model may be retired without notice, same caveat providerRegistry.ts ' +
            'already carries for this entry',
    },
    'gemini-2.5-flash-lite': {
        currency: 'USD',
        inputPerMillion: 0.1,
        cachedInputPerMillion: 0.01,
        outputPerMillion: 0.4,
        source:
            "OpenRouter's public Models API (GET https://openrouter.ai/api/v1/models), fetched " +
            "2026-08-04 — a cross-provider mirror of Google's own rate, not Google's pricing page " +
            'directly; re-verify against ai.google.dev/gemini-api/docs/pricing before trusting at scale.',
    },
    'gemini-3.1-pro-preview': {
        currency: 'USD',
        inputPerMillion: 2.0,
        cachedInputPerMillion: 0.2,
        outputPerMillion: 12.0,
        // OpenRouter's own listing documents a >200k-token override tier ($4/$18) for this model —
        // not modeled here, same standard-tier-only convention as gemini-2.5-pro above.
        longContextThresholdTokens: 200_000,
        source:
            "OpenRouter's public Models API (GET https://openrouter.ai/api/v1/models), fetched " +
            '2026-08-04 — preview model id, pricing may change or the model may be retired without ' +
            "notice; sourced from OpenRouter's mirror, not Google's pricing page directly.",
    },
};

/**
 * OpenAI (developers.openai.com/api/docs/pricing), fetched 2026-07-31. No `cacheWritePerMillion`
 * on any entry — deliberately, not an oversight. `cache_write_tokens` (GPT-5.6+ models only) is
 * documented as a subset of `prompt_tokens` in OpenAI's own prompt-caching guide, but OpenAI has
 * also confirmed a real billing bug where `cached_tokens + cache_write_tokens` summed to nearly
 * double `prompt_tokens` for "certain types of requests" (community.openai.com/t/question-about-
 * gpt-5-6-api-cache-read-write-token-billing/1386256, confirmed by OpenAI staff, refunds issued),
 * without pinning down which request types were affected. `OpenAiLlmGateway.ts`'s
 * `isCacheWriteAmbiguous` treats any nonzero `cache_write_tokens` as making the cost calculation
 * ambiguous and returns `estimatedCost: null` before this table is ever consulted for that
 * bucket — so a rate here would never actually be used, and isn't configured to avoid implying
 * otherwise. None of the three OpenAI models registered in `providerRegistry.ts` as of this
 * writing are GPT-5.6+; this only becomes relevant if one is added.
 */
const OPENAI_PRICING: Record<string, ModelPricing> = {
    'gpt-4o-mini': {
        currency: 'USD',
        inputPerMillion: 0.15,
        cachedInputPerMillion: 0.075,
        outputPerMillion: 0.6,
        source: 'developers.openai.com/api/docs/pricing, fetched 2026-07-31',
    },
    'gpt-4.1-mini': {
        currency: 'USD',
        inputPerMillion: 0.4,
        cachedInputPerMillion: 0.1,
        outputPerMillion: 1.6,
        source: 'developers.openai.com/api/docs/pricing, fetched 2026-07-31',
    },
    'gpt-5-mini': {
        currency: 'USD',
        inputPerMillion: 0.25,
        cachedInputPerMillion: 0.025,
        outputPerMillion: 2.0,
        source: 'developers.openai.com/api/docs/pricing, fetched 2026-07-31',
    },
    'gpt-4.1': {
        currency: 'USD',
        inputPerMillion: 2.0,
        cachedInputPerMillion: 0.5,
        outputPerMillion: 8.0,
        source:
            "OpenRouter's public Models API (GET https://openrouter.ai/api/v1/models), fetched " +
            "2026-08-04 — a cross-provider mirror of OpenAI's own rate, not OpenAI's pricing page " +
            'directly; re-verify against developers.openai.com/api/docs/pricing before trusting at scale.',
    },
};

/**
 * Anthropic (platform.claude.com/docs/en/about-claude/pricing), fetched 2026-07-31. Both
 * cache-write TTL tiers are modeled: `cacheWritePerMillion` is the 5-minute rate,
 * `cacheWrite1hPerMillion` the 1-hour rate — `estimateCost` selects between them using
 * `UsageInfo.cacheWriteTtl`, which `AnthropicToolLlmGateway.ts` derives from what the gateway
 * itself requested via `cache_control` on the outgoing request, never from response usage alone
 * (see that file's own doc). A cache-write call with no determinable TTL (`cacheWriteTtl ===
 * 'unknown'`) is priced as `null` by `estimateCost`, not silently assigned either rate.
 *
 * Unmodeled, documented residual risk: Anthropic's pricing page states "Claude 4.6 and later
 * models... include the full 1M token context window at standard pricing" — a guarantee that
 * explicitly does NOT list Haiku 4.5 (a "4.5" model). The same page's main rate table shows only
 * one rate row for Haiku 4.5, with no second, higher-context row the way Gemini 2.5 Pro has one —
 * so there is no evidence of a documented second tier to model, but the absence of the 4.6+
 * flat-pricing guarantee for this specific model was not independently resolved beyond that. If
 * Haiku 4.5 does have an undocumented long-context tier, this table would under-estimate for a
 * long-context call the same way the pre-fix Gemini 2.5 Pro gap did — re-verify before trusting a
 * very-long-prompt Haiku 4.5 estimate.
 */
const ANTHROPIC_PRICING: Record<string, ModelPricing> = {
    'claude-haiku-4-5': {
        currency: 'USD',
        inputPerMillion: 1.0,
        cachedInputPerMillion: 0.1,
        cacheWritePerMillion: 1.25,
        cacheWrite1hPerMillion: 2.0,
        outputPerMillion: 5.0,
        source: 'platform.claude.com/docs/en/about-claude/pricing, fetched 2026-07-31',
    },
    'claude-sonnet-5': {
        currency: 'USD',
        // Standard pricing ($3/$15), effective starting September 1, 2026 — NOT the temporary
        // introductory pricing ($2/$10 through August 31, 2026), matching this table's convention
        // of not modeling time-boxed promotional rates (same reasoning as the un-modeled long-context
        // tiers elsewhere in this file). Re-check after that date if trusting this for a near-term
        // real-key run priced before the standard rate takes effect.
        inputPerMillion: 3.0,
        cachedInputPerMillion: 0.3,
        cacheWritePerMillion: 3.75,
        cacheWrite1hPerMillion: 6.0,
        outputPerMillion: 15.0,
        source: 'platform.claude.com/docs/en/about-claude/pricing, fetched 2026-08-04',
    },
};

/**
 * OpenRouter is deliberately absent from this table: per-route pricing depends on which
 * underlying model OpenRouter actually serves the request to (see `Chunk.actualModel`) and
 * OpenRouter's own markup, neither of which this table can track reliably — `estimateCost` would
 * silently guess wrong. OpenRouter reports real, provider-computed cost directly on the response
 * (`usage.cost` — see `OpenAiLlmGateway.ts`'s `providerReportedCost` mapping), which is always
 * preferred over a local estimate for this exact reason; see `estimateCost`'s doc.
 */
const PRICING_TABLE: PricingTable = {
    gemini: GEMINI_PRICING,
    openai: OPENAI_PRICING,
    anthropic: ANTHROPIC_PRICING,
};

/** Looks up a model's pricing entry. `null` (never a fabricated default) when the provider or the
 * exact model isn't registered in {@link PRICING_TABLE}. */
export const getModelPricing = (provider: string, model: string): ModelPricing | null =>
    PRICING_TABLE[provider]?.[model] ?? null;

/**
 * Estimates USD cost from a call's {@link UsageInfo} and this model's pricing entry. Pure —
 * no I/O, no network, safe to call from an offline test with a synthetic `usage` object.
 *
 * Returns `null`, never a fabricated `0`, whenever a cost cannot be honestly computed:
 * - the provider/model has no {@link PRICING_TABLE} entry at all (see {@link getModelPricing});
 * - `usage` has no token counts at all (nothing measurable — `null`, not a fabricated "$0.00" for
 *   a call whose usage was simply never captured);
 * - `usage` reports tokens in a bucket this model's pricing entry has no rate for (e.g.
 *   `cacheWriteInputTokens` present but the entry has no `cacheWritePerMillion`) — a partial sum
 *   that silently ignores real, billed tokens would be a wrong number, not a conservative one, so
 *   the whole estimate is withheld rather than partially computed;
 * - the entry has a {@link ModelPricing.longContextThresholdTokens} and this call's prompt size
 *   (`inputTokens + cachedInputTokens`) exceeds it — the configured rates only apply below that
 *   threshold; applying them anyway would be a wrong number for the wrong tier, not a
 *   conservative estimate of the right one;
 * - `cacheWriteInputTokens` is nonzero but `cacheWriteTtl` isn't `'5m'` or `'1h'` (i.e. it's
 *   `'unknown'`, or absent despite nonzero tokens) — `cacheWritePerMillion` and
 *   `cacheWrite1hPerMillion` are genuinely different rates (see that field's own doc), so without
 *   knowing which TTL was requested there is no single correct rate to apply, not just an
 *   uncertain one.
 *
 * `reasoningTokens` falls back to `outputPerMillion` when the entry has no explicit
 * `reasoningPerMillion` — every provider this codebase talks to bills reasoning/thinking tokens at
 * the plain output rate (Gemini, OpenAI/OpenRouter); see `ModelPricing.reasoningPerMillion`'s doc.
 *
 * Never called for OpenRouter: its entries are deliberately absent from {@link PRICING_TABLE} (see
 * that table's own doc) — prefer `usage.providerReportedCost` for OpenRouter instead, which
 * `realLocatorScenarios.spec.ts` already does before ever falling back to this function.
 */
export const estimateCost = (provider: string, model: string, usage: UsageInfo): number | null => {
    const pricing = getModelPricing(provider, model);
    if (!pricing) return null;

    if (pricing.longContextThresholdTokens !== undefined) {
        const promptSize = (usage.inputTokens ?? 0) + (usage.cachedInputTokens ?? 0);
        if (promptSize > pricing.longContextThresholdTokens) return null;
    }

    let total = 0;
    let sawAnyTokens = false;

    const bucket = (tokens: number | undefined, ratePerMillion: number | undefined): boolean => {
        if (tokens === undefined) return true;
        sawAnyTokens = true;
        if (tokens === 0) return true;
        if (ratePerMillion === undefined) return false;
        total += (tokens / 1_000_000) * ratePerMillion;
        return true;
    };

    // Cache-write tokens need a TTL to know which of the two rates applies (see
    // ModelPricing.cacheWrite1hPerMillion's doc) — `cacheWriteTtl` selects it explicitly rather
    // than defaulting to either rate, so a nonzero cacheWriteInputTokens with no determinable TTL
    // (`'unknown'`, or absent despite nonzero tokens) resolves to `undefined` here, which
    // `bucket()` below correctly treats as "no rate available" and withholds the whole estimate.
    const cacheWriteRate =
        usage.cacheWriteTtl === '5m'
            ? pricing.cacheWritePerMillion
            : usage.cacheWriteTtl === '1h'
              ? pricing.cacheWrite1hPerMillion
              : undefined;

    const ok =
        bucket(usage.inputTokens, pricing.inputPerMillion) &&
        bucket(usage.cachedInputTokens, pricing.cachedInputPerMillion) &&
        bucket(usage.cacheWriteInputTokens, cacheWriteRate) &&
        bucket(usage.outputTokens, pricing.outputPerMillion) &&
        bucket(usage.reasoningTokens, pricing.reasoningPerMillion ?? pricing.outputPerMillion) &&
        // Tool-use prompt tokens are billed at the plain input rate — see Gemini's
        // toolUsePromptTokenCount doc (results fed back to the model "as input").
        bucket(usage.toolUseInputTokens, pricing.inputPerMillion);

    return ok && sawAnyTokens ? total : null;
};
