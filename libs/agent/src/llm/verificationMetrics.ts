import { isAcceptedOutcome } from './classifyRealProviderResult';
import { COST_CURRENCY } from './pricing';

import type { RealProviderOutcome } from './classifyRealProviderResult';
import type { Chunk, LlmGateway } from './llmGateway';

/**
 * Monitoring for the real-provider verification runners (`realLocatorScenarios.spec.ts`,
 * `realProviderToolCall.spec.ts`): per-call usage accounting
 * (token buckets plus provider-reported or estimated USD cost — see `UsageInfo` in
 * `llmGateway.ts`) and elapsed-time capture, plus aggregation into a per-(provider, model)
 * summary suitable for a Markdown/JSON report with cost as the primary comparison and token
 * counts as diagnostic detail. Pure and offline-testable — no filesystem or process.env access
 * here; the env-gated spec files own timing measurement at the call site and file writing, this
 * module only captures usage from a gateway's chunk stream and does the aggregation/formatting
 * math. See `verificationMetrics.spec.ts` for coverage using synthetic records (no API key
 * needed).
 */

export interface UsageTotals {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
}

const NO_USAGE: UsageTotals = { inputTokens: null, outputTokens: null, totalTokens: null };

/** The extended, cost-relevant fields captured alongside {@link UsageTotals} — a subset of
 * {@link UsageInfo} (all still optional, since most providers don't report most of these), kept as
 * its own type so `UsageTotals`'s three-field null-convention stays exactly as it was for any
 * existing consumer relying on just inputTokens/outputTokens/totalTokens. */
export interface ExtendedUsageInfo {
    cachedInputTokens?: number;
    cacheWriteInputTokens?: number;
    cacheWriteTtl?: '5m' | '1h' | 'unknown';
    reasoningTokens?: number;
    toolUseInputTokens?: number;
    providerTotalTokens?: number;
    providerReportedCost?: number;
    estimatedCost?: number | null;
    costSource?: 'provider-reported' | 'estimated';
    pricingVersion?: string;
}

/** Usage totals plus the extended cost/token breakdown and the model that actually served the
 * call, when the provider reported one (e.g. OpenRouter routing `openrouter/free` to a specific
 * underlying model) — distinct from the requested model/route, which the caller already knows
 * without needing the chunk stream. */
export interface CapturedCallInfo extends UsageTotals, ExtendedUsageInfo {
    actualModel?: string;
}

/** Sums `.usage`'s token-count fields and picks up its single-value fields (`providerTotalTokens`,
 * `*Cost`, `costSource`) and `.actualModel` across every chunk in one `chat()` call. All are
 * documented as arriving on the final (`done`) chunk only, so in practice there is at most one of
 * each — this doesn't assume that: token-count fields are summed (matching inputTokens/
 * outputTokens's existing behavior) while single-value fields take the last chunk that reported
 * one, same as `actualModel` already did. Never fabricates a value neither the caller nor any
 * chunk reported. */
const mergeChunkUsage = (chunks: Chunk[]): CapturedCallInfo => {
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    let cachedInputTokens: number | undefined;
    let cacheWriteInputTokens: number | undefined;
    let cacheWriteTtl: '5m' | '1h' | 'unknown' | undefined;
    let reasoningTokens: number | undefined;
    let toolUseInputTokens: number | undefined;
    let providerTotalTokens: number | undefined;
    let providerReportedCost: number | undefined;
    let estimatedCost: number | null | undefined;
    let costSource: 'provider-reported' | 'estimated' | undefined;
    let pricingVersion: string | undefined;
    let actualModel: string | undefined;

    for (const chunk of chunks) {
        const usage = chunk.usage;
        if (usage?.inputTokens !== undefined) {
            inputTokens = (inputTokens ?? 0) + usage.inputTokens;
        }
        if (usage?.outputTokens !== undefined) {
            outputTokens = (outputTokens ?? 0) + usage.outputTokens;
        }
        if (usage?.cachedInputTokens !== undefined) {
            cachedInputTokens = (cachedInputTokens ?? 0) + usage.cachedInputTokens;
        }
        if (usage?.cacheWriteInputTokens !== undefined) {
            cacheWriteInputTokens = (cacheWriteInputTokens ?? 0) + usage.cacheWriteInputTokens;
        }
        if (usage?.cacheWriteTtl !== undefined) {
            cacheWriteTtl = usage.cacheWriteTtl;
        }
        if (usage?.reasoningTokens !== undefined) {
            reasoningTokens = (reasoningTokens ?? 0) + usage.reasoningTokens;
        }
        if (usage?.toolUseInputTokens !== undefined) {
            toolUseInputTokens = (toolUseInputTokens ?? 0) + usage.toolUseInputTokens;
        }
        if (usage?.providerTotalTokens !== undefined) {
            providerTotalTokens = usage.providerTotalTokens;
        }
        if (usage?.providerReportedCost !== undefined) {
            providerReportedCost = usage.providerReportedCost;
        }
        if (usage?.estimatedCost !== undefined) {
            estimatedCost = usage.estimatedCost;
        }
        if (usage?.costSource !== undefined) {
            costSource = usage.costSource;
        }
        if (usage?.pricingVersion !== undefined) {
            pricingVersion = usage.pricingVersion;
        }
        if (chunk.actualModel !== undefined) {
            actualModel = chunk.actualModel;
        }
    }
    const totalTokens = inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null;
    return {
        inputTokens,
        outputTokens,
        totalTokens,
        ...(cachedInputTokens !== undefined ? { cachedInputTokens } : {}),
        ...(cacheWriteInputTokens !== undefined ? { cacheWriteInputTokens } : {}),
        ...(cacheWriteTtl !== undefined ? { cacheWriteTtl } : {}),
        ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
        ...(toolUseInputTokens !== undefined ? { toolUseInputTokens } : {}),
        ...(providerTotalTokens !== undefined ? { providerTotalTokens } : {}),
        ...(providerReportedCost !== undefined ? { providerReportedCost } : {}),
        ...(estimatedCost !== undefined ? { estimatedCost } : {}),
        ...(costSource !== undefined ? { costSource } : {}),
        ...(pricingVersion !== undefined ? { pricingVersion } : {}),
        ...(actualModel !== undefined ? { actualModel } : {}),
    };
};

/**
 * Combines usage from more than one `chat()` call in the same scenario (e.g. a multi-turn
 * round trip). A field stays non-null only if at least one call reported it; if a call reported
 * nothing for a field, it contributes 0 to the sum, not an assumed value — the field only reads
 * as fully `null` when NO call in the group reported it at all.
 */
export const accumulateUsage = (usages: UsageTotals[]): UsageTotals => {
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    for (const u of usages) {
        if (u.inputTokens !== null) inputTokens = (inputTokens ?? 0) + u.inputTokens;
        if (u.outputTokens !== null) outputTokens = (outputTokens ?? 0) + u.outputTokens;
    }
    const totalTokens = inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null;
    return { inputTokens, outputTokens, totalTokens };
};

/** A call's authoritative cost: `providerReportedCost` when present (always preferred — see
 * `UsageInfo.providerReportedCost`'s doc), else a genuinely-computed `estimatedCost` (a number,
 * not `null`/`undefined`). `undefined` when neither is usable — an explicit `null` `estimatedCost`
 * (pricing unknown) and a never-attempted `undefined` both fall through to this, since both mean
 * "no cost figure," just for different reasons. Shared by {@link aggregateVerificationMetrics} and
 * {@link accumulateExtendedUsage}. */
const effectiveCost = (call: Pick<ExtendedUsageInfo, 'providerReportedCost' | 'estimatedCost'>): number | undefined => {
    if (call.providerReportedCost !== undefined) return call.providerReportedCost;
    if (typeof call.estimatedCost === 'number') return call.estimatedCost;
    return undefined;
};

