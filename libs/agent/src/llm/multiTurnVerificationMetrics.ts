import { COST_CURRENCY } from './pricing';

import type { GenerationConfiguration, GenerationParameterValue } from './providerRegistry';
import type { ExtendedUsageInfo, UsageTotals } from './verificationMetrics';
import type {
    MultiTurnCompletionMode,
    MultiTurnStrategy,
    MultiTurnTaskOutcome,
    MultiTurnTurnTrace,
} from './verifyLocatorScenarios';
import type { XY } from '../canvas/canvasBinding';

/**
 * Pure, offline-testable aggregation/reporting layer for the LIVE multi-turn locator pilot
 * (`realMultiTurnLocatorScenarios.spec.ts`). Deliberately separate from `verificationMetrics.ts`
 * (the single-turn report): different record shape (a whole multi-turn *task* per attempt, not one
 * `gateway.chat()` call), different outcome vocabulary (no `knownVariance`/`pass`/`known-variance`
 * — see `MultiTurnReportingOutcome`), and a different output location, so neither format nor file
 * ever collides with or overwrites the existing single-turn `latest.md`/`latest.json`. No
 * filesystem or process.env access here — the env-gated live spec owns timing, file writing, and
 * env parsing; this module only aggregates and formats already-captured records. See
 * `multiTurnVerificationMetrics.spec.ts` for coverage using synthetic records (no API key needed,
 * no network).
 */

// =============================================================================================
// Statistics — pure helpers, task H. Every one returns `null` (never a fabricated 0) for an
// empty/undefined input, since "no data" and "the data was 0" are different facts and this module
// must never blur them (see the "missing data must remain missing, not zero" requirement).
// =============================================================================================

/** Arithmetic mean. `null` for an empty array. */
export const mean = (values: readonly number[]): number | null =>
    values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;

/** Median (50th percentile) via linear interpolation between the two middle sorted values for an
 * even count — the standard statistical median, not a rank pick. `null` for an empty array. */
