import { describe, expect, it } from 'vitest';

import {
    aggregateMultiTurnByModel,
    aggregateMultiTurnByScenario,
    buildMultiTurnVerificationReport,
    costPerSuccessfulTask,
    formatGenerationConfigurationMarkdown,
    formatMultiTurnCompletionModeMarkdownTable,
    formatMultiTurnModelSummaryMarkdownTable,
    formatMultiTurnRecordsCsv,
    formatMultiTurnRecordsJsonl,
    formatMultiTurnRecordsMarkdownDetails,
    formatMultiTurnScenarioMarkdownTable,
    isSuccessfulLookupActionRoundTrip,
    mean,
    median,
    p90NearestRank,
    resolveEffectiveCost,
    successRate,
} from '../../llm/multiTurnVerificationMetrics';
import { accumulateExtendedUsage, aggregateVerificationMetrics } from '../../llm/verificationMetrics';

import type { MultiTurnLiveRecord, MultiTurnRunManifest } from '../../llm/multiTurnVerificationMetrics';
import type { CapturedCallInfo, VerificationRunRecord } from '../../llm/verificationMetrics';
import type { MultiTurnTurnTrace } from '../../llm/verifyLocatorScenarios';

const turn = (overrides: Partial<MultiTurnTurnTrace> = {}): MultiTurnTurnTrace => ({
    turn: 1,
    toolCallName: 'move_node',
    textPresent: false,
    argsValid: true,
    dispatchOk: true,
    ...overrides,
});

/** A fully-populated synthetic record; each test overrides only what it's testing. */
const makeRecord = (overrides: Partial<MultiTurnLiveRecord> = {}): MultiTurnLiveRecord => ({
    provider: 'OpenAI',
    providerId: 'openai',
    requestedModel: 'gpt-5-mini',
    scenarioId: 'move-node-right',
    attempt: 1,
    repetitions: 5,
    maxTurns: 3,
    outcome: 'success',
    strategy: 'direct',
    completionMode: 'tool-action',
    turnCount: 1,
    requestedToolSequence: ['move_node'],
    turns: [turn()],
    finalStateCorrect: true,
    startedAt: 1000,
    endedAt: 1200,
    elapsedMs: 200,
    inputTokens: 100,
    outputTokens: 50,
    totalTokens: 150,
    ...overrides,
});