/**
 * The {@link CapturedCallInfo}-shaped counterpart to {@link accumulateUsage}: combines the
 * extended token/cost breakdown from more than one `chat()` call in the same scenario (e.g. Scope
 * B's two-turn round trip) the same way `accumulateUsage` combines the basic input/output
 * totals — every count field stays non-null/present only if at least one call reported it, never
 * assumed. Cost is summed via {@link effectiveCost} per call (provider-reported preferred over
 * estimated, per call — not a single up-front choice for the whole group), so a round trip
 * mixing a provider-reported first turn with an estimated second turn still gets an honest total.
 * The combined sum is always returned under `estimatedCost` (never `providerReportedCost`, which
 * only ever means "the provider itself reported this exact number for one call" — a summed total
 * across multiple calls isn't that, even when every contributing call happened to be
 * provider-reported); `costSource` is `'estimated'` if ANY contributing call used an estimate,
 * `'provider-reported'` only if every contributing call did, and absent if no call had a usable
 * cost at all. Callers that only care about "the one number to use" should keep using
 * {@link effectiveCost} on the result, which checks `providerReportedCost` first regardless.
 */
export const accumulateExtendedUsage = (calls: readonly CapturedCallInfo[]): CapturedCallInfo => {
    const base = accumulateUsage([...calls]);

    let cachedInputTokens: number | undefined;
    let cacheWriteInputTokens: number | undefined;
    let reasoningTokens: number | undefined;
    let toolUseInputTokens: number | undefined;
    let providerTotalTokens: number | undefined;
    let totalCost: number | undefined;
    let sawEstimated = false;
    let sawProviderReported = false;
    const pricingVersionsSeen = new Set<string>();
    const cacheWriteTtlsSeen = new Set<string>();

    for (const c of calls) {
        if (c.cachedInputTokens !== undefined) cachedInputTokens = (cachedInputTokens ?? 0) + c.cachedInputTokens;
        if (c.cacheWriteInputTokens !== undefined) {
            cacheWriteInputTokens = (cacheWriteInputTokens ?? 0) + c.cacheWriteInputTokens;
        }
        if (c.reasoningTokens !== undefined) reasoningTokens = (reasoningTokens ?? 0) + c.reasoningTokens;
        if (c.toolUseInputTokens !== undefined) {
            toolUseInputTokens = (toolUseInputTokens ?? 0) + c.toolUseInputTokens;
        }
        if (c.providerTotalTokens !== undefined)
            {providerTotalTokens = (providerTotalTokens ?? 0) + c.providerTotalTokens;}

        const cost = effectiveCost(c);
        if (cost !== undefined) {
            totalCost = (totalCost ?? 0) + cost;
            if (c.providerReportedCost !== undefined) sawProviderReported = true;
            else sawEstimated = true;
        }
        if (c.pricingVersion !== undefined) pricingVersionsSeen.add(c.pricingVersion);
        if (c.cacheWriteTtl !== undefined) cacheWriteTtlsSeen.add(c.cacheWriteTtl);
    }

    // The final `: undefined` below is unreachable: every update to totalCost (in the loop above)
    // unconditionally sets sawEstimated or sawProviderReported, so once totalCost !== undefined,
    // it is impossible for both flags to still be false.
    const costSource: 'provider-reported' | 'estimated' | undefined =
        totalCost === undefined
            ? undefined
            : sawEstimated
              ? 'estimated'
              : sawProviderReported
                ? 'provider-reported'
                : /* v8 ignore next */ undefined;
    // A single pricingVersion/cacheWriteTtl is only meaningful when every contributing call
    // agrees — mixing within one accumulated record has no single honest value to report, so it's
    // left absent rather than picking one arbitrarily (same reasoning as costSource's own mixing
    // rule). A two-turn round trip where only one turn wrote to cache still reports that turn's
    // single TTL correctly, since the other turn contributes nothing to this set.
    const pricingVersion = pricingVersionsSeen.size === 1 ? [...pricingVersionsSeen][0] : undefined;
    const cacheWriteTtl =
        cacheWriteTtlsSeen.size === 1 ? ([...cacheWriteTtlsSeen][0] as '5m' | '1h' | 'unknown') : undefined;

    return {
        ...base,
        ...(cachedInputTokens !== undefined ? { cachedInputTokens } : {}),
        ...(cacheWriteInputTokens !== undefined ? { cacheWriteInputTokens } : {}),
        ...(cacheWriteTtl !== undefined ? { cacheWriteTtl } : {}),
        ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
        ...(toolUseInputTokens !== undefined ? { toolUseInputTokens } : {}),
        ...(providerTotalTokens !== undefined ? { providerTotalTokens } : {}),
        ...(totalCost !== undefined ? { estimatedCost: totalCost } : {}),
        ...(costSource !== undefined ? { costSource } : {}),
        ...(pricingVersion !== undefined ? { pricingVersion } : {}),
    };
};

/**
 * Wraps a gateway so every `chat()` call's reported token usage and actual-model-served (if any)
 * are captured via `onUsage`, without altering behavior — every chunk is yielded through
 * unchanged, and `capabilities` is passed through as-is. Fires once per `chat()` call, in a
 * `finally` block, so it fires whether the stream is drained fully, thrown from, or abandoned by
 * the consumer calling `.return()` on the iterator — but if the consumer simply stops awaiting
 * (e.g. our own `raceWithTimeout` losing the race) without calling `.return()`, the generator may
 * keep running and `onUsage` may fire late or not be observed by the caller — a known best-effort
 * limit on timeout rows, not a bug: this module never fabricates a number to paper over that gap.
 *
 * Deliberately does NOT measure elapsed time — callers already need to wrap the call site anyway
 * to get an honest `elapsedMs` even on a timeout/thrown-error path (before this wrapper's own
 * `finally` may have run), so timing lives at the call site, not here. See
 * `realLocatorScenarios.spec.ts`'s `runMatrix` for the pattern.
 */
export const wrapGatewayWithUsageCapture = (
    gateway: LlmGateway,
    onUsage: (usage: CapturedCallInfo) => void
): LlmGateway => ({
    ...(gateway.capabilities ? { capabilities: gateway.capabilities } : {}),
    async *chat(req, opts) {
        const chunks: Chunk[] = [];
        try {
            for await (const chunk of gateway.chat(req, opts)) {
                chunks.push(chunk);
                yield chunk;
            }
        } finally {
            onUsage(mergeChunkUsage(chunks));
        }
    },
});

/** One scenario/model run's full monitoring record — timing measured by the caller (call-site
 * wall clock, always available even on timeout/error), usage captured via
 * {@link wrapGatewayWithUsageCapture} (best-effort, null when the provider didn't report it or
 * the call never completed). */