export const median = (values: readonly number[]): number | null => {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

/**
 * P90 via the **nearest-rank method**: sort ascending, take the value at rank `ceil(0.9 * n)`
 * (1-indexed) — i.e. array index `ceil(0.9 * n) - 1`. Chosen over linear interpolation
 * deliberately: nearest-rank always returns a value that was actually observed in an attempt,
 * never an interpolated point between two samples, which is easier to reason about (and to trace
 * back to a specific attempt) at the small sample sizes a repetition-5-or-so pilot produces. This
 * is the same method documented in the generated report's own P90 column footnote — keep both in
 * sync if this ever changes. `null` for an empty array.
 */
export const p90NearestRank = (values: readonly number[]): number | null => {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const rank = Math.ceil(0.9 * sorted.length);
    const index = Math.min(Math.max(rank, 1), sorted.length) - 1;
    return sorted[index];
};

/** `successCount / totalCount`. `null` (never `0`) when `totalCount` is 0 — an undefined rate,
 * not an observed 0% rate. */
export const successRate = (successCount: number, totalCount: number): number | null =>
    totalCount === 0 ? null : successCount / totalCount;

/** `totalCost / successCount`. `null` when there were zero successes (undefined — nothing to
 * divide by, not "free") or `totalCost` itself is `null` (no cost data captured at all). */
export const costPerSuccessfulTask = (totalCost: number | null, successCount: number): number | null =>
    successCount === 0 || totalCost === null ? null : totalCost / successCount;

// =============================================================================================
// Record shape — one row per (provider, model, scenario, repetition attempt), task C/E.
// =============================================================================================

/**
 * The live runner's reporting-layer outcome. `runMultiTurnLocatorScenario` itself (`verifyLocatorScenarios.ts`)
 * has no concept of a timeout — it just runs until `maxTurns` or a thrown error — so `'timeout'` is
 * added here, one layer up, by the live runner's own outer task-level race (see
 * `realMultiTurnLocatorScenarios.spec.ts`'s `raceWithTaskTimeout`). Never fed back into
 * `MultiTurnTaskOutcome` itself.
 */
export type MultiTurnReportingOutcome = MultiTurnTaskOutcome | 'timeout';

/**
 * One full multi-turn task attempt (a single `runMultiTurnLocatorScenario` call, or a task-level
 * timeout in its place). `requestedToolSequence` is named deliberately, not `toolSequence` or
 * `executedToolSequence`: it is the sequence of tool calls the model requested and the harness
 * *attempted* to dispatch, in order — a per-turn `dispatchOk: false` in `turns` means that specific
 * attempt did not execute successfully, so this array alone never proves every entry ran; check
 * `turns[].dispatchOk` for that.
 */
export interface MultiTurnLiveRecord extends UsageTotals, ExtendedUsageInfo {
    provider: string;
    providerId: string;
    /** What was asked for — always present, independent of what the provider says actually served it. */
    requestedModel: string;
    /** What the provider reports actually served the call, when it reports one. Absent (never
     * fabricated) when the provider doesn't report it, or no call completed. */
    actualModel?: string;
    scenarioId: string;
    /** 1-indexed position within this (provider, model, scenario)'s repetition run. */
    attempt: number;
    /** The configured repetition count for this run — the same value on every record in the run,
     * kept per-record (rather than only in the run manifest) so a single record is self-describing
     * when read in isolation (e.g. from the JSONL stream). */
    repetitions: number;
    maxTurns: number;
    outcome: MultiTurnReportingOutcome;
    strategy: MultiTurnStrategy;
    /** See {@link MultiTurnCompletionMode} — orthogonal to `strategy` (which describes how the run
     * STARTED); this describes how a SUCCESSFUL run ENDED (tool call vs. text on its terminal
     * turn). Always `'none'` for `'failure'`, `'provider-error'`, `'timeout'`, and `'max-turns'` —
     * never derived from, or used to derive, `outcome`. */
    completionMode: MultiTurnCompletionMode;
    turnCount: number;
    requestedToolSequence: string[];
    turns: MultiTurnTurnTrace[];
    /** Canvas node positions at task start / after the task ended, exactly as
     * `runMultiTurnLocatorScenario` (`verifyLocatorScenarios.ts`) reported them — present whenever
     * that function actually returned a result (every outcome except `'timeout'`, which is added
     * one layer up by the live runner's own task-level race and has no underlying result to read
     * positions from at all). Absent, never fabricated as `{}`, for a `'timeout'` attempt. */
    positionsBefore?: Record<string, XY>;
    positionsAfter?: Record<string, XY>;
    /**
     * `finalStateCorrect` means the scenario's own strict final `check()` passed — i.e.
     * `outcome === 'success'`, restated under this more specific name for direct grep/CSV/chart
     * use. Not an independent judgment: `check()` already validates whatever it validates as part
     * of deciding `success` for every scenario in this matrix, the same convention the single-turn
     * report's `canvasStateCorrect` field documents. Always `false` for `'failure'`,
     * `'provider-error'`, `'max-turns'`, and `'timeout'` — a run that didn't reach a validated
     * success is never marked correct merely because the canvas happened to look plausible.
     *
     * For a MOVEMENT scenario (e.g. `move-node-right`, `move-named-node-without-id`), that strict
     * check does compare canvas coordinates before/after. But for a TEXT-RESOLUTION scenario (e.g.
     * `ambiguous-instruction`, `no-tool-refusal`, `no-op-instruction`) `check()`'s own definition of
     * "correct" is that the canvas stayed UNCHANGED and the model produced an appropriate text
     * response — `finalStateCorrect: true` there does NOT mean any coordinate changed; it means the
     * scenario's own success condition (whatever that condition is) was met. Never read this field
     * as "a node moved" without also checking which scenario produced it.
     */
    finalStateCorrect: boolean;
    startedAt: number;
    endedAt: number;
    elapsedMs: number;
    /** The single authoritative cost figure for this attempt: `providerReportedCost` when present,
     * else `estimatedCost` when it's a genuine number (never the `null` "pricing unknown" case) —
     * same preference order as `costSource` describes, resolved to one number so a consumer that
     * just wants "the cost" doesn't need to re-implement the preference logic. Absent when neither
     * is available (not fabricated as 0). */
    effectiveCost?: number;
    error?: string;
}

/** Mirrors `verificationMetrics.ts`'s private (unexported) `effectiveCost` helper — kept
 * byte-for-byte identical in behavior (provider-reported preferred, else a genuine numeric
 * estimate, else absent) since it can't be imported from there. See
 * `runMultiTurnLocatorScenario`'s own `toolResultToMessageContent` in `verifyLocatorScenarios.ts`
 * for the same "private helper, can't import, kept behaviorally identical" precedent in this
 * codebase. */
export const resolveEffectiveCost = (
    usage: Pick<ExtendedUsageInfo, 'providerReportedCost' | 'estimatedCost'>
): number | undefined => {
    if (usage.providerReportedCost !== undefined) return usage.providerReportedCost;
    if (typeof usage.estimatedCost === 'number') return usage.estimatedCost;
    return undefined;
};

// =============================================================================================
// Model-level summary — task G, first table.
// =============================================================================================

export interface MultiTurnModelSummary {
    provider: string;
    providerId: string;
    requestedModel: string;
    taskAttempts: number;
    successes: number;
    /** Successes classified `strategy: 'direct'` — see `classifyMultiTurnStrategy` in
     * `verifyLocatorScenarios.ts`. Never counts a non-`success` outcome, however strategy-like it looked. */
    directSuccesses: number;
    /** Successes classified `strategy: 'lookup-first'`. A `lookup-first` attempt that ended in
     * `failure`/`provider-error`/`max-turns` is NOT counted here — see `failures`/`providerErrors`/
     * `maxTurnsCount` instead; this module never calls a non-success outcome "accepted" merely
     * because its strategy looks like a reasonable attempt. */
    lookupFirstSuccesses: number;
    textOnlySuccesses: number;
    failures: number;
    providerErrors: number;
    timeouts: number;
    maxTurnsCount: number;
    // --- Completion mode — orthogonal to strategy (see MultiTurnCompletionMode's own doc): how a
    // successful run's TERMINAL turn completed, not how it started. -------------------------------
    /** Successes whose terminal turn made a tool call (`completionMode === 'tool-action'`) —
     * includes `direct` and `lookup-first` successes that ended by calling an action tool (or, in
     * the rare `list-nodes-read-only`-style case, `list_nodes` itself). Never counts a `text-only`
     * success, by construction (a text-only success has no terminal tool call). */
    toolActionSuccesses: number;
    /** Successes whose terminal turn had no tool call (`completionMode === 'text-response'`) —
     * includes every `text-only` success AND any `lookup-first` success that ended with an accepted
     * text response after an earlier `list_nodes` call (e.g. `ambiguous-instruction` resolved via
     * lookup then clarification). */
    textResponseSuccesses: number;
    /** `taskAttempts - successes` — every attempt whose `completionMode` is `'none'`
     * (`failure`/`provider-error`/`timeout`/`max-turns`). Named for the completion-mode comparison,
     * not a new independent count: it is always exactly the non-success remainder. */
    incompleteAttempts: number;
    /** Count of {@link isSuccessfulLookupActionRoundTrip} over this group — a genuine
     * `list_nodes` → tool result → later non-`list_nodes` action-tool round trip that also
     * succeeded. Strictly narrower than `lookupFirstSuccesses`: a lookup-first success that ended
     * via text (never reaching a second, acting tool call) is excluded — see that function's own
     * doc for the exact four-part definition. */
    successfulLookupActionRoundTrips: number;
    /** `successes / taskAttempts`. The only "success rate" — `MultiTurnTaskOutcome === 'success'`
     * is the sole source of truth; strategy never changes this. */
    finalSuccessRate: number | null;
    /** `directSuccesses / taskAttempts` — same denominator as `finalSuccessRate` (all attempts,
     * not just successes), so the three per-strategy rates are directly comparable to each other
     * and to the overall rate. */
    directSuccessRate: number | null;
    /** `lookupFirstSuccesses / taskAttempts`. */
    lookupFirstSuccessRate: number | null;
    averageTurns: number | null;
    medianTurns: number | null;
    totalElapsedMs: number;
    averageElapsedMs: number | null;
    medianElapsedMs: number | null;
    /** Nearest-rank P90 — see {@link p90NearestRank}'s doc for the exact method. */
    p90ElapsedMs: number | null;
    // --- Basic, normalized token metrics (UsageTotals.totalTokens: input+output only) ---------
    /** Mean of `totalTokens` over attempts that reported it (denominator: `basicTokenAttemptCount`,
     * NOT `taskAttempts`). Deliberately never mixed with `averageProviderTotalTokens` below — the
     * two are different quantities, computed different ways (see that field's own doc). */
    averageBasicTotalTokens: number | null;
    /** How many attempts in this group reported a non-null `totalTokens` — the denominator behind
     * `averageBasicTotalTokens`. */
    basicTokenAttemptCount: number;
    /** `true` when `basicTokenAttemptCount < taskAttempts` — i.e. at least one attempt is missing
     * `totalTokens`. Affects ONLY `averageBasicTotalTokens`'s cell in the Markdown table — a missing
     * `providerTotalTokens` or `effectiveCost` elsewhere in the group never sets this (see
     * `providerTokenDataPartial`/`costDataPartial`, tracked completely independently). */
    basicTokenDataPartial: boolean;

    // --- Provider-reported raw token totals (may include cached/reasoning tokens some providers
    // fold in — never comparable to, or mixed with, the basic normalized figures above) ---------
    /** Mean of `providerTotalTokens` over attempts that reported it (denominator:
     * `providerTokenAttemptCount`, NOT `taskAttempts`). Absent (not `null`-as-zero) when no
     * attempt in the group reported it at all — `providerTokenAttemptCount` is then `0`. */
    averageProviderTotalTokens: number | null;
    /** How many attempts in this group reported a `providerTotalTokens` value. */
    providerTokenAttemptCount: number;
    /** `true` when `providerTokenAttemptCount < taskAttempts`. Affects ONLY
     * `averageProviderTotalTokens`'s cell — independent of `basicTokenDataPartial`/`costDataPartial`. */
    providerTokenDataPartial: boolean;

    // --- Cost (effectiveCost: providerReportedCost preferred, else a genuine numeric estimate) ---
    /** Sum of {@link MultiTurnLiveRecord.effectiveCost} over attempts that report one — "known"
     * cost, explicitly not claiming to cover every attempt. `null` when NO attempt in the group has
     * any cost figure at all (never a fabricated 0). */
    totalKnownCost: number | null;
    /** Mean of `effectiveCost` over attempts that report one — denominator is `pricedAttemptCount`,
     * NOT `taskAttempts` (that distinction is exactly why this isn't named `averageCostPerAttempt`:
     * an unpriced attempt is excluded from this average entirely, not averaged in as a 0). */
    averageKnownCostPerPricedAttempt: number | null;
    /** How many attempts in this group reported an `effectiveCost` at all — the denominator behind
     * both cost averages above, and the numerator of `costCoverageRate`. */
    pricedAttemptCount: number;
    /** `pricedAttemptCount / taskAttempts` — what fraction of attempts have ANY cost figure
     * (provider-reported or estimated). `null` only in the (practically unreachable) case of an
     * empty group. */
    costCoverageRate: number | null;
    /** `true` when `pricedAttemptCount < taskAttempts`. Affects ONLY the three cost cells
     * (`totalKnownCost`, `averageKnownCostPerPricedAttempt`, `costPerSuccessfulTask`) — independent
     * of `basicTokenDataPartial`/`providerTokenDataPartial`, even though all three commonly co-occur
     * on the SAME underlying gap (a call whose usage was never captured has no tokens OR cost). */
    costDataPartial: boolean;
    /** `totalKnownCost / successes` — see {@link costPerSuccessfulTask}. `null` with zero successes,
     * regardless of cost data completeness (a zero-success group has no successful task to divide
     * by, independent of `costDataPartial`). When `costDataPartial` is `true`, this figure is based
     * on known cost only — see that field's own doc — and is marked `*` in the Markdown table for
     * exactly that reason, never presented as a complete total. */
    costPerSuccessfulTask: number | null;
}

const groupKey = (provider: string, providerId: string, model: string): string =>
    `${provider}::${providerId}::${model}`;

const definedValues = <T>(group: readonly T[], pick: (r: T) => number | undefined): number[] =>
    group.map(pick).filter((v): v is number => v !== undefined);

/**
 * A genuine `list_nodes` → tool result → later action-tool round trip that also succeeded — the
 * specific evidence this benchmark set out to capture (see `move-named-node-without-id`'s own
 * design doc in `verifyLocatorScenarios.ts`). All four conditions must hold:
 *
 * 1. `outcome === 'success'`.
 * 2. `strategy === 'lookup-first'` — the FIRST tool call was `list_nodes`.
 * 3. `completionMode === 'tool-action'` — the run ended via a tool call, not text.
 * 4. `requestedToolSequence` begins with `list_nodes` AND contains at least one later entry that
 *    is NOT `list_nodes` — i.e. a real acting tool call happened after the lookup, not just a
 *    repeated (or solitary) `list_nodes` call.
 *
 * Condition 4 is what excludes `list-nodes-read-only`-style successes (where `list_nodes` itself
 * is the terminal, satisfying tool call — `completionMode` is `'tool-action'` and `strategy` is
 * `'lookup-first'`, but there is no LATER acting tool call) and what excludes a lookup-then-text
 * success like `ambiguous-instruction` resolved via `list_nodes` then a clarifying question
 * (`completionMode` there is `'text-response'`, already excluded by condition 3 alone — condition
 * 4 is the second, independent guard against the read-only-lookup edge case).
 */
export const isSuccessfulLookupActionRoundTrip = (
    record: Pick<MultiTurnLiveRecord, 'outcome' | 'strategy' | 'completionMode' | 'requestedToolSequence'>
): boolean => {
    if (record.outcome !== 'success') return false;
    if (record.strategy !== 'lookup-first') return false;
    if (record.completionMode !== 'tool-action') return false;
    const [first, ...rest] = record.requestedToolSequence;
    if (first !== 'list_nodes') return false;
    return rest.some(name => name !== 'list_nodes');
};

/** Groups {@link MultiTurnLiveRecord}s by (provider, providerId, requestedModel) and computes the
 * model-level summary — task G's first table. Never fabricates a total/average field: each stays
 * `null` unless at least one record in the group actually reported the underlying value. */
export const aggregateMultiTurnByModel = (records: readonly MultiTurnLiveRecord[]): MultiTurnModelSummary[] => {
    const groups = new Map<string, MultiTurnLiveRecord[]>();
    for (const record of records) {
        const key = groupKey(record.provider, record.providerId, record.requestedModel);
        const arr = groups.get(key);
        if (arr) arr.push(record);
        else groups.set(key, [record]);
    }

    const summaries: MultiTurnModelSummary[] = [];
    for (const group of groups.values()) {
        const { provider, providerId, requestedModel } = group[0];
        const taskAttempts = group.length;

        const successes = group.filter(r => r.outcome === 'success').length;
        const directSuccesses = group.filter(r => r.outcome === 'success' && r.strategy === 'direct').length;
        const lookupFirstSuccesses = group.filter(r => r.outcome === 'success' && r.strategy === 'lookup-first').length;
        const textOnlySuccesses = group.filter(r => r.outcome === 'success' && r.strategy === 'text-only').length;
        const failures = group.filter(r => r.outcome === 'failure').length;
        const providerErrors = group.filter(r => r.outcome === 'provider-error').length;
        const timeouts = group.filter(r => r.outcome === 'timeout').length;
        const maxTurnsCount = group.filter(r => r.outcome === 'max-turns').length;

        const toolActionSuccesses = group.filter(r => r.completionMode === 'tool-action').length;
        const textResponseSuccesses = group.filter(r => r.completionMode === 'text-response').length;
        const successfulLookupActionRoundTrips = group.filter(isSuccessfulLookupActionRoundTrip).length;

        const elapsedValues = group.map(r => r.elapsedMs);
        const turnValues = group.map(r => r.turnCount);
        const totalElapsedMs = elapsedValues.reduce((sum, v) => sum + v, 0);

        // Three independent coverage checks — deliberately NOT combined into one flag (see each
        // field's own doc on MultiTurnModelSummary): a missing providerTotalTokens must never mark
        // the basic-token or cost figures partial, and vice versa for the other two.
        const basicTokenValues = definedValues(group, r => r.totalTokens ?? undefined);
        const basicTokenAttemptCount = basicTokenValues.length;

        const providerTokenValues = definedValues(group, r => r.providerTotalTokens);
        const providerTokenAttemptCount = providerTokenValues.length;

        const costValues = definedValues(group, r => r.effectiveCost);
        const pricedAttemptCount = costValues.length;
        const totalKnownCost = pricedAttemptCount > 0 ? costValues.reduce((sum, v) => sum + v, 0) : null;

        summaries.push({
            provider,
            providerId,
            requestedModel,
            taskAttempts,
            successes,
            directSuccesses,
            lookupFirstSuccesses,
            textOnlySuccesses,
            failures,
            providerErrors,
            timeouts,
            maxTurnsCount,
            toolActionSuccesses,
            textResponseSuccesses,
            incompleteAttempts: taskAttempts - successes,
            successfulLookupActionRoundTrips,
            finalSuccessRate: successRate(successes, taskAttempts),
            directSuccessRate: successRate(directSuccesses, taskAttempts),
            lookupFirstSuccessRate: successRate(lookupFirstSuccesses, taskAttempts),
            averageTurns: mean(turnValues),
            medianTurns: median(turnValues),
            totalElapsedMs,
            averageElapsedMs: mean(elapsedValues),
            medianElapsedMs: median(elapsedValues),
            p90ElapsedMs: p90NearestRank(elapsedValues),
            averageBasicTotalTokens: mean(basicTokenValues),
            basicTokenAttemptCount,
            basicTokenDataPartial: basicTokenAttemptCount < taskAttempts,
            averageProviderTotalTokens: mean(providerTokenValues),
            providerTokenAttemptCount,
            providerTokenDataPartial: providerTokenAttemptCount < taskAttempts,
            totalKnownCost,
            averageKnownCostPerPricedAttempt: mean(costValues),
            pricedAttemptCount,
            costCoverageRate: successRate(pricedAttemptCount, taskAttempts),
            costDataPartial: pricedAttemptCount < taskAttempts,
            costPerSuccessfulTask: costPerSuccessfulTask(totalKnownCost, successes),
        });
    }

    return summaries.sort(
        (a, b) => a.provider.localeCompare(b.provider) || a.requestedModel.localeCompare(b.requestedModel)
    );
};

// =============================================================================================
// Scenario-level summary — task G, second table.
// =============================================================================================

export interface MultiTurnScenarioSummary {
    provider: string;
    requestedModel: string;
    scenarioId: string;
    attempts: number;
    successRate: number | null;
    directSuccessCount: number;
    lookupFirstSuccessCount: number;
    failureCount: number;
    providerErrorCount: number;
    timeoutCount: number;
    maxTurnsCount: number;
    /** Over ALL attempts in this (provider, model, scenario) group, regardless of outcome — same
     * "every attempt counts toward latency" convention as the model-level summary. */
    medianElapsedMs: number | null;
    /** Nearest-rank P90 — see {@link p90NearestRank}'s own doc for the exact method. Over ALL
     * attempts, exactly like `medianElapsedMs` above. */
    p90ElapsedMs: number | null;
    averageTurns: number | null;
    // --- Cost (effectiveCost: providerReportedCost preferred, else a genuine numeric estimate) ---
    // Same semantics as MultiTurnModelSummary's cost block: missing cost is never treated as 0.
    /** Sum of {@link MultiTurnLiveRecord.effectiveCost} over attempts in this group that report
     * one — "known" cost, not claiming to cover every attempt. `null` when NO attempt in the group
     * has any cost figure at all (never a fabricated 0). */
    totalKnownCost: number | null;
    /** Mean of `effectiveCost` over attempts that report one — denominator is `pricedAttemptCount`,
     * NOT `attempts` (an unpriced attempt is excluded entirely, never averaged in as a 0). */
    averageKnownCostPerPricedAttempt: number | null;
    /** How many attempts in this group reported an `effectiveCost` at all — the denominator behind
     * both cost averages above, and the numerator of `costCoverageRate`. */
    pricedAttemptCount: number;
    /** `pricedAttemptCount / attempts` — what fraction of attempts have ANY cost figure. `null`
     * only for an empty group. */
    costCoverageRate: number | null;
    /** `true` when `pricedAttemptCount < attempts` — i.e. at least one attempt in this group is
     * missing cost data. */
    costDataPartial: boolean;
    /** `totalKnownCost / successCount` — see {@link costPerSuccessfulTask}. `null` with zero
     * successes (nothing to divide by) or when `totalKnownCost` itself is `null` (no cost data
     * captured at all) — never a guessed number for either case. */
    costPerSuccessfulTask: number | null;
}

const scenarioGroupKey = (provider: string, model: string, scenarioId: string): string =>
    `${provider}::${model}::${scenarioId}`;

/** Groups {@link MultiTurnLiveRecord}s by (provider, requestedModel, scenarioId) and computes the
 * scenario-level summary — task G's second table. Mirrors `aggregateMultiTurnByModel`'s latency/
 * cost semantics exactly (same helpers: `median`, `p90NearestRank`, `definedValues`,
 * `costPerSuccessfulTask`) — never fabricates a total/average field: each stays `null` unless at
 * least one record in the group actually reported the underlying value. Model-level aggregation
 * (`aggregateMultiTurnByModel`) is untouched by this function. */
export const aggregateMultiTurnByScenario = (records: readonly MultiTurnLiveRecord[]): MultiTurnScenarioSummary[] => {
    const groups = new Map<string, MultiTurnLiveRecord[]>();
    for (const record of records) {
        const key = scenarioGroupKey(record.provider, record.requestedModel, record.scenarioId);
        const arr = groups.get(key);
        if (arr) arr.push(record);
        else groups.set(key, [record]);
    }

    const summaries: MultiTurnScenarioSummary[] = [];
    for (const group of groups.values()) {
        const { provider, requestedModel, scenarioId } = group[0];
        const attempts = group.length;
        const successes = group.filter(r => r.outcome === 'success').length;
        const elapsedValues = group.map(r => r.elapsedMs);

        const costValues = definedValues(group, r => r.effectiveCost);
        const pricedAttemptCount = costValues.length;
        const totalKnownCost = pricedAttemptCount > 0 ? costValues.reduce((sum, v) => sum + v, 0) : null;

        summaries.push({
            provider,
            requestedModel,
            scenarioId,
            attempts,
            successRate: successRate(successes, attempts),
            directSuccessCount: group.filter(r => r.outcome === 'success' && r.strategy === 'direct').length,
            lookupFirstSuccessCount: group.filter(r => r.outcome === 'success' && r.strategy === 'lookup-first').length,
            failureCount: group.filter(r => r.outcome === 'failure').length,
            providerErrorCount: group.filter(r => r.outcome === 'provider-error').length,
            timeoutCount: group.filter(r => r.outcome === 'timeout').length,
            maxTurnsCount: group.filter(r => r.outcome === 'max-turns').length,
            medianElapsedMs: median(elapsedValues),
            p90ElapsedMs: p90NearestRank(elapsedValues),
            averageTurns: mean(group.map(r => r.turnCount)),
            totalKnownCost,
            averageKnownCostPerPricedAttempt: mean(costValues),
            pricedAttemptCount,
            costCoverageRate: successRate(pricedAttemptCount, attempts),
            costDataPartial: pricedAttemptCount < attempts,
            costPerSuccessfulTask: costPerSuccessfulTask(totalKnownCost, successes),
        });
    }

    return summaries.sort(
        (a, b) =>
            a.provider.localeCompare(b.provider) ||
            a.requestedModel.localeCompare(b.requestedModel) ||
            a.scenarioId.localeCompare(b.scenarioId)
    );
};

// =============================================================================================
// Report + formatting
// =============================================================================================

export interface MultiTurnVerificationReport {
    generatedAt: string;
    costCurrency: typeof COST_CURRENCY;
    modelSummaries: MultiTurnModelSummary[];
    scenarioSummaries: MultiTurnScenarioSummary[];
    records: MultiTurnLiveRecord[];
}

export const buildMultiTurnVerificationReport = (
    records: readonly MultiTurnLiveRecord[],
    generatedAt: string
): MultiTurnVerificationReport => ({
    generatedAt,
    costCurrency: COST_CURRENCY,
    modelSummaries: aggregateMultiTurnByModel(records),
    scenarioSummaries: aggregateMultiTurnByScenario(records),
    records: [...records],
});

const formatUsd = (value: number): string => `$${value.toFixed(4)}`;
const costCell = (value: number | null): string => (value === null ? 'n/a' : formatUsd(value));
const numCell = (value: number | null): string => (value === null ? 'n/a' : String(Math.round(value * 100) / 100));
const rateCell = (value: number | null): string => (value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`);

/**
 * Model-level Markdown table — task G's first table. A `*` marks ONLY the specific cell whose
 * underlying data is partial for that row — `basicTokenDataPartial`, `providerTokenDataPartial`,
 * and `costDataPartial` are tracked and applied completely independently (see each field's own doc
 * on `MultiTurnModelSummary`), so a row missing only `providerTotalTokens` gets a `*` on "Avg
 * provider tokens" alone, never on "Avg tokens" or any cost column. Success-rate columns are
 * always out of `taskAttempts` (never out of `successes`), so the three strategy rates are
 * directly comparable to the overall rate and to each other.
 */
export const formatMultiTurnModelSummaryMarkdownTable = (summaries: readonly MultiTurnModelSummary[]): string => {
    if (summaries.length === 0) {
        return '_No live multi-turn task attempts recorded in this session._';
    }

    const header =
        '| Provider | Model | Attempts | Success | Direct | Lookup-first | Text-only | Fail | ' +
        'Provider-error | Timeout | Max-turns | Success rate | Direct rate | Lookup-first rate | ' +
        'Avg turns | Median turns | Total elapsed | Avg elapsed | Median elapsed | P90 elapsed | ' +
        'Avg tokens | Avg provider tokens | Priced attempts | Cost coverage | Total known cost | ' +
        'Avg known cost/priced attempt | Cost/success |';
    const separator =
        '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ' +
        '---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |';

    const rows = summaries.map(s => {
        const basicStar = s.basicTokenDataPartial ? '*' : '';
        const providerStar = s.providerTokenDataPartial ? '†' : '';
        const costStar = s.costDataPartial ? '‡' : '';
        return (
            `| ${s.provider} | ${s.requestedModel} | ${s.taskAttempts} | ${s.successes} | ${s.directSuccesses} | ` +
            `${s.lookupFirstSuccesses} | ${s.textOnlySuccesses} | ${s.failures} | ${s.providerErrors} | ` +
            `${s.timeouts} | ${s.maxTurnsCount} | ${rateCell(s.finalSuccessRate)} | ${rateCell(s.directSuccessRate)} | ` +
            `${rateCell(s.lookupFirstSuccessRate)} | ${numCell(s.averageTurns)} | ${numCell(s.medianTurns)} | ` +
            `${s.totalElapsedMs}ms | ${numCell(s.averageElapsedMs)}ms | ${numCell(s.medianElapsedMs)}ms | ` +
            `${numCell(s.p90ElapsedMs)}ms | ${numCell(s.averageBasicTotalTokens)}${basicStar} | ` +
            `${numCell(s.averageProviderTotalTokens)}${providerStar} | ${s.pricedAttemptCount}/${s.taskAttempts} | ` +
            `${rateCell(s.costCoverageRate)} | ${costCell(s.totalKnownCost)}${costStar} | ` +
            `${costCell(s.averageKnownCostPerPricedAttempt)}${costStar} | ${costCell(s.costPerSuccessfulTask)}${costStar} |`
        );
    });

    const p90Footnote =
        '\n\n`P90 elapsed` uses the nearest-rank method: attempts sorted ascending, the value at rank ' +
        '`ceil(0.9 * n)` (1-indexed) — always an actually-observed elapsed time, never interpolated.';

    const basicFootnote = summaries.some(s => s.basicTokenDataPartial)
        ? '\n\n`*` = normalized-token data partial — at least one attempt in that row has no `totalTokens` ' +
          '(usage never captured for that call). "Avg tokens" is the mean over only the attempts that ' +
          'reported it, not `0` for the rest.'
        : '';

    const providerFootnote = summaries.some(s => s.providerTokenDataPartial)
        ? "\n\n`†` = provider-total token data partial — at least one attempt in that row's provider " +
          'didn\'t report `providerTotalTokens` (or the call never completed). "Avg provider tokens" is ' +
          'the mean over only the attempts that reported it — never mixed with, or filled in from, the ' +
          'normalized "Avg tokens" column above.'
        : '';

    const costFootnote = summaries.some(s => s.costDataPartial)
        ? '\n\n`‡` = cost data partial — at least one attempt in that row has no `effectiveCost` ' +
          '(unregistered pricing — see pricing.ts — or usage never captured). "Total known cost", "Avg ' +
          'known cost/priced attempt", and "Cost/success" are all computed from the `Priced attempts` ' +
          "column's subset only — see that column and `Cost coverage` for exactly what fraction of " +
          'attempts they cover.'
        : '';

    return [header, separator, ...rows].join('\n') + p90Footnote + basicFootnote + providerFootnote + costFootnote;
};

/**
 * A SEPARATE table from {@link formatMultiTurnModelSummaryMarkdownTable} — that table's own
 * Direct/Lookup-first/Text-only columns describe `strategy` (how a run STARTED); this one
 * describes `completionMode` (how a SUCCESSFUL run ENDED). Deliberately kept apart rather than
 * bolted onto the existing table as more columns, since the two classifications answer different
 * questions and conflating them in one wide table would blur that distinction.
 */
export const formatMultiTurnCompletionModeMarkdownTable = (summaries: readonly MultiTurnModelSummary[]): string => {
    if (summaries.length === 0) {
        return '_No live multi-turn task attempts recorded in this session._';
    }

    const header =
        '| Provider | Model | Attempts | Tool-action successes | Text-response successes | Incomplete attempts | Successful lookup-action round trips |';
    const separator = '| --- | --- | ---: | ---: | ---: | ---: | ---: |';
    const rows = summaries.map(
        s =>
            `| ${s.provider} | ${s.requestedModel} | ${s.taskAttempts} | ${s.toolActionSuccesses} | ` +
            `${s.textResponseSuccesses} | ${s.incompleteAttempts} | ${s.successfulLookupActionRoundTrips} |`
    );

    const roundTripFootnote =
        '\n\n`Successful lookup-action round trips` counts only a `success` outcome whose `strategy` is ' +
        '`lookup-first`, whose `completionMode` is `tool-action`, AND whose `requestedToolSequence` has a ' +
        "real acting tool call AFTER the initial `list_nodes` — see `isSuccessfulLookupActionRoundTrip`'s " +
        'own doc for the exact four-part definition. Strictly narrower than "Lookup-first successes" in ' +
        'the model-summary table above: a lookup-first success that ended via text, or one whose only ' +
        'tool call ever made was `list_nodes` itself, is excluded from this count.';

    return [header, separator, ...rows].join('\n') + roundTripFootnote;
};

/** Scenario-level Markdown table — task G's second table. */
export const formatMultiTurnScenarioMarkdownTable = (summaries: readonly MultiTurnScenarioSummary[]): string => {
    if (summaries.length === 0) {
        return '_No live multi-turn scenario attempts recorded in this session._';
    }

    const header =
        '| Provider | Model | Scenario | Attempts | Success rate | Direct | Lookup-first | Fail | ' +
        'Provider-error | Timeout | Max-turns | Median elapsed | P90 elapsed | Avg turns | ' +
        'Priced attempts | Cost coverage | Total known cost | Avg known cost/priced attempt | Cost/success |';
    const separator =
        '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ' +
        '---: | ---: | ---: | ---: | ---: |';
    const rows = summaries.map(s => {
        const costStar = s.costDataPartial ? '‡' : '';
        return (
            `| ${s.provider} | ${s.requestedModel} | ${s.scenarioId} | ${s.attempts} | ${rateCell(s.successRate)} | ` +
            `${s.directSuccessCount} | ${s.lookupFirstSuccessCount} | ${s.failureCount} | ${s.providerErrorCount} | ` +
            `${s.timeoutCount} | ${s.maxTurnsCount} | ${numCell(s.medianElapsedMs)}ms | ${numCell(s.p90ElapsedMs)}ms | ` +
            `${numCell(s.averageTurns)} | ${s.pricedAttemptCount}/${s.attempts} | ${rateCell(s.costCoverageRate)} | ` +
            `${costCell(s.totalKnownCost)}${costStar} | ${costCell(s.averageKnownCostPerPricedAttempt)}${costStar} | ` +
            `${costCell(s.costPerSuccessfulTask)}${costStar} |`
        );
    });

    const p90Footnote =
        '\n\n`P90 elapsed` uses the nearest-rank method: attempts sorted ascending, the value at rank ' +
        '`ceil(0.9 * n)` (1-indexed) — always an actually-observed elapsed time, never interpolated.';

    const costFootnote = summaries.some(s => s.costDataPartial)
        ? '\n\n`‡` = cost data partial — at least one attempt for that scenario/model has no ' +
          '`effectiveCost` (unregistered pricing — see pricing.ts — or usage never captured). ' +
          '"Total known cost", "Avg known cost/priced attempt", and "Cost/success" are all computed ' +
          "from the `Priced attempts` column's subset only — see that column and `Cost coverage` " +
          'for exactly what fraction of attempts they cover.'
        : '';

    return [header, separator, ...rows].join('\n') + p90Footnote + costFootnote;
};

/** Mirrors `verificationMetrics.ts`'s private `csvEscape` (same shape, can't be imported). */
const csvEscape = (value: string): string => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
const numberOrEmpty = (value: number | null | undefined): string =>
    value === null || value === undefined ? '' : String(value);

/**
 * One row per task attempt — the exact-value companion to {@link formatMultiTurnModelSummaryMarkdownTable}.
 * `requestedToolSequence` and `turns` are serialized as JSON strings within their CSV cell (they're
 * structured, variable-length data — a CSV column can't represent an array natively). Missing
 * (never-fabricated-zero) usage/cost fields are emitted as empty cells, not `0`.
 */
export const formatMultiTurnRecordsCsv = (records: readonly MultiTurnLiveRecord[]): string => {
    const header = [
        'provider',
        'providerId',
        'requestedModel',
        'actualModel',
        'scenarioId',
        'attempt',
        'repetitions',
        'maxTurns',
        'outcome',
        'strategy',
        'completionMode',
        'turnCount',
        'requestedToolSequence',
        'turns',
        'positionsBefore',
        'positionsAfter',
        'finalStateCorrect',
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
        'totalTokens',
        'providerReportedCost',
        'estimatedCost',
        'effectiveCost',
        'costSource',
        'pricingVersion',
        'error',
    ];
    const lines = [header.join(',')];
    for (const r of records) {
        lines.push(
            [
                r.provider,
                r.providerId,
                r.requestedModel,
                r.actualModel ?? '',
                r.scenarioId,
                String(r.attempt),
                String(r.repetitions),
                String(r.maxTurns),
                r.outcome,
                r.strategy,
                r.completionMode,
                String(r.turnCount),
                JSON.stringify(r.requestedToolSequence),
                JSON.stringify(r.turns),
                r.positionsBefore !== undefined ? JSON.stringify(r.positionsBefore) : '',
                r.positionsAfter !== undefined ? JSON.stringify(r.positionsAfter) : '',
                String(r.finalStateCorrect),
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
                numberOrEmpty(r.totalTokens),
                numberOrEmpty(r.providerReportedCost),
                numberOrEmpty(r.estimatedCost),
                numberOrEmpty(r.effectiveCost),
                r.costSource ?? '',
                r.pricingVersion ?? '',
                r.error ?? '',
            ]
                .map(csvEscape)
                .join(',')
        );
    }
    return lines.join('\n');
};

/** One JSON object per line, one line per task attempt — the native-shape companion to
 * {@link formatMultiTurnRecordsCsv}, suitable for streaming/append-only writes. */
export const formatMultiTurnRecordsJsonl = (records: readonly MultiTurnLiveRecord[]): string =>
    records.map(r => JSON.stringify(r)).join('\n');

/**
 * One row per task attempt, in Markdown — the human-readable companion to
 * {@link formatMultiTurnRecordsCsv} (which is the exact-value/machine-readable one). Written into
 * `latest.md` alongside the aggregate model/scenario/completion-mode tables so `completionMode`
 * (and the rest of an individual attempt's shape) is visible without opening `latest.csv`/`.json`.
 */
export const formatMultiTurnRecordsMarkdownDetails = (records: readonly MultiTurnLiveRecord[]): string => {
    if (records.length === 0) {
        return '_No live multi-turn task attempts recorded in this session._';
    }

    const header =
        '| Provider | Requested model | Actual model | Scenario | Outcome | Strategy | Completion mode | ' +
        'Turns | Tool sequence | Final state correct | Elapsed | Effective cost | Error |';
    const separator = '| --- | --- | --- | --- | --- | --- | --- | ---: | --- | ---: | ---: | ---: | --- |';
    const rows = records.map(
        r =>
            `| ${r.provider} | ${r.requestedModel} | ${r.actualModel ?? 'n/a'} | ${r.scenarioId} | ${r.outcome} | ` +
            `${r.strategy} | ${r.completionMode} | ${r.turnCount} | ` +
            `${r.requestedToolSequence.length > 0 ? r.requestedToolSequence.join(' → ') : '(none)'} | ` +
            `${r.finalStateCorrect} | ${r.elapsedMs}ms | ${r.effectiveCost !== undefined ? formatUsd(r.effectiveCost) : 'n/a'} | ` +
            `${r.error ?? ''} |`
    );
    return [header, separator, ...rows].join('\n');
};

/** One cell: `'explicit'` shows its value (never absent — see {@link GenerationParameterValue}'s
 * own doc), `'provider-default'`/`'unsupported'` show only the status word, never a guessed
 * number. */
const generationParameterCell = (p: GenerationParameterValue<number | string>): string =>
    p.status === 'explicit' ? `explicit (${String(p.value)})` : p.status;

/**
 * A concise, one-row-per-provider configuration section for `latest.md` — see
 * `providerRegistry.ts`'s `deriveGenerationConfiguration` for how each cell's status is decided.
 * Never fabricates a numeric provider default: a `'provider-default'`/`'unsupported'` cell shows
 * only that word, never a guessed value.
 */
export const formatGenerationConfigurationMarkdown = (
    config: Readonly<Record<string, GenerationConfiguration>>
): string => {
    const providerIds = Object.keys(config);
    if (providerIds.length === 0) {
        return '_No generation configuration recorded._';
    }

    const header = '| Provider | Temperature | Top-p | Top-k | Max output tokens | Reasoning effort |';
    const separator = '| --- | --- | --- | --- | --- | --- |';
    const rows = providerIds.map(providerId => {
        const c = config[providerId];
        return (
            `| ${providerId} | ${generationParameterCell(c.temperature)} | ${generationParameterCell(c.topP)} | ` +
            `${generationParameterCell(c.topK)} | ${generationParameterCell(c.maxOutputTokens)} | ` +
            `${generationParameterCell(c.reasoningEffort)} |`
        );
    });
    return [header, separator, ...rows].join('\n');
};

// =============================================================================================
// Run manifest — task I. Type only; the live spec constructs and writes the actual value (it
// alone knows env filters, planned pairs, and git state — this module stays filesystem/env-free).
// =============================================================================================

export interface MultiTurnRunManifest {
    generatedAt: string;
    liveMultiTurnTestsOptedIn: boolean;
    providerFilter: string | null;
    /** The raw `LIVE_MULTI_TURN_MODEL_FILTER` env value, unparsed — kept for back-compat/debugging.
     * See `requestedModels` for the parsed, deduplicated, order-preserving list actually used to
     * select models. */
    modelFilter: string | null;
    /** Parsed `LIVE_MULTI_TURN_MODEL_FILTER` — one or more models, in the order given (never
     * reordered to match registry order; only `plannedPairs`/execution order is registry-ordered).
     * Empty array means no filter was set (every registered model for the selected provider(s) was
     * eligible), never used to mean "matched nothing". See `multiTurnRunSelection.ts`. */
    requestedModels: string[];
    selectedScenarios: string[];
    repetitions: number;
    maxTurns: number;
    /** The outer per-task timeout this run was configured with, in milliseconds — see
     * `realMultiTurnLocatorScenarios.spec.ts`'s timeout doc for exactly what it does and doesn't cover. */
    taskTimeoutMs: number;
    plannedPairs: readonly { provider: string; providerId: string; model: string; keyPresent: boolean }[];
    expectedTaskCount: number;
    sourceSessionId: string;
    pricingVersion: string;
    /** `null` when the git SHA/dirty state couldn't be safely determined (no `.git`, `git` not on
     * PATH, or the lookup itself failed) — never fabricated. No API-key values are ever recorded
     * here or anywhere else in this manifest. */
    gitSha: string | null;
    gitDirty: boolean | null;
    /**
     * Effective generation/sampling settings this run's request path actually sends — see
     * `providerRegistry.ts`'s `deriveGenerationConfiguration` for exactly how each field's
     * `'explicit' | 'provider-default' | 'unsupported'` status is decided. Keyed by `providerId`
     * (e.g. `'openai'`, `'anthropic'`) rather than by model: every model behind the same
     * `gatewayType` shares the same request-shape capabilities, so one entry per PROVIDER actually
     * planned in this run is enough — never one entry per model, which would just repeat the same
     * values `plannedPairs.length` times for a single-provider, multi-model run like the OpenAI
     * baseline. Empty object only if `plannedPairs` itself is empty (nothing was planned at all).
     */
    generationConfiguration: Record<string, GenerationConfiguration>;
}