describe('statistics helpers', () => {
    it('mean/median/p90NearestRank return null for empty input, never a fabricated 0', () => {
        expect(mean([])).toBeNull();
        expect(median([])).toBeNull();
        expect(p90NearestRank([])).toBeNull();
    });

    it('median: odd count is the middle value, even count is the average of the two middle values', () => {
        expect(median([3, 1, 2])).toBe(2);
        expect(median([1, 2, 3, 4])).toBe(2.5);
    });

    it('p90NearestRank: rank = ceil(0.9 * n) on the sorted array (documented nearest-rank method)', () => {
        // n=10, rank = ceil(9) = 9 (1-indexed) -> sorted[8] -> value 9.
        expect(p90NearestRank([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(9);
        // n=5, rank = ceil(4.5) = 5 -> sorted[4] -> the max value itself.
        expect(p90NearestRank([50, 10, 30, 20, 40])).toBe(50);
    });

    it('successRate: null when totalCount is 0, never a fabricated 0%', () => {
        expect(successRate(0, 0)).toBeNull();
        expect(successRate(3, 5)).toBe(0.6);
    });

    it('costPerSuccessfulTask: null when there are zero successes, even with real cost data', () => {
        expect(costPerSuccessfulTask(12.5, 0)).toBeNull();
        expect(costPerSuccessfulTask(null, 0)).toBeNull();
        expect(costPerSuccessfulTask(10, 2)).toBe(5);
    });
});

describe("resolveEffectiveCost: the multi-turn mirror of verificationMetrics.ts's private effectiveCost", () => {
    it('prefers providerReportedCost when present', () => {
        expect(resolveEffectiveCost({ providerReportedCost: 0.01, estimatedCost: 0.5 })).toBe(0.01);
    });

    it('falls back to a genuine numeric estimatedCost when providerReportedCost is absent', () => {
        expect(resolveEffectiveCost({ estimatedCost: 0.002 })).toBe(0.002);
    });

    it('returns undefined when neither is usable — including an explicit null estimatedCost (unknown pricing)', () => {
        expect(resolveEffectiveCost({})).toBeUndefined();
        expect(resolveEffectiveCost({ estimatedCost: null })).toBeUndefined();
    });
});

describe('aggregateMultiTurnByModel: mixed strategies and outcomes', () => {
    it('five attempts with mixed direct/lookup-first successes, a lookup-first provider-error, and a max-turns all classify correctly', () => {
        const records: MultiTurnLiveRecord[] = [
            makeRecord({ attempt: 1, outcome: 'success', strategy: 'direct', turnCount: 1 }),
            makeRecord({ attempt: 2, outcome: 'success', strategy: 'lookup-first', turnCount: 2 }),
            makeRecord({
                attempt: 3,
                outcome: 'provider-error',
                strategy: 'lookup-first',
                turnCount: 1,
                error: 'upstream 500',
            }),
            makeRecord({ attempt: 4, outcome: 'max-turns', strategy: 'lookup-first', turnCount: 3 }),
            makeRecord({ attempt: 5, outcome: 'failure', strategy: 'other', turnCount: 1 }),
        ];

        const [summary] = aggregateMultiTurnByModel(records);
        expect(summary.taskAttempts).toBe(5);
        expect(summary.successes).toBe(2);
        expect(summary.directSuccesses).toBe(1);
        // Only the ONE lookup-first attempt that actually succeeded counts here — the
        // provider-error and max-turns lookup-first attempts do not, even though they share the
        // same strategy label.
        expect(summary.lookupFirstSuccesses).toBe(1);
        expect(summary.providerErrors).toBe(1);
        expect(summary.maxTurnsCount).toBe(1);
        expect(summary.failures).toBe(1);
        expect(summary.finalSuccessRate).toBe(0.4);
    });

    it('a lookup-first provider-error is never counted as a success', () => {
        const records: MultiTurnLiveRecord[] = [
            makeRecord({ outcome: 'provider-error', strategy: 'lookup-first', error: 'timeout upstream' }),
        ];
        const [summary] = aggregateMultiTurnByModel(records);
        expect(summary.successes).toBe(0);
        expect(summary.lookupFirstSuccesses).toBe(0);
        expect(summary.providerErrors).toBe(1);
        expect(summary.finalSuccessRate).toBe(0);
    });

    it('a lookup-first max-turns is never counted as a success', () => {
        const records: MultiTurnLiveRecord[] = [makeRecord({ outcome: 'max-turns', strategy: 'lookup-first' })];
        const [summary] = aggregateMultiTurnByModel(records);
        expect(summary.successes).toBe(0);
        expect(summary.lookupFirstSuccesses).toBe(0);
        expect(summary.maxTurnsCount).toBe(1);
        expect(summary.finalSuccessRate).toBe(0);
    });
});

describe('isSuccessfulLookupActionRoundTrip: the exact four-part definition', () => {
    it('counts a genuine list_nodes -> tool result -> later action-tool success', () => {
        const record = makeRecord({
            outcome: 'success',
            strategy: 'lookup-first',
            completionMode: 'tool-action',
            requestedToolSequence: ['list_nodes', 'move_node'],
        });
        expect(isSuccessfulLookupActionRoundTrip(record)).toBe(true);
    });

    it('excludes a lookup-first success that completed via TEXT, not a later tool call', () => {
        // e.g. ambiguous-instruction resolved by list_nodes then an accepted clarifying question.
        const record = makeRecord({
            outcome: 'success',
            strategy: 'lookup-first',
            completionMode: 'text-response',
            requestedToolSequence: ['list_nodes'],
        });
        expect(isSuccessfulLookupActionRoundTrip(record)).toBe(false);
    });

    it('excludes a bare list_nodes-only success with no LATER acting tool call (list-nodes-read-only edge case)', () => {
        // completionMode is 'tool-action' here (list_nodes itself was the terminal, satisfying
        // call) — condition 4 (a later non-list_nodes tool) is what correctly excludes this, not
        // completionMode or strategy alone.
        const record = makeRecord({
            outcome: 'success',
            strategy: 'lookup-first',
            completionMode: 'tool-action',
            requestedToolSequence: ['list_nodes'],
        });
        expect(isSuccessfulLookupActionRoundTrip(record)).toBe(false);
    });

    it('excludes a repeated-list_nodes-only max-turns/success with no acting tool anywhere', () => {
        const record = makeRecord({
            outcome: 'success',
            strategy: 'lookup-first',
            completionMode: 'tool-action',
            requestedToolSequence: ['list_nodes', 'list_nodes'],
        });
        expect(isSuccessfulLookupActionRoundTrip(record)).toBe(false);
    });

    it('excludes a non-success outcome even with an otherwise-matching tool sequence', () => {
        const record = makeRecord({
            outcome: 'max-turns',
            strategy: 'lookup-first',
            completionMode: 'none',
            requestedToolSequence: ['list_nodes', 'move_node'],
        });
        expect(isSuccessfulLookupActionRoundTrip(record)).toBe(false);
    });

    it('excludes a direct (non-lookup-first) success even with completionMode=tool-action', () => {
        const record = makeRecord({
            outcome: 'success',
            strategy: 'direct',
            completionMode: 'tool-action',
            requestedToolSequence: ['move_node'],
        });
        expect(isSuccessfulLookupActionRoundTrip(record)).toBe(false);
    });

    it('aggregateMultiTurnByModel.successfulLookupActionRoundTrips matches the sum of the predicate over the group', () => {
        const records: MultiTurnLiveRecord[] = [
            makeRecord({
                attempt: 1,
                outcome: 'success',
                strategy: 'lookup-first',
                completionMode: 'tool-action',
                requestedToolSequence: ['list_nodes', 'move_node'],
            }),
            makeRecord({
                attempt: 2,
                outcome: 'success',
                strategy: 'lookup-first',
                completionMode: 'text-response',
                requestedToolSequence: ['list_nodes'],
            }),
            makeRecord({
                attempt: 3,
                outcome: 'success',
                strategy: 'lookup-first',
                completionMode: 'tool-action',
                requestedToolSequence: ['list_nodes'],
            }),
            makeRecord({
                attempt: 4,
                outcome: 'success',
                strategy: 'direct',
                completionMode: 'tool-action',
                requestedToolSequence: ['move_node'],
            }),
        ];
        const [summary] = aggregateMultiTurnByModel(records);
        expect(summary.successfulLookupActionRoundTrips).toBe(1);
        expect(summary.taskAttempts).toBe(4);
    });
});

describe('aggregateMultiTurnByModel: timing and turns', () => {
    it('median elapsed with an odd attempt count', () => {
        const records = [100, 300, 200].map((elapsedMs, i) => makeRecord({ attempt: i + 1, elapsedMs }));
        const [summary] = aggregateMultiTurnByModel(records);
        expect(summary.medianElapsedMs).toBe(200);
    });

    it('median elapsed with an even attempt count', () => {
        const records = [100, 300, 200, 400].map((elapsedMs, i) => makeRecord({ attempt: i + 1, elapsedMs }));
        const [summary] = aggregateMultiTurnByModel(records);
        expect(summary.medianElapsedMs).toBe(250);
    });

    it('average turns is the mean of turnCount across attempts', () => {
        const records = [1, 2, 3].map((turnCount, i) => makeRecord({ attempt: i + 1, turnCount }));
        const [summary] = aggregateMultiTurnByModel(records);
        expect(summary.averageTurns).toBe(2);
    });
});

describe('aggregateMultiTurnByModel: cost', () => {
    it('cost per successful task divides total KNOWN effective cost by success count only', () => {
        const records = [
            makeRecord({ attempt: 1, outcome: 'success', effectiveCost: 0.01 }),
            makeRecord({ attempt: 2, outcome: 'success', effectiveCost: 0.03 }),
            makeRecord({ attempt: 3, outcome: 'failure', effectiveCost: 0.02 }),
        ];
        const [summary] = aggregateMultiTurnByModel(records);
        expect(summary.totalKnownCost).toBeCloseTo(0.06);
        expect(summary.costPerSuccessfulTask).toBeCloseTo(0.03);
        expect(summary.pricedAttemptCount).toBe(3);
        expect(summary.costCoverageRate).toBe(1);
        expect(summary.costDataPartial).toBe(false);
    });

    it('zero successes produces a null cost-per-success even when cost data exists', () => {
        const records = [makeRecord({ outcome: 'failure', effectiveCost: 0.05 })];
        const [summary] = aggregateMultiTurnByModel(records);
        expect(summary.successes).toBe(0);
        expect(summary.costPerSuccessfulTask).toBeNull();
    });

    it('pricedAttemptCount and costCoverageRate reflect a partial subset correctly', () => {
        const records = [
            makeRecord({ attempt: 1, effectiveCost: 0.02 }),
            makeRecord({ attempt: 2, effectiveCost: 0.04 }),
            makeRecord({ attempt: 3 }), // no effectiveCost at all
            makeRecord({ attempt: 4 }),
        ];
        const [summary] = aggregateMultiTurnByModel(records);
        expect(summary.pricedAttemptCount).toBe(2);
        expect(summary.costCoverageRate).toBe(0.5);
        expect(summary.totalKnownCost).toBeCloseTo(0.06);
        expect(summary.averageKnownCostPerPricedAttempt).toBeCloseTo(0.03); // over 2 priced attempts, not 4
        expect(summary.costDataPartial).toBe(true);
    });

    it('costPerSuccessfulTask stays null with zero successes regardless of cost completeness', () => {
        const records = [makeRecord({ outcome: 'failure' }), makeRecord({ outcome: 'timeout', effectiveCost: 0.01 })];
        const [summary] = aggregateMultiTurnByModel(records);
        expect(summary.successes).toBe(0);
        expect(summary.costPerSuccessfulTask).toBeNull();
        expect(summary.costDataPartial).toBe(true); // one of the two attempts has no cost
    });
});

describe('aggregateMultiTurnByModel: token accounting', () => {
    it('providerTotalTokens and the basic normalized totalTokens are aggregated separately, never mixed', () => {
        const records = [
            makeRecord({ attempt: 1, totalTokens: 150, providerTotalTokens: 200 }),
            makeRecord({ attempt: 2, totalTokens: 250, providerTotalTokens: 300 }),
        ];
        const [summary] = aggregateMultiTurnByModel(records);
        expect(summary.averageBasicTotalTokens).toBe(200);
        expect(summary.averageProviderTotalTokens).toBe(250);
        expect(summary.averageBasicTotalTokens).not.toBe(summary.averageProviderTotalTokens);
        expect(summary.basicTokenDataPartial).toBe(false);
        expect(summary.providerTokenDataPartial).toBe(false);
    });

    it('missing basic totalTokens stays partial and never silently becomes 0, and is over only the reporting attempt', () => {
        const records = [
            makeRecord({ attempt: 1, totalTokens: 150 }),
            makeRecord({ attempt: 2, inputTokens: null, outputTokens: null, totalTokens: null }),
        ];
        const [summary] = aggregateMultiTurnByModel(records);
        // The mean is over the one attempt that reported it (150), not (150 + 0) / 2.
        expect(summary.averageBasicTotalTokens).toBe(150);
        expect(summary.basicTokenAttemptCount).toBe(1);
        expect(summary.basicTokenDataPartial).toBe(true);
    });

    it('missing cost data across every attempt in the group stays null, not a fabricated 0', () => {
        const records = [makeRecord({ attempt: 1 }), makeRecord({ attempt: 2 })];
        const [summary] = aggregateMultiTurnByModel(records);
        expect(summary.totalKnownCost).toBeNull();
        expect(summary.averageKnownCostPerPricedAttempt).toBeNull();
        expect(summary.pricedAttemptCount).toBe(0);
        expect(summary.costCoverageRate).toBe(0);
        expect(summary.costDataPartial).toBe(true);
    });
});

describe('aggregateMultiTurnByModel: the three partial-data flags are independent', () => {
    it('providerTotalTokens missing while normalized tokens and cost are complete affects ONLY providerTokenDataPartial', () => {
        const records = [
            makeRecord({ attempt: 1, totalTokens: 150, effectiveCost: 0.01, providerTotalTokens: 200 }),
            makeRecord({ attempt: 2, totalTokens: 150, effectiveCost: 0.01 }), // no providerTotalTokens
        ];
        const [summary] = aggregateMultiTurnByModel(records);
        expect(summary.basicTokenDataPartial).toBe(false);
        expect(summary.costDataPartial).toBe(false);
        expect(summary.providerTokenDataPartial).toBe(true);
        expect(summary.providerTokenAttemptCount).toBe(1);
        // The complete metrics are still computed over ALL attempts, unaffected by the gap elsewhere.
        expect(summary.averageBasicTotalTokens).toBe(150);
        expect(summary.pricedAttemptCount).toBe(2);
    });

    it('effectiveCost missing while both token metrics are complete affects ONLY costDataPartial', () => {
        const records = [
            makeRecord({ attempt: 1, totalTokens: 150, providerTotalTokens: 200, effectiveCost: 0.01 }),
            makeRecord({ attempt: 2, totalTokens: 150, providerTotalTokens: 200 }), // no effectiveCost
        ];
        const [summary] = aggregateMultiTurnByModel(records);
        expect(summary.basicTokenDataPartial).toBe(false);
        expect(summary.providerTokenDataPartial).toBe(false);
        expect(summary.costDataPartial).toBe(true);
        expect(summary.basicTokenAttemptCount).toBe(2);
        expect(summary.providerTokenAttemptCount).toBe(2);
    });

    it('normalized totalTokens missing while providerTotalTokens and cost are complete affects ONLY basicTokenDataPartial', () => {
        const records = [
            makeRecord({ attempt: 1, totalTokens: 150, providerTotalTokens: 200, effectiveCost: 0.01 }),
            makeRecord({
                attempt: 2,
                inputTokens: null,
                outputTokens: null,
                totalTokens: null,
                providerTotalTokens: 200,
                effectiveCost: 0.01,
            }),
        ];
        const [summary] = aggregateMultiTurnByModel(records);
        expect(summary.basicTokenDataPartial).toBe(true);
        expect(summary.providerTokenDataPartial).toBe(false);
        expect(summary.costDataPartial).toBe(false);
        expect(summary.providerTokenAttemptCount).toBe(2);
        expect(summary.pricedAttemptCount).toBe(2);
    });
});

describe('Markdown table: each partial-data marker is applied independently', () => {
    it('a row missing only providerTotalTokens gets `†` on the provider-tokens cell alone', () => {
        const [summary] = aggregateMultiTurnByModel([
            makeRecord({ attempt: 1, totalTokens: 150, effectiveCost: 0.01, providerTotalTokens: 200 }),
            makeRecord({ attempt: 2, totalTokens: 150, effectiveCost: 0.01 }),
        ]);
        const table = formatMultiTurnModelSummaryMarkdownTable([summary]);
        const dataRow = table.split('\n')[2];
        // "Avg tokens" cell has no star, "Avg provider tokens" cell carries the dagger.
        expect(dataRow).toMatch(/\| 150 \|/);
        expect(dataRow).toMatch(/\| 200†? \|/);
        expect(dataRow).toContain('200†');
        expect(dataRow).not.toContain('150†');
        expect(dataRow).not.toContain('150*');
        expect(table).toContain('provider-total token data partial');
        expect(table).not.toContain('normalized-token data partial');
        expect(table).not.toContain('cost data partial');
    });

    it('a row missing only effectiveCost gets `‡` on the cost cells alone', () => {
        const [summary] = aggregateMultiTurnByModel([
            makeRecord({ attempt: 1, totalTokens: 150, providerTotalTokens: 200, effectiveCost: 0.01 }),
            makeRecord({ attempt: 2, totalTokens: 150, providerTotalTokens: 200 }),
        ]);
        const table = formatMultiTurnModelSummaryMarkdownTable([summary]);
        const dataRow = table.split('\n')[2];
        expect(dataRow).not.toContain('150*');
        expect(dataRow).not.toContain('200†');
        expect(dataRow).toMatch(/‡/);
        expect(table).toContain('cost data partial');
        expect(table).not.toContain('normalized-token data partial');
        expect(table).not.toContain('provider-total token data partial');
    });

    it('a row missing only normalized totalTokens gets `*` on the basic-tokens cell alone', () => {
        const [summary] = aggregateMultiTurnByModel([
            makeRecord({ attempt: 1, totalTokens: 150, providerTotalTokens: 200, effectiveCost: 0.01 }),
            makeRecord({
                attempt: 2,
                inputTokens: null,
                outputTokens: null,
                totalTokens: null,
                providerTotalTokens: 200,
                effectiveCost: 0.01,
            }),
        ]);
        const table = formatMultiTurnModelSummaryMarkdownTable([summary]);
        const dataRow = table.split('\n')[2];
        expect(dataRow).toContain('150*');
        expect(dataRow).not.toContain('200†');
        expect(dataRow).not.toMatch(/‡/);
        expect(table).toContain('normalized-token data partial');
        expect(table).not.toContain('provider-total token data partial');
        expect(table).not.toContain('cost data partial');
    });

    it('a fully complete row (every attempt reports all three) carries no partial-data markers or footnotes at all', () => {
        const [summary] = aggregateMultiTurnByModel([
            makeRecord({ attempt: 1, totalTokens: 150, providerTotalTokens: 200, effectiveCost: 0.01 }),
            makeRecord({ attempt: 2, totalTokens: 150, providerTotalTokens: 200, effectiveCost: 0.01 }),
        ]);
        expect(summary.basicTokenDataPartial).toBe(false);
        expect(summary.providerTokenDataPartial).toBe(false);
        expect(summary.costDataPartial).toBe(false);
        const table = formatMultiTurnModelSummaryMarkdownTable([summary]);
        // Only the data row is checked for marker characters — the P90 footnote's own prose
        // ("ceil(0.9 * n)") legitimately contains a literal `*` for multiplication and is present
        // on every table regardless of partial data, so it must not be mistaken for a marker here.
        const dataRow = table.split('\n')[2];
        expect(dataRow).not.toContain('*');
        expect(dataRow).not.toContain('†');
        expect(dataRow).not.toContain('‡');
        expect(table).not.toContain('normalized-token data partial');
        expect(table).not.toContain('provider-total token data partial');
        expect(table).not.toContain('cost data partial');
    });
});

describe('formatMultiTurnModelSummaryMarkdownTable: rateCell renders "n/a" for a null rate', () => {
    it('shows n/a rather than a fabricated percentage when a rate field is null', () => {
        // successRate() never actually returns null for a non-empty group (taskAttempts is always
        // >= 1), so this constructs the edge case directly against the formatter's own declared
        // type (`number | null`) rather than trying to coax the aggregator into producing one —
        // the formatter must still render this honestly if it's ever handed one (e.g. a
        // hand-edited or future-schema summary read back from a report file).
        const [summary] = aggregateMultiTurnByModel([makeRecord()]);
        const table = formatMultiTurnModelSummaryMarkdownTable([{ ...summary, finalSuccessRate: null }]);
        const dataRow = table.split('\n')[2];
        expect(dataRow).toContain('n/a');
    });
});

describe('aggregateMultiTurnByModel: requested vs. actual model', () => {
    it('requestedModel and actualModel stay distinct fields, never conflated', () => {
        const records = [
            makeRecord({ requestedModel: 'openrouter/free', actualModel: 'meta-llama/llama-3.3-70b-instruct' }),
        ];
        const [summary] = aggregateMultiTurnByModel(records);
        expect(summary.requestedModel).toBe('openrouter/free');
        // The model-level summary groups by requestedModel; actualModel is a per-record detail
        // preserved on the raw record (verified below), not folded into the summary's identity.
        expect(records[0].actualModel).toBe('meta-llama/llama-3.3-70b-instruct');
    });
});

describe('aggregateMultiTurnByScenario: latency (P90 nearest-rank)', () => {
    it('p90ElapsedMs matches p90NearestRank directly, over ALL attempts regardless of outcome', () => {
        const elapsed = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
        const records: MultiTurnLiveRecord[] = elapsed.map((ms, i) =>
            makeRecord({
                attempt: i + 1,
                elapsedMs: ms,
                // Mix outcomes deliberately — latency counts every attempt, success or not.
                outcome: i % 3 === 0 ? 'failure' : 'success',
            })
        );
        const [summary] = aggregateMultiTurnByScenario(records);
        expect(summary.p90ElapsedMs).toBe(p90NearestRank(elapsed));
        expect(summary.p90ElapsedMs).toBe(900); // rank ceil(0.9*10)=9th smallest, 1-indexed
        expect(summary.medianElapsedMs).toBe(median(elapsed));
    });
});

describe('aggregateMultiTurnByScenario: cost coverage', () => {
    it('full cost coverage: every attempt priced — costDataPartial false, all cost figures known', () => {
        const records: MultiTurnLiveRecord[] = [
            makeRecord({ attempt: 1, outcome: 'success', effectiveCost: 0.001 }),
            makeRecord({ attempt: 2, outcome: 'success', effectiveCost: 0.002 }),
            makeRecord({ attempt: 3, outcome: 'failure', effectiveCost: 0.0005 }),
        ];
        const [summary] = aggregateMultiTurnByScenario(records);
        expect(summary.pricedAttemptCount).toBe(3);
        expect(summary.costCoverageRate).toBe(1);
        expect(summary.costDataPartial).toBe(false);
        expect(summary.totalKnownCost).toBeCloseTo(0.0035, 10);
        expect(summary.averageKnownCostPerPricedAttempt).toBeCloseTo(0.0035 / 3, 10);
        // costPerSuccessfulTask = totalKnownCost / successCount (2 successes), NOT / pricedAttemptCount.
        expect(summary.costPerSuccessfulTask).toBeCloseTo(0.0035 / 2, 10);
    });

    it('partial cost coverage: some attempts unpriced — missing cost is never treated as 0', () => {
        const records: MultiTurnLiveRecord[] = [
            makeRecord({ attempt: 1, outcome: 'success', effectiveCost: 0.001 }),
            makeRecord({ attempt: 2, outcome: 'success', effectiveCost: undefined }),
            makeRecord({ attempt: 3, outcome: 'success', effectiveCost: 0.003 }),
        ];
        const [summary] = aggregateMultiTurnByScenario(records);
        expect(summary.pricedAttemptCount).toBe(2);
        expect(summary.costDataPartial).toBe(true);
        expect(summary.costCoverageRate).toBeCloseTo(2 / 3, 10);
        // Sum of ONLY the two priced attempts — the unpriced one is excluded, never averaged in as 0.
        expect(summary.totalKnownCost).toBeCloseTo(0.004, 10);
        expect(summary.averageKnownCostPerPricedAttempt).toBeCloseTo(0.002, 10);
        // costPerSuccessfulTask divides by ALL 3 successes, even though only 2 are priced — this is
        // the documented "known cost only" convention, matching the model-level summary exactly.
        expect(summary.costPerSuccessfulTask).toBeCloseTo(0.004 / 3, 10);
    });

    it('no cost data at all: every total/average field is null, never a guessed 0 — but costCoverageRate is a real 0, not null (attempts > 0)', () => {
        const records: MultiTurnLiveRecord[] = [
            makeRecord({ attempt: 1, outcome: 'success', effectiveCost: undefined }),
            makeRecord({ attempt: 2, outcome: 'success', effectiveCost: undefined }),
        ];
        const [summary] = aggregateMultiTurnByScenario(records);
        expect(summary.pricedAttemptCount).toBe(0);
        expect(summary.totalKnownCost).toBeNull();
        expect(summary.averageKnownCostPerPricedAttempt).toBeNull();
        expect(summary.costPerSuccessfulTask).toBeNull();
        expect(summary.costCoverageRate).toBe(0);
        expect(summary.costDataPartial).toBe(true);
    });

    it('zero successful tasks: costPerSuccessfulTask is null even when cost data exists — nothing to divide by', () => {
        const records: MultiTurnLiveRecord[] = [
            makeRecord({ attempt: 1, outcome: 'failure', effectiveCost: 0.001 }),
            makeRecord({ attempt: 2, outcome: 'provider-error', effectiveCost: 0.002 }),
        ];
        const [summary] = aggregateMultiTurnByScenario(records);
        expect(summary.pricedAttemptCount).toBe(2);
        expect(summary.totalKnownCost).toBeCloseTo(0.003, 10);
        // Cost data IS fully known here — only the successCount denominator is zero.
        expect(summary.costDataPartial).toBe(false);
        expect(summary.costPerSuccessfulTask).toBeNull();
    });
});

describe('aggregateMultiTurnByScenario: multiple models sharing the same scenario', () => {
    it('never merges across models — one summary per (provider, model, scenarioId), each with its own stats', () => {
        const records: MultiTurnLiveRecord[] = [
            makeRecord({
                requestedModel: 'gpt-4o-mini',
                scenarioId: 'move-node-right',
                attempt: 1,
                elapsedMs: 100,
                effectiveCost: 0.0001,
            }),
            makeRecord({
                requestedModel: 'gpt-4o-mini',
                scenarioId: 'move-node-right',
                attempt: 2,
                elapsedMs: 200,
                effectiveCost: 0.0002,
            }),
            makeRecord({
                requestedModel: 'gpt-5-mini',
                scenarioId: 'move-node-right',
                attempt: 1,
                elapsedMs: 5000,
                effectiveCost: 0.01,
            }),
        ];
        const summaries = aggregateMultiTurnByScenario(records);
        expect(summaries).toHaveLength(2);

        const gpt4o = summaries.find(s => s.requestedModel === 'gpt-4o-mini');
        const gpt5 = summaries.find(s => s.requestedModel === 'gpt-5-mini');
        expect(gpt4o?.attempts).toBe(2);
        expect(gpt4o?.medianElapsedMs).toBe(150);
        expect(gpt4o?.totalKnownCost).toBeCloseTo(0.0003, 10);

        expect(gpt5?.attempts).toBe(1);
        expect(gpt5?.medianElapsedMs).toBe(5000);
        expect(gpt5?.totalKnownCost).toBeCloseTo(0.01, 10);

        // Neither model's stats leak into the other's — gpt-4o-mini's fast/cheap attempts never
        // pull gpt-5-mini's slow/expensive one down (or vice versa).
        expect(gpt4o?.medianElapsedMs).not.toBe(gpt5?.medianElapsedMs);
    });
});

describe('aggregateMultiTurnByScenario: sorts by scenarioId when provider and requestedModel tie', () => {
    it('two scenarios under the same (provider, model) sort by scenarioId, not left in encounter order', () => {
        const records: MultiTurnLiveRecord[] = [
            makeRecord({ scenarioId: 'zebra-scenario', attempt: 1 }),
            makeRecord({ scenarioId: 'alpha-scenario', attempt: 1 }),
        ];
        const summaries = aggregateMultiTurnByScenario(records);
        expect(summaries.map(s => s.scenarioId)).toEqual(['alpha-scenario', 'zebra-scenario']);
    });
});

describe('aggregateMultiTurnByModel is unaffected by the scenario-level cost/latency additions', () => {
    it('model-level aggregation semantics and output shape are unchanged', () => {
        const records: MultiTurnLiveRecord[] = [
            makeRecord({ attempt: 1, outcome: 'success', strategy: 'direct', effectiveCost: 0.001 }),
            makeRecord({ attempt: 2, outcome: 'failure', strategy: 'other', effectiveCost: undefined }),
        ];
        const [summary] = aggregateMultiTurnByModel(records);
        // Every pre-existing model-level field is still present and computed the same way.
        expect(summary.taskAttempts).toBe(2);
        expect(summary.successes).toBe(1);
        expect(summary.pricedAttemptCount).toBe(1);
        expect(summary.costDataPartial).toBe(true);
        expect(summary.costPerSuccessfulTask).toBeCloseTo(0.001, 10);
        // Model-level summaries have no scenarioId at all — confirms this is genuinely the
        // unmodified model-level shape, not accidentally merged with the scenario-level one.
        expect(summary).not.toHaveProperty('scenarioId');
    });
});

describe('formatMultiTurnScenarioMarkdownTable: latency and cost columns', () => {
    it('includes readable P90/cost columns and the exact known values, with no partial marker when coverage is full', () => {
        const records: MultiTurnLiveRecord[] = [
            makeRecord({ attempt: 1, outcome: 'success', elapsedMs: 100, effectiveCost: 0.001 }),
            makeRecord({ attempt: 2, outcome: 'success', elapsedMs: 200, effectiveCost: 0.002 }),
        ];
        const summaries = aggregateMultiTurnByScenario(records);
        const table = formatMultiTurnScenarioMarkdownTable(summaries);

        expect(table).toContain('P90 elapsed');
        expect(table).toContain('Priced attempts');
        expect(table).toContain('Cost coverage');
        expect(table).toContain('Total known cost');
        expect(table).toContain('Avg known cost/priced attempt');
        expect(table).toContain('Cost/success');
        expect(table).toContain('2/2'); // priced attempts column
        expect(table).not.toContain('‡');
        expect(table).not.toMatch(/cost data partial/i);
    });

    it('marks every cost cell with ‡ when costDataPartial is true, and explains the marker in a footnote', () => {
        const records: MultiTurnLiveRecord[] = [
            makeRecord({ attempt: 1, outcome: 'success', effectiveCost: 0.001 }),
            makeRecord({ attempt: 2, outcome: 'success', effectiveCost: undefined }),
        ];
        const summaries = aggregateMultiTurnByScenario(records);
        const table = formatMultiTurnScenarioMarkdownTable(summaries);

        expect(table).toContain('1/2'); // priced attempts column
        expect(table).toMatch(/‡/);
        expect(table.toLowerCase()).toContain('cost data partial');
    });

    it('shows "n/a" rather than a guessed number when there is no cost data at all', () => {
        const records: MultiTurnLiveRecord[] = [
            makeRecord({ attempt: 1, outcome: 'success', effectiveCost: undefined }),
        ];
        const summaries = aggregateMultiTurnByScenario(records);
        const table = formatMultiTurnScenarioMarkdownTable(summaries);
        const dataRow = table.split('\n')[2];
        expect(dataRow).toContain('n/a');
    });

    it('reports "no scenario attempts" rather than an empty/misleading table when nothing was recorded', () => {
        expect(formatMultiTurnScenarioMarkdownTable([])).toMatch(/no live multi-turn scenario attempts/i);
    });
});

describe('CSV/JSONL formatting', () => {
    const records: MultiTurnLiveRecord[] = [
        makeRecord({
            attempt: 2,
            outcome: 'success',
            strategy: 'lookup-first',
            completionMode: 'tool-action',
            requestedToolSequence: ['list_nodes', 'move_node'],
            turns: [turn({ turn: 1, toolCallName: 'list_nodes' }), turn({ turn: 2, toolCallName: 'move_node' })],
        }),
    ];

    it('CSV preserves attempt number, strategy, completionMode, outcome, and the requested tool sequence', () => {
        const csv = formatMultiTurnRecordsCsv(records);
        const lines = csv.split('\n');
        const header = lines[0].split(',');
        const row = lines[1];
        expect(header).toContain('attempt');
        expect(header).toContain('strategy');
        expect(header).toContain('completionMode');
        expect(header).toContain('outcome');
        expect(header).toContain('requestedToolSequence');
        expect(row).toContain('2'); // attempt
        expect(row).toContain('lookup-first');
        expect(row).toContain('tool-action');
        expect(row).toContain('success');
        expect(row).toMatch(/list_nodes.*move_node/);
    });

    it('JSONL preserves attempt number, strategy, completionMode, outcome, and the requested tool sequence natively', () => {
        const jsonl = formatMultiTurnRecordsJsonl(records);
        const parsed = JSON.parse(jsonl.split('\n')[0]) as MultiTurnLiveRecord;
        expect(parsed.attempt).toBe(2);
        expect(parsed.strategy).toBe('lookup-first');
        expect(parsed.completionMode).toBe('tool-action');
        expect(parsed.outcome).toBe('success');
        expect(parsed.requestedToolSequence).toEqual(['list_nodes', 'move_node']);
    });
});

/** Minimal quote-aware CSV row splitter — several columns (`turns`, `requestedToolSequence`,
 * `positionsBefore`/`positionsAfter`) are JSON blobs that themselves contain commas, so a naive
 * `.split(',')` misaligns every column after the first one that got quote-escaped. Mirrors
 * `csvEscape`'s own convention: a field containing a comma/quote/newline is wrapped in `"..."`
 * with internal `"` doubled. */
const parseCsvRow = (row: string): string[] => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < row.length; i += 1) {
        const char = row[i];
        if (inQuotes) {
            if (char === '"' && row[i + 1] === '"') {
                current += '"';
                i += 1;
            } else if (char === '"') {
                inQuotes = false;
            } else {
                current += char;
            }
        } else if (char === '"') {
            inQuotes = true;
        } else if (char === ',') {
            cells.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    cells.push(current);
    return cells;
};

describe('final canvas-state evidence (positionsBefore/positionsAfter/finalStateCorrect)', () => {
    const withPositions = makeRecord({
        outcome: 'success',
        finalStateCorrect: true,
        positionsBefore: { 'text-1': { x: 200, y: 200 } },
        positionsAfter: { 'text-1': { x: 300, y: 200 } },
    });

    it('CSV serializes positionsBefore/positionsAfter as JSON cells and finalStateCorrect as a plain boolean', () => {
        const csv = formatMultiTurnRecordsCsv([withPositions]);
        const lines = csv.split('\n');
        const header = lines[0].split(',');
        expect(header).toContain('positionsBefore');
        expect(header).toContain('positionsAfter');
        expect(header).toContain('finalStateCorrect');
        expect(lines[1]).toContain('true'); // finalStateCorrect
        // The JSON blob is comma-quoted (the CSV escaper wraps any cell containing a comma), so
        // check for the JSON content rather than a literal substring split across quoted commas.
        expect(csv).toContain('"x"');
        expect(csv).toContain('300');
    });

    it('CSV emits an empty cell (never a fabricated {}) for a timeout record with no position data at all', () => {
        const timedOut = makeRecord({
            outcome: 'timeout',
            finalStateCorrect: false,
            positionsBefore: undefined,
            positionsAfter: undefined,
        });
        const csv = formatMultiTurnRecordsCsv([timedOut]);
        const lines = csv.split('\n');
        const header = parseCsvRow(lines[0]);
        const row = parseCsvRow(lines[1]);
        expect(row[header.indexOf('positionsBefore')]).toBe('');
        expect(row[header.indexOf('positionsAfter')]).toBe('');
        expect(row[header.indexOf('finalStateCorrect')]).toBe('false');
    });

    it('JSONL round-trips positionsBefore/positionsAfter/finalStateCorrect natively, no serialization needed', () => {
        const jsonl = formatMultiTurnRecordsJsonl([withPositions]);
        const parsed = JSON.parse(jsonl) as MultiTurnLiveRecord;
        expect(parsed.positionsBefore).toEqual({ 'text-1': { x: 200, y: 200 } });
        expect(parsed.positionsAfter).toEqual({ 'text-1': { x: 300, y: 200 } });
        expect(parsed.finalStateCorrect).toBe(true);
    });

    it('a non-success outcome must not be recorded with finalStateCorrect: true, even if positions happen to look plausible', () => {
        // This is a type-level guarantee this test locks in as a convention check, not something
        // the formatter itself enforces — the live runner (realMultiTurnLocatorScenarios.spec.ts)
        // is the one responsible for deriving finalStateCorrect from outcome === 'success'.
        const failed = makeRecord({ outcome: 'failure', finalStateCorrect: false });
        expect(failed.finalStateCorrect).toBe(false);
        const maxTurns = makeRecord({ outcome: 'max-turns', finalStateCorrect: false });
        expect(maxTurns.finalStateCorrect).toBe(false);
        const providerError = makeRecord({ outcome: 'provider-error', finalStateCorrect: false });
        expect(providerError.finalStateCorrect).toBe(false);
    });
});

describe('trace stepStatus/continuationReason survive CSV/JSONL serialization', () => {
    // A successful lookup-first task: turn 1 is a continued (not failed) list_nodes step, turn 2 is
    // the completing move_node. Locks in that `formatMultiTurnRecordsCsv`/`formatMultiTurnRecordsJsonl`
    // (both of which just JSON.stringify `turns` wholesale) never need special-casing for these
    // fields — they round-trip for free — while also proving the corrected trace shape end to end.
    const lookupFirstRecord = makeRecord({
        outcome: 'success',
        strategy: 'lookup-first',
        turnCount: 2,
        requestedToolSequence: ['list_nodes', 'move_node'],
        turns: [
            turn({
                turn: 1,
                toolCallName: 'list_nodes',
                stepStatus: 'continued',
                continuationReason: 'task not complete after list_nodes',
            }),
            turn({ turn: 2, toolCallName: 'move_node' }),
        ],
    });

    it('CSV preserves stepStatus/continuationReason inside the serialized turns cell, with no error for the continued step', () => {
        const csv = formatMultiTurnRecordsCsv([lookupFirstRecord]);
        // The `turns` cell is JSON embedded inside a CSV-quoted field, so its own `"` are doubled.
        expect(csv).toContain('""stepStatus"":""continued""');
        expect(csv).toContain('""continuationReason"":""task not complete after list_nodes""');
        expect(csv).not.toContain('""error""');
    });

    it('JSONL round-trips the corrected turn trace exactly, including the absence of error on the continued step', () => {
        const jsonl = formatMultiTurnRecordsJsonl([lookupFirstRecord]);
        const parsed = JSON.parse(jsonl) as MultiTurnLiveRecord;
        expect(parsed.turns[0]).toEqual({
            turn: 1,
            toolCallName: 'list_nodes',
            textPresent: false,
            argsValid: true,
            dispatchOk: true,
            stepStatus: 'continued',
            continuationReason: 'task not complete after list_nodes',
        });
        expect(parsed.turns[0].error).toBeUndefined();
        expect(parsed.turns[1]).toEqual({
            turn: 2,
            toolCallName: 'move_node',
            textPresent: false,
            argsValid: true,
            dispatchOk: true,
        });
    });
});

describe('buildMultiTurnVerificationReport: one consolidated report across multiple models', () => {
    // Mirrors what a single realMultiTurnLocatorScenarios.spec.ts invocation with
    // LIVE_MULTI_TURN_MODEL_FILTER=gpt-4o-mini,gpt-5-mini actually builds: ALL_MULTI_TURN_RECORDS
    // accumulates attempts from every selected (provider, model) pair into one array, then this
    // function is called exactly once on it — never once per model, never merged from separate
    // per-model artifact directories.
    const gpt4oMiniRecord = makeRecord({ requestedModel: 'gpt-4o-mini', attempt: 1 });
    const gpt5MiniRecord = makeRecord({
        requestedModel: 'gpt-5-mini',
        attempt: 1,
        strategy: 'lookup-first',
        turnCount: 2,
    });
    const report = buildMultiTurnVerificationReport([gpt4oMiniRecord, gpt5MiniRecord], '2026-08-06T00:00:00.000Z');

    it('records contains one entry per attempt, from both models, in one array', () => {
        expect(report.records).toHaveLength(2);
        expect(report.records.map(r => r.requestedModel).sort()).toEqual(['gpt-4o-mini', 'gpt-5-mini']);
    });

    it('modelSummaries has one row per requestedModel, both present', () => {
        expect(report.modelSummaries).toHaveLength(2);
        expect(report.modelSummaries.map(s => s.requestedModel).sort()).toEqual(['gpt-4o-mini', 'gpt-5-mini']);
        for (const summary of report.modelSummaries) {
            expect(summary.taskAttempts).toBe(1);
        }
    });

    it('the CSV/JSONL formatters, given this one report, emit rows for both models in one artifact', () => {
        const csv = formatMultiTurnRecordsCsv(report.records);
        expect(csv).toContain('gpt-4o-mini');
        expect(csv).toContain('gpt-5-mini');
        const jsonl = formatMultiTurnRecordsJsonl(report.records);
        const lines = jsonl.split('\n');
        expect(lines).toHaveLength(2);
        expect(lines.map(l => (JSON.parse(l) as MultiTurnLiveRecord).requestedModel).sort()).toEqual([
            'gpt-4o-mini',
            'gpt-5-mini',
        ]);
    });
});

describe('formatMultiTurnCompletionModeMarkdownTable', () => {
    it('is a table SEPARATE from the strategy/model-summary table, with its own tool-action/text-response/incomplete/round-trip columns', () => {
        const records: MultiTurnLiveRecord[] = [
            makeRecord({
                attempt: 1,
                outcome: 'success',
                strategy: 'direct',
                completionMode: 'tool-action',
                requestedToolSequence: ['move_node'],
            }),
            makeRecord({
                attempt: 2,
                outcome: 'success',
                strategy: 'lookup-first',
                completionMode: 'text-response',
                requestedToolSequence: ['list_nodes'],
            }),
            makeRecord({
                attempt: 3,
                outcome: 'failure',
                strategy: 'other',
                completionMode: 'none',
                requestedToolSequence: [],
            }),
        ];
        const [summary] = aggregateMultiTurnByModel(records);
        const table = formatMultiTurnCompletionModeMarkdownTable([summary]);
        expect(table).toContain('Tool-action successes');
        expect(table).toContain('Text-response successes');
        expect(table).toContain('Incomplete attempts');
        expect(table).toContain('Successful lookup-action round trips');
        expect(table).toContain(`| ${summary.provider} | ${summary.requestedModel} | 3 | 1 | 1 | 1 | 0 |`);
    });

    it('reports "no attempts" rather than an empty/misleading table for zero summaries', () => {
        expect(formatMultiTurnCompletionModeMarkdownTable([])).toMatch(/no live multi-turn task attempts/i);
    });
});

describe('formatMultiTurnRecordsMarkdownDetails: attempt-level Markdown details', () => {
    it('includes completionMode alongside outcome/strategy/turns/cost for each attempt row', () => {
        const records: MultiTurnLiveRecord[] = [
            makeRecord({
                requestedModel: 'gpt-5-mini',
                actualModel: 'gpt-5-mini-2025-08-07',
                scenarioId: 'move-named-node-without-id',
                outcome: 'success',
                strategy: 'lookup-first',
                completionMode: 'tool-action',
                requestedToolSequence: ['list_nodes', 'move_node'],
                turnCount: 2,
                effectiveCost: 0.000725,
            }),
        ];
        const details = formatMultiTurnRecordsMarkdownDetails(records);
        expect(details).toContain('gpt-5-mini-2025-08-07');
        expect(details).toContain('move-named-node-without-id');
        expect(details).toContain('lookup-first');
        expect(details).toContain('tool-action');
        expect(details).toContain('list_nodes → move_node');
    });

    it('reports "no attempts" for an empty record set, never a header-only table presented as data', () => {
        expect(formatMultiTurnRecordsMarkdownDetails([])).toMatch(/no live multi-turn task attempts/i);
    });

    it('falls back to n/a / (none) / n/a for actualModel, an empty tool sequence, and a missing effectiveCost', () => {
        const records: MultiTurnLiveRecord[] = [
            makeRecord({
                actualModel: undefined,
                requestedToolSequence: [],
                effectiveCost: undefined,
            }),
        ];
        const details = formatMultiTurnRecordsMarkdownDetails(records);
        const dataRow = details.split('\n')[2];
        expect(dataRow).toContain('n/a'); // actualModel absent
        expect(dataRow).toContain('(none)'); // empty requestedToolSequence
        // Two distinct 'n/a' occurrences: actualModel and effectiveCost both fall back to it.
        expect((dataRow.match(/n\/a/g) ?? []).length).toBe(2);
    });
});

describe('existing reports remain otherwise compatible after adding completionMode', () => {
    it('formatMultiTurnRecordsCsv only ADDS the completionMode column — every pre-existing column is still present', () => {
        const originalColumns = [
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
        const header = formatMultiTurnRecordsCsv([makeRecord()]).split('\n')[0].split(',');
        for (const column of originalColumns) {
            expect(header).toContain(column);
        }
        expect(header).toContain('completionMode');
    });

    it("formatMultiTurnModelSummaryMarkdownTable's own header/columns are byte-for-byte unchanged (completion mode lives in its own separate table)", () => {
        const [summary] = aggregateMultiTurnByModel([makeRecord()]);
        const table = formatMultiTurnModelSummaryMarkdownTable([summary]);
        const header = table.split('\n')[0];
        expect(header).toBe(
            '| Provider | Model | Attempts | Success | Direct | Lookup-first | Text-only | Fail | ' +
                'Provider-error | Timeout | Max-turns | Success rate | Direct rate | Lookup-first rate | ' +
                'Avg turns | Median turns | Total elapsed | Avg elapsed | Median elapsed | P90 elapsed | ' +
                'Avg tokens | Avg provider tokens | Priced attempts | Cost coverage | Total known cost | ' +
                'Avg known cost/priced attempt | Cost/success |'
        );
        expect(header).not.toContain('tool-action');
        expect(header).not.toContain('completion');
    });

    it('adding completionMode to every record leaves directSuccesses/lookupFirstSuccesses/textOnlySuccesses computed exactly as before', () => {
        const records: MultiTurnLiveRecord[] = [
            makeRecord({ attempt: 1, outcome: 'success', strategy: 'direct', completionMode: 'tool-action' }),
            makeRecord({ attempt: 2, outcome: 'success', strategy: 'lookup-first', completionMode: 'tool-action' }),
            makeRecord({ attempt: 3, outcome: 'success', strategy: 'lookup-first', completionMode: 'text-response' }),
            makeRecord({ attempt: 4, outcome: 'success', strategy: 'text-only', completionMode: 'text-response' }),
        ];
        const [summary] = aggregateMultiTurnByModel(records);
        // Same counts a completionMode-unaware aggregation would have produced — completionMode's
        // two different values on attempts 2/3 (both lookup-first) never split lookupFirstSuccesses.
        expect(summary.directSuccesses).toBe(1);
        expect(summary.lookupFirstSuccesses).toBe(2);
        expect(summary.textOnlySuccesses).toBe(1);
    });
});

describe('MultiTurnRunManifest.requestedModels', () => {
    it('stores the parsed multi-model filter list, independent of the raw modelFilter string', () => {
        // Type-level + shape check: requestedModels is its own field, distinct from the raw
        // (unparsed) modelFilter — a manifest for a 2-model filter states both.
        const manifest: MultiTurnRunManifest = {
            generatedAt: '2026-08-06T00:00:00.000Z',
            liveMultiTurnTestsOptedIn: false,
            providerFilter: 'openai',
            modelFilter: 'gpt-4o-mini,gpt-5-mini',
            requestedModels: ['gpt-4o-mini', 'gpt-5-mini'],
            selectedScenarios: ['move-node-right'],
            repetitions: 1,
            maxTurns: 3,
            taskTimeoutMs: 60_000,
            plannedPairs: [],
            expectedTaskCount: 0,
            sourceSessionId: '2026-08-06T00:00:00.000Z',
            pricingVersion: '2026-07-31',
            gitSha: null,
            gitDirty: null,
            generationConfiguration: {
                openai: {
                    temperature: { status: 'provider-default' },
                    topP: { status: 'provider-default' },
                    topK: { status: 'unsupported' },
                    maxOutputTokens: { status: 'provider-default' },
                    reasoningEffort: { status: 'provider-default' },
                },
            },
        };
        expect(manifest.requestedModels).toEqual(['gpt-4o-mini', 'gpt-5-mini']);
        // Round-trips through JSON exactly (this is what run-manifest.json actually persists).
        expect((JSON.parse(JSON.stringify(manifest)) as MultiTurnRunManifest).requestedModels).toEqual([
            'gpt-4o-mini',
            'gpt-5-mini',
        ]);
    });
});

describe('formatGenerationConfigurationMarkdown', () => {
    it('shows the status word for provider-default/unsupported cells, never a guessed numeric value', () => {
        const table = formatGenerationConfigurationMarkdown({
            openai: {
                temperature: { status: 'provider-default' },
                topP: { status: 'provider-default' },
                topK: { status: 'unsupported' },
                maxOutputTokens: { status: 'provider-default' },
                reasoningEffort: { status: 'provider-default' },
            },
        });
        expect(table).toContain('| openai |');
        expect(table).toContain('provider-default');
        expect(table).toContain('unsupported');
        // Never a bare number that could be mistaken for a known provider default.
        expect(table).not.toMatch(/provider-default \(\d/);
    });

    it("shows the exact value for an explicit cell — e.g. anthropic's always-explicit maxOutputTokens", () => {
        const table = formatGenerationConfigurationMarkdown({
            anthropic: {
                temperature: { status: 'provider-default' },
                topP: { status: 'provider-default' },
                topK: { status: 'provider-default' },
                maxOutputTokens: { status: 'explicit', value: 1024 },
                reasoningEffort: { status: 'unsupported' },
            },
        });
        expect(table).toContain('explicit (1024)');
    });

    it('renders one row per provider when multiple providers are present in one run', () => {
        const table = formatGenerationConfigurationMarkdown({
            openai: {
                temperature: { status: 'provider-default' },
                topP: { status: 'provider-default' },
                topK: { status: 'unsupported' },
                maxOutputTokens: { status: 'provider-default' },
                reasoningEffort: { status: 'provider-default' },
            },
            anthropic: {
                temperature: { status: 'provider-default' },
                topP: { status: 'provider-default' },
                topK: { status: 'provider-default' },
                maxOutputTokens: { status: 'explicit', value: 1024 },
                reasoningEffort: { status: 'unsupported' },
            },
        });
        const rows = table.split('\n').slice(2); // drop header + separator
        expect(rows).toHaveLength(2);
        expect(table).toContain('| openai |');
        expect(table).toContain('| anthropic |');
    });

    it('reports "no configuration recorded" rather than an empty/misleading table when nothing was planned', () => {
        expect(formatGenerationConfigurationMarkdown({})).toMatch(/no generation configuration recorded/i);
    });
});

describe('empty record set', () => {
    it('produces no misleading successful-looking output', () => {
        expect(aggregateMultiTurnByModel([])).toEqual([]);
        expect(aggregateMultiTurnByScenario([])).toEqual([]);
        const table = formatMultiTurnModelSummaryMarkdownTable([]);
        expect(table).not.toMatch(/\|.*success.*\|/i);
        expect(table.toLowerCase()).toContain('no live multi-turn task attempts recorded');
        expect(formatMultiTurnRecordsCsv([]).split('\n')).toHaveLength(1); // header only
        expect(formatMultiTurnRecordsJsonl([])).toBe('');
    });
});

describe('existing single-turn metric behavior is unaffected by this module', () => {
    it('accumulateExtendedUsage still combines multi-call usage exactly as before', () => {
        const calls: CapturedCallInfo[] = [
            { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
            { inputTokens: 20, outputTokens: 8, totalTokens: 28 },
        ];
        const combined = accumulateExtendedUsage(calls);
        expect(combined.inputTokens).toBe(30);
        expect(combined.outputTokens).toBe(13);
        expect(combined.totalTokens).toBe(43);
    });

    it('aggregateVerificationMetrics still groups single-turn records by (provider, model) as before', () => {
        const records: VerificationRunRecord[] = [
            {
                provider: 'OpenAI',
                model: 'gpt-4o-mini',
                scenarioId: 'move-node-right',
                outcome: 'pass',
                startedAt: 0,
                endedAt: 100,
                elapsedMs: 100,
                inputTokens: 10,
                outputTokens: 5,
                totalTokens: 15,
            },
        ];
        const [aggregate] = aggregateVerificationMetrics(records);
        expect(aggregate.provider).toBe('OpenAI');
        expect(aggregate.model).toBe('gpt-4o-mini');
        expect(aggregate.passCount).toBe(1);
        expect(aggregate.scenarioCount).toBe(1);
    });
});