export interface VerificationRunRecord extends UsageTotals, ExtendedUsageInfo {
    provider: string;
    /** The requested model or route (e.g. `openrouter/free`) — what the caller asked for, always
     * present, independent of whether the provider reports what actually served it. */
    model: string;
    /** The model that actually served the call, when the provider reported one — e.g. what
     * `openrouter/free` routed to this time. Absent (not fabricated) when the provider never
     * reports it, or the call never completed. See {@link wrapGatewayWithUsageCapture}. */
    actualModel?: string;
    scenarioId: string;
    outcome: RealProviderOutcome;
    startedAt: number;
    endedAt: number;
    elapsedMs: number;
    /** The structured tool call name the model emitted, if any — `null` means no tool call;
     * absent means this record predates the field (e.g. a merged-in older report). */
    toolCallName?: string | null;
    /** Whether the tool call's `argsDelta` parsed as valid JSON — absent when no tool call was
     * made at all (the question doesn't arise), `false` only for an actual JSON-parse failure. */
    argsValid?: boolean;
    /** Whether `ToolExecutor.dispatch` reported success — absent when no dispatch was attempted
     * (no tool call, or invalid args caught before dispatch). */
    dispatchOk?: boolean;
    /** Whether this harness's own acceptance criterion (`isAcceptedOutcome`: pass OR
     * known-variance) was met — i.e. the canvas ended up in a state this scenario's `check()`
     * accepts, whether that meant a correct mutation or a correctly-withheld one. Not an
     * independent judgment separate from `outcome` — a restatement of it under this more specific
     * name, since `check()` already validates canvas state as part of scoring every scenario. */
    canvasStateCorrect?: boolean;
    /** Retry attempts made before this outcome. Always `0` today — this harness has no retry
     * logic yet; the field exists so a future retry mechanism doesn't need a schema change. */
    retries?: number;
    /** Sanitized, provider-neutral failure category (see `classifyGeminiFailureCategory` in
     * `classifyRealProviderResult.ts`) — currently populated for Gemini `fail`/`provider-error`
     * outcomes only; absent for every other provider/outcome (no generic classifier exists yet
     * for OpenAI/Anthropic/OpenRouter — see that module's own doc for why this isn't invented
     * without a concrete failure to classify). */
    errorCategory?: string;
}

export interface ProviderModelAggregate {
    provider: string;
    model: string;
    scenarioCount: number;
    passCount: number;
    knownVarianceCount: number;
    failCount: number;
    providerErrorCount: number;
    timeoutCount: number;
    acceptedCount: number;
    /** Tokens billed at the standard (non-cached, non-tool-use) input rate — NOT the provider's
     * raw prompt-token count where that includes cached tokens (see `UsageInfo.inputTokens`'s own
     * doc in llmGateway.ts: every gateway subtracts cached/cache-write tokens before reporting
     * this field, so this total is already "uncached input tokens"). */
    totalInputTokens: number | null;
    /** Visible output tokens only — excludes reasoning/thinking tokens, reported separately in
     * `totalReasoningTokens` below (same disjoint-bucket convention as the input side). */
    totalOutputTokens: number | null;
    /** Sum of `totalInputTokens + totalOutputTokens` only — does NOT include cached/cache-write/
     * reasoning/tool-use tokens. See `totalProviderTokens` for the providers' own raw grand
     * totals, which do include everything. */
    totalTokens: number | null;
    /** True when at least one scenario in this group is missing token usage — the totals above
     * are a partial sum in that case, not the full picture. Never true and null at once for the
     * same field: null means NO scenario in the group reported it. */
    tokensIncomplete: boolean;
    /** Cached-read input tokens, billed at the provider's discounted rate. */
    totalCachedInputTokens: number | null;
    /** Cache-write input tokens, billed at the provider's (often premium) cache-write rate. */
    totalCacheWriteInputTokens: number | null;
    /** "Thinking"/reasoning tokens, billed at the output rate but reported separately for
     * diagnostic visibility into how much of the output cost is reasoning vs. visible content. */
    totalReasoningTokens: number | null;
    /** Input tokens from tool-execution results fed back to the model on a later turn. */
    totalToolUseInputTokens: number | null;
    /** The providers' own raw total-tokens figures, summed — a diagnostic sanity-check value,
     * never derived from the cost-bucket fields above (see `UsageInfo.providerTotalTokens`). */
    totalProviderTokens: number | null;
    /** Total cost in USD — `providerReportedCost` preferred per-record when present, falling back
     * to `estimatedCost` otherwise (see `VerificationRunRecord`/`UsageInfo`'s own docs on that
     * preference order). `null` when NO scenario in the group has any cost figure at all — never
     * a fabricated 0. */
    totalCost: number | null;
    /** Mean of `totalCost` over `scenarioCount` — `null` under the same condition as `totalCost`. */
    avgCostPerScenario: number | null;
    /** True when at least one scenario in this group has neither a provider-reported nor an
     * estimated cost (unregistered pricing, or usage never captured) — `totalCost`/
     * `avgCostPerScenario` are a partial sum in that case, not the full picture. Mirrors
     * `tokensIncomplete`'s meaning for the cost fields. */
    costIncomplete: boolean;
    /** Every distinct `actualModel` seen among this group's records, sorted — normally a single
     * value (or empty, if the provider never reports one). More than one entry means this group's
     * requested model/route (e.g. OpenRouter's `openrouter/free`) was actually served by more than
     * one underlying model across the scenarios summed here — `totalCost`/token totals still add
     * up correctly, but they no longer describe one consistent model's pricing. See
     * `formatMetricsMarkdownTable`'s footnote, only emitted when this has more than one entry. */
    distinctActualModels: readonly string[];
    /** Every distinct `pricingVersion` (see `PRICING_CONFIG_VERSION` in `pricing.ts`) among this
     * group's estimated-cost records, sorted — normally a single value (or empty, if every cost in
     * the group is provider-reported rather than locally estimated, or if no cost was computed at
     * all). More than one entry means `totalCost` sums estimates computed under different pricing
     * snapshots (e.g. after `mergeVerificationRecords` carried forward an older session's records
     * following a rate update) — mathematically summed correctly, but not all computed under the
     * same assumptions. See `formatMetricsMarkdownTable`'s footnote, only emitted when this has
     * more than one entry. */
    distinctPricingVersions: readonly string[];
    /** Every distinct `cacheWriteTtl` (`'5m'` / `'1h'` / `'unknown'`) among this group's records
     * with nonzero cache-write tokens, sorted — empty when the group has no cache-write tokens at
     * all. `'unknown'` appearing here means at least one scenario reported cache-write tokens with
     * no determinable TTL, so that scenario's `estimatedCost` is `null` (see `pricing.ts`'s
     * `estimateCost`) and `costIncomplete` above will also be `true` for this group. Surfaced in
     * `formatTokenDiagnosticsTable` next to the cache-write column so a cache-write-inclusive cost
     * is never presented without visibility into which rate tier (or lack of one) produced it. */
    distinctCacheWriteTtls: readonly string[];
    totalElapsedMs: number;
    avgElapsedMs: number;
}

const groupKey = (provider: string, model: string): string => `${provider}::${model}`;

/** Groups records by (provider, model) and computes count/token/timing summaries. Never
 * fabricates a token total: a group's totalInputTokens/totalOutputTokens/totalTokens stay `null`
 * unless at least one record in the group actually reported that field. */

/** Sums an optional numeric field across a group, tracking whether any record was missing it —
 * the shared shape behind every `total*` field below (tokens and cost alike). */
const sumOptional = <T>(
    group: readonly T[],
    pick: (r: T) => number | undefined
): { total: number | null; incomplete: boolean } => {
    let total: number | null = null;
    let incomplete = false;
    for (const r of group) {
        const value = pick(r);
        if (value !== undefined) {
            total = (total ?? 0) + value;
        } else {
            incomplete = true;
        }
    }
    return { total, incomplete };
};

/** Every distinct value of an optional string field across a group, sorted — the shared shape
 * behind `distinctActualModels`/`distinctPricingVersions`. A group where every record agrees (or
 * never reported the field) returns 0 or 1 entries; more than one entry is the mixing signal
 * `formatMetricsMarkdownTable` surfaces as a footnote. */
const distinctValues = <T>(group: readonly T[], pick: (r: T) => string | undefined): readonly string[] =>
    [...new Set(group.map(pick).filter((v): v is string => v !== undefined))].sort();

export const aggregateVerificationMetrics = (records: readonly VerificationRunRecord[]): ProviderModelAggregate[] => {
    const groups = new Map<string, VerificationRunRecord[]>();
    for (const record of records) {
        const key = groupKey(record.provider, record.model);
        const arr = groups.get(key);
        if (arr) {
            arr.push(record);
        } else {
            groups.set(key, [record]);
        }
    }

    const aggregates: ProviderModelAggregate[] = [];
    for (const group of groups.values()) {
        const { provider, model } = group[0];

        let totalInputTokens: number | null = null;
        let inputMissing = false;
        let totalOutputTokens: number | null = null;
        let outputMissing = false;
        let totalElapsedMs = 0;

        for (const r of group) {
            if (r.inputTokens !== null) {
                totalInputTokens = (totalInputTokens ?? 0) + r.inputTokens;
            } else {
                inputMissing = true;
            }
            if (r.outputTokens !== null) {
                totalOutputTokens = (totalOutputTokens ?? 0) + r.outputTokens;
            } else {
                outputMissing = true;
            }
            totalElapsedMs += r.elapsedMs;
        }

        const totalTokens =
            totalInputTokens !== null || totalOutputTokens !== null
                ? (totalInputTokens ?? 0) + (totalOutputTokens ?? 0)
                : null;

        const cachedInput = sumOptional(group, r => r.cachedInputTokens);
        const cacheWriteInput = sumOptional(group, r => r.cacheWriteInputTokens);
        const reasoning = sumOptional(group, r => r.reasoningTokens);
        const toolUseInput = sumOptional(group, r => r.toolUseInputTokens);
        const providerTokens = sumOptional(group, r => r.providerTotalTokens);
        const cost = sumOptional(group, r => effectiveCost(r));
        const distinctActualModels = distinctValues(group, r => r.actualModel);
        // Only records with a locally-estimated cost carry a pricingVersion at all (see
        // UsageInfo.pricingVersion's doc) — a provider-reported-only group correctly yields no
        // entries here, not a false "mixing" signal.
        const distinctPricingVersions = distinctValues(group, r => r.pricingVersion);
        const distinctCacheWriteTtls = distinctValues(group, r => r.cacheWriteTtl);

        aggregates.push({
            provider,
            model,
            scenarioCount: group.length,
            passCount: group.filter(r => r.outcome === 'pass').length,
            knownVarianceCount: group.filter(r => r.outcome === 'known-variance').length,
            failCount: group.filter(r => r.outcome === 'fail').length,
            providerErrorCount: group.filter(r => r.outcome === 'provider-error').length,
            timeoutCount: group.filter(r => r.outcome === 'timeout').length,
            acceptedCount: group.filter(r => r.outcome === 'pass' || r.outcome === 'known-variance').length,
            totalInputTokens,
            totalOutputTokens,
            totalTokens,
            tokensIncomplete: inputMissing || outputMissing,
            totalCachedInputTokens: cachedInput.total,
            totalCacheWriteInputTokens: cacheWriteInput.total,
            totalReasoningTokens: reasoning.total,
            totalToolUseInputTokens: toolUseInput.total,
            totalProviderTokens: providerTokens.total,
            totalCost: cost.total,
            avgCostPerScenario: cost.total !== null ? cost.total / group.length : null,
            costIncomplete: cost.incomplete,
            distinctActualModels,
            distinctPricingVersions,
            distinctCacheWriteTtls,
            totalElapsedMs,
            avgElapsedMs: totalElapsedMs / group.length,
        });
    }

    return aggregates.sort((a, b) => a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model));
};

const formatTokenCell = (value: number | null, incomplete: boolean): string => {
    if (value === null) return 'n/a';
    return incomplete ? `${value}*` : String(value);
};

/**
 * USD, 4 decimal places (sub-cent amounts are common for these cheap-tier models — 2 decimals
 * would round several real rows to `$0.00`, misrepresenting a genuinely nonzero cost as free).
 *
 * Precision contract: cost math throughout this module runs on plain JS `number` (IEEE-754
 * double), never integer micro-USD units. Rounding happens only here, at the final
 * Markdown-rendering boundary — every summation (`sumOptional`, `accumulateExtendedUsage`,
 * `effectiveCost`) operates on unrounded values, so per-request rounding error can never compound
 * across an aggregate. This is a deliberate choice, not an oversight: volumes here are small (at
 * most a few hundred scenarios per session) and this data is verification telemetry, not billing
 * of record — floating-point's worst-case error at these magnitudes is many orders of magnitude
 * below the 4-decimal display precision. Revisit if this module ever aggregates thousands of
 * records or feeds an actual invoice.
 */
const formatUsd = (value: number): string => `$${value.toFixed(4)}`;

const formatCostCell = (value: number | null, incomplete: boolean): string => {
    if (value === null) return 'n/a';
    return incomplete ? `${formatUsd(value)}*` : formatUsd(value);
};

/**
 * Renders the per-(provider, model) aggregate table as GitHub-flavored Markdown, **cost-led**
 * per the "make cost the primary comparison metric" requirement: Total cost / Avg cost per
 * scenario sit immediately after the outcome columns, ahead of timing. Token counts move to
 * {@link formatTokenDiagnosticsTable} — diagnostic detail, not the headline comparison. A `*` on
 * a cost or token cell means the total is partial (at least one scenario in that row didn't
 * report that field) — see the trailing footnote, only emitted when at least one row needs it.
 */
export const formatMetricsMarkdownTable = (aggregates: readonly ProviderModelAggregate[]): string => {
    if (aggregates.length === 0) {
        return '_No real-provider verification runs recorded in this session (no API keys set, or no scenarios ran)._';
    }

    const header =
        '| Provider | Model | Scenarios | Pass | Known-variance | Fail | Provider-error | Timeout | Accepted | ' +
        'Total cost | Avg cost/scenario | Total elapsed | Avg elapsed |';
    const separator = '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |';
    const rows = aggregates.map(a => {
        const totalCostCell = formatCostCell(a.totalCost, a.costIncomplete);
        const avgCostCell = formatCostCell(a.avgCostPerScenario, a.costIncomplete);
        const modelMixed = a.distinctActualModels.length > 1;
        const versionMixed = a.distinctPricingVersions.length > 1;
        const modelCell = `${a.model}${modelMixed ? '†' : ''}`;
        return (
            `| ${a.provider} | ${modelCell} | ${a.scenarioCount} | ${a.passCount} | ${a.knownVarianceCount} | ` +
            `${a.failCount} | ${a.providerErrorCount} | ${a.timeoutCount} | ${a.acceptedCount}/${a.scenarioCount} | ` +
            `${totalCostCell}${versionMixed ? '‡' : ''} | ${avgCostCell}${versionMixed ? '‡' : ''} | ` +
            `${a.totalElapsedMs}ms | ${Math.round(a.avgElapsedMs)}ms |`
        );
    });

    const needsIncompleteFootnote = aggregates.some(a => a.costIncomplete);
    const incompleteFootnote = needsIncompleteFootnote
        ? '\n\n`*` = partial total — at least one scenario in that row has no cost figure at all ' +
          '(unregistered pricing — see pricing.ts — or usage never captured).'
        : '';

    const mixedModelRows = aggregates.filter(a => a.distinctActualModels.length > 1);
    const modelFootnote =
        mixedModelRows.length > 0
            ? "\n\n`†` = this row's requested model/route resolved to more than one actual model across " +
              'the scenarios summed here — totals still add up correctly, but no longer describe one ' +
              "consistent model's pricing: " +
              mixedModelRows.map(a => `${a.provider} ${a.model} (${a.distinctActualModels.join(', ')})`).join('; ') +
              '.'
            : '';

    const mixedVersionRows = aggregates.filter(a => a.distinctPricingVersions.length > 1);
    const versionFootnote =
        mixedVersionRows.length > 0
            ? "\n\n`‡` = this row's cost sums estimates computed under more than one pricing snapshot " +
              '(see PRICING_CONFIG_VERSION in pricing.ts) — mathematically correct, but not all computed ' +
              'under the same rates: ' +
              mixedVersionRows
                  .map(a => `${a.provider} ${a.model} (${a.distinctPricingVersions.join(', ')})`)
                  .join('; ') +
              '.'
            : '';

    return [header, separator, ...rows].join('\n') + incompleteFootnote + modelFootnote + versionFootnote;
};

/**
 * Diagnostic companion to {@link formatMetricsMarkdownTable}: the full token breakdown per
 * (provider, model) — uncached/cached/cache-write input, tool-use input, visible output,
 * reasoning, and the provider's own raw total. Every field here is a disjoint bucket (see
 * `UsageInfo` in llmGateway.ts) except `Provider tokens`, which is the providers' own raw total
 * as reported, kept for sanity-checking against the bucket sum rather than derived from it.
 */
export const formatTokenDiagnosticsTable = (aggregates: readonly ProviderModelAggregate[]): string => {
    if (aggregates.length === 0) {
        return '_No token diagnostics recorded in this session._';
    }

    const header =
        '| Provider | Model | Uncached input | Cached input | Cache-write input | Cache-write TTL | ' +
        'Tool-use input | Visible output | Reasoning | Provider total |';
    const separator = '| --- | --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: |';
    const rows = aggregates.map(a => {
        // Blank (never "n/a") when the group has no cache-write tokens at all — "n/a" would wrongly
        // imply a TTL question that doesn't apply here, same as the empty-cell convention below.
        const ttlCell = a.distinctCacheWriteTtls.length > 0 ? a.distinctCacheWriteTtls.join(', ') : '';
        const cells = [
            formatTokenCell(a.totalInputTokens, a.tokensIncomplete),
            formatTokenCell(a.totalCachedInputTokens, false),
            formatTokenCell(a.totalCacheWriteInputTokens, false),
            ttlCell,
            formatTokenCell(a.totalToolUseInputTokens, false),
            formatTokenCell(a.totalOutputTokens, a.tokensIncomplete),
            formatTokenCell(a.totalReasoningTokens, false),
            formatTokenCell(a.totalProviderTokens, false),
        ];
        return `| ${a.provider} | ${a.model} | ${cells.join(' | ')} |`;
    });

    const needsUnknownFootnote = aggregates.some(a => a.distinctCacheWriteTtls.includes('unknown'));
    const unknownFootnote = needsUnknownFootnote
        ? '\n\n`unknown` Cache-write TTL = cache-write tokens were reported with no determinable ' +
          "rate tier (the gateway never requested a specific TTL for that call) — that scenario's " +
          'cost could not be estimated and is excluded from Total cost above, not silently priced ' +
          'at either rate.'
        : '';

    return [header, separator, ...rows].join('\n') + unknownFootnote;
};

/**
 * The "make cost the primary comparison" requirement's ranking half — models sorted cheapest to
 * most expensive by total cost, so the primary comparison is legible at a glance without reading
 * the full table. Rows with no cost figure at all (`totalCost === null`) are excluded from the
 * ranking (there is nothing to rank them by) and listed separately, never sorted to the front as
 * if `null` meant "cheapest" or "free."
 */
export const formatCostRanking = (aggregates: readonly ProviderModelAggregate[]): string => {
    const ranked = aggregates
        .filter((a): a is ProviderModelAggregate & { totalCost: number } => a.totalCost !== null)
        .sort((a, b) => (a.totalCost as number) - (b.totalCost as number));
    const unranked = aggregates.filter(a => a.totalCost === null);

    if (ranked.length === 0) {
        return '_No model has a cost figure to rank — no provider-reported or estimated cost recorded._';
    }

    const lines = ranked.map((a, i) => {
        const suffix = a.costIncomplete ? '*' : '';
        return (
            `${i + 1}. **${a.provider} ${a.model}** — ${formatUsd(a.totalCost)}${suffix} total, ` +
            `${formatUsd(a.avgCostPerScenario as number)}${suffix}/scenario`
        );
    });

    const unrankedNote =
        unranked.length > 0
            ? `\n\nNot ranked (no cost figure at all): ${unranked.map(a => `${a.provider} ${a.model}`).join(', ')}.`
            : '';
    const incompleteNote = ranked.some(a => a.costIncomplete)
        ? '\n\n`*` = partial total — at least one scenario for that model has no cost figure.'
        : '';

    return lines.join('\n') + unrankedNote + incompleteNote;
};

export interface VerificationMetricsReport {
    generatedAt: string;
    /** The currency every cost figure in this report is denominated in (see `COST_CURRENCY` in
     * pricing.ts) — declared once at the report level rather than per-record/per-aggregate, since
     * every cost in this codebase is currently guaranteed USD by construction (`ModelPricing`'s
     * own type only allows `'USD'`, and OpenRouter's `usage.cost` is observed/documented as USD).
     * Exists so a report consumer never has to assume the unit rather than read it. */
    costCurrency: string;
    aggregates: ProviderModelAggregate[];
    records: readonly VerificationRunRecord[];
}

/** Full JSON artifact: per-(provider, model) aggregates plus the raw per-scenario records they
 * were computed from, so a later run can be diffed/audited scenario-by-scenario, not just at the
 * rolled-up level. */
export const buildVerificationMetricsReport = (
    records: readonly VerificationRunRecord[],
    now: () => Date = () => new Date()
): VerificationMetricsReport => ({
    generatedAt: now().toISOString(),
    costCurrency: COST_CURRENCY,
    aggregates: aggregateVerificationMetrics(records),
    records,
});

export const NO_USAGE_TOTALS = NO_USAGE;

export interface MergedVerificationRunRecord extends VerificationRunRecord {
    /** ISO timestamp of the report generation this record actually came from — the prior
     * session's `generatedAt` for a carried-forward record, or this run's own timestamp for a
     * freshly-recorded one. A merged report's own top-level `generatedAt` describes only when the
     * merge/write happened, not when every record in it was produced — this field is what keeps
     * that honest instead of implying a single session generated everything. */
    sourceGeneratedAt: string;
}

/**
 * Merges this session's freshly-recorded records into a previously-committed report so a partial
 * real-key run (e.g. only `OPENROUTER_API_KEY` set this time, when the committed report also has
 * Gemini data from an earlier session) never silently drops (provider, model) coverage a prior
 * session already verified. Replacement is whole-group, never partial: any (provider, model) pair
 * present in `newRecords` fully replaces that pair's records from `previousReport` — a re-run
 * always reflects this session's complete result for that pair, never a blend of two runs' rows
 * for the same pair. Every (provider, model) pair NOT touched this session is carried forward
 * unchanged. Every returned record carries `sourceGeneratedAt`, so nothing is combined without an
 * explicit, per-record label of which session actually produced it.
 *
 * `previousReport` is `undefined` when there is no prior committed report to merge with (first
 * run ever, or the file didn't parse) — in that case this is just `newRecords` tagged with
 * `newGeneratedAt`, the same as a from-scratch write.
 */
export const mergeVerificationRecords = (
    previousReport: VerificationMetricsReport | undefined,
    newRecords: readonly VerificationRunRecord[],
    newGeneratedAt: string
): MergedVerificationRunRecord[] => {
    const touchedGroups = new Set(newRecords.map(r => groupKey(r.provider, r.model)));
    const carriedForward: MergedVerificationRunRecord[] = (previousReport?.records ?? [])
        .filter(r => !touchedGroups.has(groupKey(r.provider, r.model)))
        .map(r => ({ ...r, sourceGeneratedAt: previousReport?.generatedAt ?? newGeneratedAt }));
    const fresh: MergedVerificationRunRecord[] = newRecords.map(r => ({ ...r, sourceGeneratedAt: newGeneratedAt }));
    return [...carriedForward, ...fresh];
};

/** Distinct `sourceGeneratedAt` values in a merged record set, sorted — for an explicit "this
 * report combines N sessions, generated at: ..." note rather than leaving the merge implicit. */
export const distinctSourceSessions = (records: readonly MergedVerificationRunRecord[]): string[] =>
    Array.from(new Set(records.map(r => r.sourceGeneratedAt))).sort();

/**
 * Per-(provider, requestedModel, actualModel) aggregate, used specifically by
 * {@link buildElapsedVsTokensChart}. Unlike {@link ProviderModelAggregate} (grouped by requested
 * model/route only, with `distinctActualModels` as a footnoted mixing signal), this groups
 * further by the actual model a route resolved to — so a route like OpenRouter's `openrouter/free`
 * that serves two different underlying models across calls produces two separate aggregates here,
 * each with its own point, instead of one aggregate with a footnote. See
 * {@link aggregateByActualModel} for the exact splitting rule.
 */
export interface ActualModelAggregate {
    provider: string;
    /** What the caller asked for — a fixed model id, or a route like `openrouter/free`. */
    requestedModel: string;
    /** The model that actually served these calls, when the provider reported one. Absent means
     * either (a) this provider/route never reports `actualModel` at all (a fixed-model gateway,
     * not a route — e.g. Gemini, Anthropic today), or (b) it's a route that reported one for
     * *other* calls in this same requestedModel group but not for these particular calls — see
     * `unresolved`, which distinguishes the two so (b) is never silently treated as (a). */
    actualModel?: string;
    /** True only for case (b) above: this requestedModel group has at least one record with an
     * `actualModel`, but these particular records have none — a route that should be resolvable
     * but wasn't for this call. Always `false` for a provider that never reports `actualModel` at
     * all (case (a)) — there was nothing to resolve, so it isn't flagged as unresolved. */
    unresolved: boolean;
    scenarioCount: number;
    passCount: number;
    acceptedCount: number;
    totalInputTokens: number | null;
    totalOutputTokens: number | null;
    totalTokens: number | null;
    tokensIncomplete: boolean;
    totalElapsedMs: number;
    avgElapsedMs: number;
}

const routeKey = (provider: string, requestedModel: string): string => `${provider}::${requestedModel}`;

/**
 * Groups real-provider records by (provider, requestedModel — `record.model`), then splits each
 * group further by `actualModel`, but **only when at least one record in that requestedModel
 * group reported one**. A fixed-model provider that never reports `actualModel` (Gemini, Anthropic
 * today) therefore stays a single aggregate per requested model, exactly like
 * {@link aggregateVerificationMetrics}'s own grouping — this never invents a per-model split where
 * the provider gives no evidence one exists. A route like OpenRouter's `openrouter/free` splits
 * into one aggregate per distinct actual model it resolved to, plus a separate `unresolved: true`
 * aggregate for any call on that same route that didn't report one — never guessed, never merged
 * into an arbitrary one of the resolved models.
 */
export const aggregateByActualModel = (records: readonly VerificationRunRecord[]): ActualModelAggregate[] => {
    const byRoute = new Map<string, VerificationRunRecord[]>();
    for (const record of records) {
        const key = routeKey(record.provider, record.model);
        const arr = byRoute.get(key);
        if (arr) arr.push(record);
        else byRoute.set(key, [record]);
    }

    const aggregates: ActualModelAggregate[] = [];
    for (const routeRecords of byRoute.values()) {
        const { provider, model: requestedModel } = routeRecords[0];
        const routeHasAnyActualModel = routeRecords.some(r => r.actualModel !== undefined);

        const subGroups = new Map<string | undefined, VerificationRunRecord[]>();
        for (const r of routeRecords) {
            const key = routeHasAnyActualModel ? r.actualModel : undefined;
            const arr = subGroups.get(key);
            if (arr) arr.push(r);
            else subGroups.set(key, [r]);
        }

        for (const [actualModel, group] of subGroups) {
            let totalInputTokens: number | null = null;
            let inputMissing = false;
            let totalOutputTokens: number | null = null;
            let outputMissing = false;
            let totalElapsedMs = 0;
            for (const r of group) {
                if (r.inputTokens !== null) totalInputTokens = (totalInputTokens ?? 0) + r.inputTokens;
                else inputMissing = true;
                if (r.outputTokens !== null) totalOutputTokens = (totalOutputTokens ?? 0) + r.outputTokens;
                else outputMissing = true;
                totalElapsedMs += r.elapsedMs;
            }
            const totalTokens =
                totalInputTokens !== null || totalOutputTokens !== null
                    ? (totalInputTokens ?? 0) + (totalOutputTokens ?? 0)
                    : null;

            aggregates.push({
                provider,
                requestedModel,
                ...(actualModel !== undefined ? { actualModel } : {}),
                unresolved: routeHasAnyActualModel && actualModel === undefined,
                scenarioCount: group.length,
                passCount: group.filter(r => r.outcome === 'pass').length,
                acceptedCount: group.filter(r => isAcceptedOutcome(r.outcome)).length,
                totalInputTokens,
                totalOutputTokens,
                totalTokens,
                tokensIncomplete: inputMissing || outputMissing,
                totalElapsedMs,
                avgElapsedMs: totalElapsedMs / group.length,
            });
        }
    }

    return aggregates.sort(
        (a, b) =>
            a.provider.localeCompare(b.provider) ||
            a.requestedModel.localeCompare(b.requestedModel) ||
            (a.actualModel ?? '').localeCompare(b.actualModel ?? '')
    );
};

/** One plotted point's full identity: its opaque chart id, its normalized [0,1] coordinates, and
 * the real aggregate it came from. The single source of truth both `mermaidSource` and `svg` are
 * rendered from — never independently recomputed by either, so the two representations cannot
 * diverge from each other. */
export interface QuadrantPoint {
    pointId: string;
    x: number;
    y: number;
    aggregate: ActualModelAggregate;
}

export interface ElapsedVsTokensChart {
    /** Canonical, editable Mermaid `quadrantChart` source — plain Mermaid text, no ```mermaid code
     * fence, no Markdown wrapper (write this directly to a `.mmd` file as-is). Empty string when
     * nothing is plottable. Every point line is built from a plain string array joined with a
     * single literal `\n` — see `buildMermaidSource`'s own doc for why this specific construction
     * matters. */
    mermaidSource: string;
    /** A rendered SVG of the identical chart, built directly from {@link points} — not by parsing
     * or rendering `mermaidSource` through Mermaid itself (this repo takes no Mermaid-rendering
     * dependency), but from the same underlying coordinate/point-id data, so it is guaranteed
     * consistent with `mermaidSource` by construction. Empty string when nothing is plottable. */
    svg: string;
    /** The companion table (Point/Provider/Requested model/Actual model/Avg elapsed/Total tokens),
     * the excluded-records note, and the interpretation note — everything the old combined
     * `markdown` field carried except the chart itself, which now lives in `mermaidSource`/`svg`. */
    tableMarkdown: string;
    /** Every point actually plotted, in the same deterministic order as `mermaidSource`'s point
     * lines — the shared data both `mermaidSource` and `svg` render from. */
    points: readonly QuadrantPoint[];
    /** Aggregates actually plotted — every one reported a non-null `totalTokens`. */
    plotted: readonly ActualModelAggregate[];
    /** Aggregates left out of the chart because `totalTokens` is `null` (no scenario in that
     * group reported any usage at all) — never silently dropped from the report, always listed. */
    excluded: readonly ActualModelAggregate[];
}

/**
 * Real provider/model identifiers are NEVER placed in a Mermaid quadrant point label — not even
 * sanitized. Punctuation-stripping was tried first and proved insufficient in practice (real
 * identifiers like `anthropic/claude-haiku-4.5`, `openai/gpt-oss-20b:free`, or an
 * `(unresolved)`-suffixed label kept finding new ways to break Mermaid's lexer as new model ids
 * were added) — a durable fix has to stop relying on which punctuation happens to be safe today.
 * Instead every plotted point gets an opaque, deterministic id (`M01`, `M02`, ...), assigned by
 * its position in the already-deterministically-sorted `plotted` array (see
 * {@link aggregateByActualModel}'s stable sort) — same input records always produce the same ids
 * in the same order. The id matches a fixed, minimal grammar (`M` + digits) that can never contain
 * a slash, colon, bracket, parenthesis, or space, regardless of what any provider ever names a
 * model. The real provider/requestedModel/actualModel strings move to the companion table's own
 * `Point` column (see {@link buildElapsedVsTokensChart}) — never lost, just never inside the
 * Mermaid block itself.
 */
const formatQuadrantPointId = (index: number): string => `M${String(index + 1).padStart(2, '0')}`;

/** Min-max normalize into Mermaid quadrantChart's required [0, 1] point range. A single point (or
 * every point sharing the same value) would divide by zero — placed at the midpoint instead, not
 * NaN/0, since "no spread" isn't the same claim as "smallest possible value". */
const normalizeToUnitRange = (value: number, min: number, max: number): number =>
    max === min ? 0.5 : (value - min) / (max - min);

const formatChartTokenCell = (aggregate: ActualModelAggregate): string => {
    const tokens = aggregate.totalTokens as number; // caller only passes plottable (non-null) aggregates
    return aggregate.tokensIncomplete ? `${tokens}*` : String(tokens);
};

/** The label a chart point/table row uses to identify a model. A fixed-model provider (no
 * `actualModel` evidence anywhere on this route) is identified by its requested model — nothing
 * to resolve. A route with a resolved `actualModel` is identified by that actual model, never the
 * requested route, so two actual models served through the same route never collapse into one
 * label. A route call that reported no `actualModel`, on a route where *other* calls did, is
 * labeled `(unresolved)` rather than guessed. */
const modelLabel = (a: ActualModelAggregate): string => {
    if (a.actualModel !== undefined) return a.actualModel;
    if (a.unresolved) return `${a.requestedModel} (unresolved)`;
    return a.requestedModel;
};

/**
 * Canonical Mermaid `quadrantChart` source for `points` — plain text, no ```mermaid code fence, no
 * Markdown wrapper (this is exactly what gets written to `elapsed-vs-tokens.mmd`). Built as a
 * plain string array joined with a single literal `\n` — never string concatenation, never
 * template-literal interpolation of multi-line content — so every point is guaranteed its own,
 * fully-separated source line; see `verificationMetrics.spec.ts`'s newline-separation regression
 * test for the byte-level check this claim is held to.
 */
const buildMermaidSource = (points: readonly QuadrantPoint[]): string =>
    [
        'quadrantChart',
        '    title Average elapsed time vs. consumed tokens by model',
        '    x-axis Low elapsed --> High elapsed',
        '    y-axis Low tokens --> High tokens',
        '    quadrant-1 Slower, more tokens',
        '    quadrant-2 Faster, more tokens',
        '    quadrant-3 Faster, fewer tokens',
        '    quadrant-4 Slower, fewer tokens',
        ...points.map(p => `    ${p.pointId}: [${p.x.toFixed(2)}, ${p.y.toFixed(2)}]`),
    ].join('\n');

const SVG_SIZE = 520;
const SVG_MARGIN = 56;
const SVG_PLOT_SIZE = SVG_SIZE - SVG_MARGIN * 2;

/** x in [0,1] -> svg x: left = low elapsed, right = high elapsed (matches the Mermaid x-axis). */
const toSvgX = (x: number): number => SVG_MARGIN + x * SVG_PLOT_SIZE;
/** y in [0,1] -> svg y: SVG's own y grows downward, the opposite of "high tokens = higher on the
 * chart" — inverted once here, rather than left as a footgun at every call site. */
const toSvgY = (y: number): number => SVG_MARGIN + (1 - y) * SVG_PLOT_SIZE;

/**
 * A rendered SVG of the identical chart `buildMermaidSource` describes, built directly from the
 * same `points` array — never by parsing or rendering `mermaidSource` itself (this repo takes no
 * Mermaid-rendering dependency: no `@mermaid-js/mermaid-cli`, no headless-browser install). Only
 * ever contains opaque `M<digits>` point ids and this function's own static English labels —
 * never a raw provider/model string — so, like the Mermaid source, it structurally cannot
 * reintroduce the punctuation-in-a-label failure this whole design exists to prevent.
 */
const buildElapsedVsTokensSvg = (points: readonly QuadrantPoint[]): string => {
    const mid = SVG_MARGIN + SVG_PLOT_SIZE / 2;
    const right = SVG_MARGIN + SVG_PLOT_SIZE;
    const bottom = SVG_MARGIN + SVG_PLOT_SIZE;

    const pointMarkup = points.flatMap(p => {
        const cx = toSvgX(p.x);
        const cy = toSvgY(p.y);
        return [
            `    <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="5" fill="#2563eb" />`,
            `    <text x="${(cx + 8).toFixed(1)}" y="${(cy - 8).toFixed(1)}" font-size="12" font-family="monospace" fill="#111">${p.pointId}</text>`,
        ];
    });

    return [
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_SIZE} ${SVG_SIZE}" width="${SVG_SIZE}" height="${SVG_SIZE}" font-family="sans-serif">`,
        `    <rect x="0" y="0" width="${SVG_SIZE}" height="${SVG_SIZE}" fill="#ffffff" />`,
        `    <text x="${SVG_SIZE / 2}" y="20" font-size="14" text-anchor="middle" fill="#111">Average elapsed time vs. consumed tokens by model</text>`,
        `    <rect x="${SVG_MARGIN}" y="${SVG_MARGIN}" width="${SVG_PLOT_SIZE}" height="${SVG_PLOT_SIZE}" fill="none" stroke="#999" />`,
        `    <line x1="${mid}" y1="${SVG_MARGIN}" x2="${mid}" y2="${bottom}" stroke="#ddd" />`,
        `    <line x1="${SVG_MARGIN}" y1="${mid}" x2="${right}" y2="${mid}" stroke="#ddd" />`,
        `    <text x="${SVG_MARGIN + 4}" y="${SVG_MARGIN + 16}" font-size="10" fill="#555">Faster, more tokens</text>`,
        `    <text x="${right - 4}" y="${SVG_MARGIN + 16}" font-size="10" text-anchor="end" fill="#555">Slower, more tokens</text>`,
        `    <text x="${SVG_MARGIN + 4}" y="${bottom - 8}" font-size="10" fill="#555">Faster, fewer tokens</text>`,
        `    <text x="${right - 4}" y="${bottom - 8}" font-size="10" text-anchor="end" fill="#555">Slower, fewer tokens</text>`,
        `    <text x="${SVG_SIZE / 2}" y="${SVG_SIZE - 14}" font-size="11" text-anchor="middle" fill="#111">Low elapsed --&gt; High elapsed</text>`,
        `    <text x="16" y="${SVG_SIZE / 2}" font-size="11" text-anchor="middle" fill="#111" transform="rotate(-90 16 ${SVG_SIZE / 2})">Low tokens --&gt; High tokens</text>`,
        ...pointMarkup,
        '</svg>',
    ].join('\n');
};

/**
 * A two-dimensional view of every (provider, requested model, actual model) aggregate — x = avg
 * elapsed time, y = consumed (total) tokens, point label = the actual model that served the calls
 * when one was reported, else the requested model — built directly from real-provider records via
 * {@link aggregateByActualModel}, so it regenerates automatically every time the report does
 * rather than needing to be hand-maintained.
 *
 * A route (e.g. OpenRouter's `openrouter/free`) that resolved to more than one actual model across
 * its calls gets one point per actual model — never one point silently averaging two different
 * models' cost/speed profiles together. A route call with no reported `actualModel`, on a route
 * where other calls did report one, gets its own explicitly `(unresolved)`-labeled point — never
 * guessed onto one of the resolved models.
 *
 * Never fabricates a token value: an aggregate with `totalTokens === null` (no scenario in that
 * group reported any usage) is excluded from the plotted points entirely — Mermaid has no
 * "unknown" coordinate — and listed explicitly in `excluded`/the note in `tableMarkdown` instead of
 * being silently dropped or coerced to 0. A partial total (`tokensIncomplete: true`) IS plotted
 * (it's a real, if incomplete, number) and marked with the same `*` convention as
 * {@link formatMetricsMarkdownTable}, in the companion table.
 */
export const buildElapsedVsTokensChart = (records: readonly VerificationRunRecord[]): ElapsedVsTokensChart => {
    const aggregates = aggregateByActualModel(records);
    const plotted = aggregates.filter(a => a.totalTokens !== null);
    const excluded = aggregates.filter(a => a.totalTokens === null);

    const excludedNote =
        excluded.length > 0
            ? `\n\n${excluded.length} record(s) excluded from the chart — no token usage reported at all ` +
              `(never coerced to 0): ${excluded.map(a => `${a.provider} ${modelLabel(a)}`).join(', ')}.`
            : '';

    if (plotted.length === 0) {
        return {
            mermaidSource: '',
            svg: '',
            tableMarkdown:
                '_No plottable elapsed-time/token data — no aggregate reported a token total._' + excludedNote,
            points: [],
            plotted,
            excluded,
        };
    }

    const elapsedValues = plotted.map(a => a.avgElapsedMs);
    const tokenValues = plotted.map(a => a.totalTokens as number);
    const minElapsed = Math.min(...elapsedValues);
    const maxElapsed = Math.max(...elapsedValues);
    const minTokens = Math.min(...tokenValues);
    const maxTokens = Math.max(...tokenValues);

    // One id + one pair of normalized coordinates per plotted point, by array position — `plotted`
    // is already deterministically ordered (aggregateByActualModel's stable sort), so the same
    // input records always yield the same ids in the same order across regenerations. Both
    // `mermaidSource` and `svg` render from this exact array — neither recomputes independently.
    const points: QuadrantPoint[] = plotted.map((a, i) => ({
        pointId: formatQuadrantPointId(i),
        x: normalizeToUnitRange(a.avgElapsedMs, minElapsed, maxElapsed),
        y: normalizeToUnitRange(a.totalTokens as number, minTokens, maxTokens),
        aggregate: a,
    }));

    const mermaidSource = buildMermaidSource(points);
    const svg = buildElapsedVsTokensSvg(points);

    const tableLines = [
        '| Point | Provider | Requested model | Actual model | Avg elapsed | Total tokens |',
        '| --- | --- | --- | --- | ---: | ---: |',
        ...points.map(
            p =>
                `| ${p.pointId} | ${p.aggregate.provider} | ${p.aggregate.requestedModel} | ` +
                `${p.aggregate.actualModel ?? (p.aggregate.unresolved ? 'unresolved' : '—')} | ` +
                `${Math.round(p.aggregate.avgElapsedMs)}ms | ${formatChartTokenCell(p.aggregate)} |`
        ),
    ];

    const interpretationNote =
        '\n\n_Lower-left generally means faster and fewer tokens — this chart does not by itself measure ' +
        'correctness; see the Pass/Accepted columns in the table above it for that._' +
        '\n\n_A route (e.g. `openrouter/free`) is not a fixed model — "Requested model" is what the caller ' +
        'asked for, "Actual model" is what the provider reported actually serving that call. A row where ' +
        'these differ is a route resolving to a specific underlying model._';

    return {
        mermaidSource,
        svg,
        tableMarkdown: tableLines.join('\n') + excludedNote + interpretationNote,
        points,
        plotted,
        excluded,
    };
};

const csvEscape = (value: string): string => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

const numberOrEmpty = (value: number | null | undefined): string =>
    value === null || value === undefined ? '' : String(value);

/**
 * One row per scenario attempt — the exact-value companion to {@link formatMetricsMarkdownTable},
 * which aggregates. Canonical model ids are preserved exactly; the opaque `M01`/`M02`-style point
 * ids {@link buildElapsedVsTokensChart} assigns for its Mermaid block are that chart's own
 * display-only concern and never apply here. Missing (never-fabricated-zero) usage/cost fields are
 * emitted as empty CSV cells, not `0`.
 */
export const formatVerificationRecordsCsv = (records: readonly VerificationRunRecord[]): string => {
    const header = [
        'provider',
        'model',
        'actualModel',
        'scenarioId',
        'outcome',
        'startedAt',
        'endedAt',
        'elapsedMs',
        'inputTokens',
        'cachedInputTokens',
        'cacheWriteInputTokens',
        'cacheWriteTtl',
        'outputTokens',
        'reasoningTokens',
        'toolUseInputTokens',
        'providerTotalTokens',
        'providerReportedCost',
        'estimatedCost',
        'costSource',
        'pricingVersion',
        'toolCallName',
        'argsValid',
        'dispatchOk',
        'canvasStateCorrect',
        'retries',
        'errorCategory',
    ];
    const boolOrEmpty = (value: boolean | undefined): string => (value === undefined ? '' : String(value));
    const lines = [header.join(',')];
    for (const r of records) {
        lines.push(
            [
                r.provider,
                r.model,
                r.actualModel ?? '',
                r.scenarioId,
                r.outcome,
                String(r.startedAt),
                String(r.endedAt),
                String(r.elapsedMs),
                numberOrEmpty(r.inputTokens),
                numberOrEmpty(r.cachedInputTokens),
                numberOrEmpty(r.cacheWriteInputTokens),
                r.cacheWriteTtl ?? '',
                numberOrEmpty(r.outputTokens),
                numberOrEmpty(r.reasoningTokens),
                numberOrEmpty(r.toolUseInputTokens),
                numberOrEmpty(r.providerTotalTokens),
                numberOrEmpty(r.providerReportedCost),
                numberOrEmpty(r.estimatedCost),
                r.costSource ?? '',
                r.pricingVersion ?? '',
                r.toolCallName ?? '',
                boolOrEmpty(r.argsValid),
                boolOrEmpty(r.dispatchOk),
                boolOrEmpty(r.canvasStateCorrect),
                numberOrEmpty(r.retries),
                r.errorCategory ?? '',
            ]
                .map(csvEscape)
                .join(',')
        );
    }
    return lines.join('\n');
};

/**
 * Scenario-level JSONL artifact — one JSON object per line, one line per scenario attempt. Same
 * field set as {@link formatVerificationRecordsCsv}, in its native (non-string) shape; suitable
 * for streaming/append-only writes during a long benchmark run, unlike the JSON array report
 * (`buildVerificationMetricsReport`), which needs the full record set up front.
 */
export const formatVerificationRecordsJsonl = (records: readonly VerificationRunRecord[]): string =>
    records.map(r => JSON.stringify(r)).join('\n');
