import { describe, expect, it } from 'vitest';

import {
    accumulateExtendedUsage,
    accumulateUsage,
    aggregateVerificationMetrics,
    buildElapsedVsTokensChart,
    buildVerificationMetricsReport,
    distinctSourceSessions,
    formatCostRanking,
    formatMetricsMarkdownTable,
    formatTokenDiagnosticsTable,
    mergeVerificationRecords,
    wrapGatewayWithUsageCapture,
} from '../../llm/verificationMetrics';

import type { Chunk, LlmGateway } from '../../llm/llmGateway';
import type {
    CapturedCallInfo,
    ProviderModelAggregate,
    VerificationMetricsReport,
    VerificationRunRecord,
} from '../../llm/verificationMetrics';

const drain = async (stream: AsyncIterable<Chunk>): Promise<Chunk[]> => {
    const chunks: Chunk[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    return chunks;
};

const scriptedGateway = (chunks: Chunk[]): LlmGateway => ({
    capabilities: { toolCalls: true },
    async *chat() {
        for (const chunk of chunks) yield chunk;
    },
});

const record = (overrides: Partial<VerificationRunRecord>): VerificationRunRecord => ({
    provider: 'OpenAI',
    model: 'gpt-4o-mini',
    scenarioId: 'move-node-right',
    outcome: 'pass',
    startedAt: 1000,
    endedAt: 1500,
    elapsedMs: 500,
    inputTokens: 10,
    outputTokens: 5,
    totalTokens: 15,
    ...overrides,
});

describe('wrapGatewayWithUsageCapture', () => {
    it('passes every chunk through unchanged', async () => {
        const chunks: Chunk[] = [{ text: 'hi' }, { done: true, usage: { inputTokens: 3, outputTokens: 2 } }];
        const wrapped = wrapGatewayWithUsageCapture(scriptedGateway(chunks), () => undefined);
        expect(await drain(wrapped.chat({ messages: [], tools: [] }))).toEqual(chunks);
    });

    it('captures usage from the done chunk after the stream is fully drained', async () => {
        const chunks: Chunk[] = [{ text: 'hi' }, { done: true, usage: { inputTokens: 10, outputTokens: 4 } }];
        let captured: unknown;
        const wrapped = wrapGatewayWithUsageCapture(scriptedGateway(chunks), usage => {
            captured = usage;
        });
        await drain(wrapped.chat({ messages: [], tools: [] }));
        expect(captured).toEqual({ inputTokens: 10, outputTokens: 4, totalTokens: 14 });
    });

    it('reports null, not zero, when no chunk carries usage — never fabricates a value', async () => {
        const chunks: Chunk[] = [{ text: 'hi' }, { done: true }];
        let captured: unknown;
        const wrapped = wrapGatewayWithUsageCapture(scriptedGateway(chunks), usage => {
            captured = usage;
        });
        await drain(wrapped.chat({ messages: [], tools: [] }));
        expect(captured).toEqual({ inputTokens: null, outputTokens: null, totalTokens: null });
    });

    it('captures the extended cost/token breakdown fields alongside the basic usage totals', async () => {
        const chunks: Chunk[] = [
            {
                done: true,
                usage: {
                    inputTokens: 10,
                    outputTokens: 4,
                    cachedInputTokens: 3,
                    cacheWriteInputTokens: 2,
                    reasoningTokens: 5,
                    toolUseInputTokens: 1,
                    providerTotalTokens: 25,
                    estimatedCost: 0.0012,
                    costSource: 'estimated',
                },
            },
        ];
        let captured: CapturedCallInfo | undefined;
        const wrapped = wrapGatewayWithUsageCapture(scriptedGateway(chunks), usage => {
            captured = usage;
        });
        await drain(wrapped.chat({ messages: [], tools: [] }));

        expect(captured).toEqual({
            inputTokens: 10,
            outputTokens: 4,
            totalTokens: 14,
            cachedInputTokens: 3,
            cacheWriteInputTokens: 2,
            reasoningTokens: 5,
            toolUseInputTokens: 1,
            providerTotalTokens: 25,
            estimatedCost: 0.0012,
            costSource: 'estimated',
        });
    });

    it('prefers providerReportedCost when present, still captures it verbatim', async () => {
        const chunks: Chunk[] = [{ done: true, usage: { providerReportedCost: 0.00042, costSource: 'provider-reported' } }];
        let captured: CapturedCallInfo | undefined;
        const wrapped = wrapGatewayWithUsageCapture(scriptedGateway(chunks), usage => {
            captured = usage;
        });
        await drain(wrapped.chat({ messages: [], tools: [] }));

        expect(captured?.providerReportedCost).toBe(0.00042);
        expect(captured?.costSource).toBe('provider-reported');
        expect(captured).not.toHaveProperty('estimatedCost');
    });

    it('captures an explicit estimatedCost: null (unknown pricing) — distinct from never having attempted it', async () => {
        const chunks: Chunk[] = [{ done: true, usage: { inputTokens: 10, estimatedCost: null } }];
        let captured: CapturedCallInfo | undefined;
        const wrapped = wrapGatewayWithUsageCapture(scriptedGateway(chunks), usage => {
            captured = usage;
        });
        await drain(wrapped.chat({ messages: [], tools: [] }));

        expect(captured).toHaveProperty('estimatedCost');
        expect(captured?.estimatedCost).toBeNull();
    });

    it('preserves capabilities from the wrapped gateway', () => {
        const wrapped = wrapGatewayWithUsageCapture(scriptedGateway([]), () => undefined);
        expect(wrapped.capabilities).toEqual({ toolCalls: true });
    });

    it('still fires onUsage when the wrapped gateway throws mid-stream', async () => {
        const throwing: LlmGateway = {
            async *chat() {
                yield { text: 'partial' };
                throw new Error('boom');
            },
        };
        let captured: unknown;
        const wrapped = wrapGatewayWithUsageCapture(throwing, usage => {
            captured = usage;
        });
        await expect(drain(wrapped.chat({ messages: [], tools: [] }))).rejects.toThrow('boom');
        expect(captured).toEqual({ inputTokens: null, outputTokens: null, totalTokens: null });
    });
});

describe('accumulateUsage', () => {
    it('sums usage across multiple calls (e.g. a two-turn round trip)', () => {
        expect(
            accumulateUsage([
                { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
                { inputTokens: 8, outputTokens: 6, totalTokens: 14 },
            ])
        ).toEqual({ inputTokens: 18, outputTokens: 11, totalTokens: 29 });
    });

    it('stays null for a field only NO call reported, not just some', () => {
        expect(
            accumulateUsage([
                { inputTokens: 10, outputTokens: null, totalTokens: null },
                { inputTokens: null, outputTokens: null, totalTokens: null },
            ])
        ).toEqual({ inputTokens: 10, outputTokens: null, totalTokens: null });
    });

    it('returns all-null for an empty list rather than zero', () => {
        expect(accumulateUsage([])).toEqual({ inputTokens: null, outputTokens: null, totalTokens: null });
    });
});

describe('accumulateExtendedUsage (multi-turn accumulation)', () => {
    it('sums the extended token buckets across multiple calls, same as accumulateUsage does for input/output', () => {
        const combined = accumulateExtendedUsage([
            { inputTokens: 10, outputTokens: 5, totalTokens: 15, cachedInputTokens: 2, reasoningTokens: 3 },
            { inputTokens: 8, outputTokens: 6, totalTokens: 14, cachedInputTokens: 4, toolUseInputTokens: 7 },
        ]);

        expect(combined.inputTokens).toBe(18);
        expect(combined.outputTokens).toBe(11);
        expect(combined.cachedInputTokens).toBe(6);
        expect(combined.reasoningTokens).toBe(3);
        expect(combined.toolUseInputTokens).toBe(7);
    });

    it('sums cost across turns, preferring provider-reported per call before summing', () => {
        const combined = accumulateExtendedUsage([
            { inputTokens: 10, outputTokens: 5, totalTokens: 15, providerReportedCost: 0.001 },
            { inputTokens: 8, outputTokens: 6, totalTokens: 14, providerReportedCost: 0.002 },
        ]);

        expect(combined.estimatedCost).toBeCloseTo(0.003, 10);
        expect(combined.costSource).toBe('provider-reported');
    });

    it('marks costSource "estimated" if ANY contributing call used an estimate, even if others were provider-reported', () => {
        const combined = accumulateExtendedUsage([
            { inputTokens: 10, outputTokens: 5, totalTokens: 15, providerReportedCost: 0.001 },
            { inputTokens: 8, outputTokens: 6, totalTokens: 14, estimatedCost: 0.0025 },
        ]);

        expect(combined.estimatedCost).toBeCloseTo(0.0035, 10);
        expect(combined.costSource).toBe('estimated');
    });

    it('leaves cost fields absent, not zero, when no call in the round trip had a usable cost', () => {
        const combined = accumulateExtendedUsage([
            { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
            { inputTokens: 8, outputTokens: 6, totalTokens: 14, estimatedCost: null },
        ]);

        expect(combined).not.toHaveProperty('estimatedCost');
        expect(combined).not.toHaveProperty('costSource');
    });

    it('returns all-null/absent for an empty list, matching accumulateUsage', () => {
        const combined = accumulateExtendedUsage([]);
        expect(combined.inputTokens).toBeNull();
        expect(combined.outputTokens).toBeNull();
        expect(combined).not.toHaveProperty('cachedInputTokens');
        expect(combined).not.toHaveProperty('estimatedCost');
    });
});

describe('aggregateVerificationMetrics', () => {
    it('groups by (provider, model) and counts every outcome bucket', () => {
        const records: VerificationRunRecord[] = [
            record({ scenarioId: 'move-node-right', outcome: 'pass' }),
            record({ scenarioId: 'move-node-left', outcome: 'known-variance' }),
            record({ scenarioId: 'unknown-target', outcome: 'fail' }),
            record({ scenarioId: 'move-node-up', outcome: 'timeout' }),
            record({ scenarioId: 'move-node-down', outcome: 'provider-error' }),
        ];

        const [aggregate] = aggregateVerificationMetrics(records);

        expect(aggregate.provider).toBe('OpenAI');
        expect(aggregate.model).toBe('gpt-4o-mini');
        expect(aggregate.scenarioCount).toBe(5);
        expect(aggregate.passCount).toBe(1);
        expect(aggregate.knownVarianceCount).toBe(1);
        expect(aggregate.failCount).toBe(1);
        expect(aggregate.timeoutCount).toBe(1);
        expect(aggregate.providerErrorCount).toBe(1);
        expect(aggregate.acceptedCount).toBe(2);
    });

    it('never fabricates a token total: null when no record in the group reported usage', () => {
        const records: VerificationRunRecord[] = [
            record({ scenarioId: 'a', inputTokens: null, outputTokens: null, totalTokens: null }),
            record({ scenarioId: 'b', inputTokens: null, outputTokens: null, totalTokens: null }),
        ];
        const [aggregate] = aggregateVerificationMetrics(records);
        expect(aggregate.totalInputTokens).toBeNull();
        expect(aggregate.totalOutputTokens).toBeNull();
        expect(aggregate.totalTokens).toBeNull();
        expect(aggregate.tokensIncomplete).toBe(true);
    });

    it('flags tokensIncomplete and still sums the values that ARE available when usage is partial', () => {
        const records: VerificationRunRecord[] = [
            record({ scenarioId: 'a', inputTokens: 10, outputTokens: 5, totalTokens: 15 }),
            record({ scenarioId: 'b', inputTokens: null, outputTokens: null, totalTokens: null }),
        ];
        const [aggregate] = aggregateVerificationMetrics(records);
        expect(aggregate.totalInputTokens).toBe(10);
        expect(aggregate.totalOutputTokens).toBe(5);
        expect(aggregate.tokensIncomplete).toBe(true);
    });

    it('does not flag tokensIncomplete when every record in the group reported usage', () => {
        const records: VerificationRunRecord[] = [
            record({ scenarioId: 'a', inputTokens: 10, outputTokens: 5, totalTokens: 15 }),
            record({ scenarioId: 'b', inputTokens: 8, outputTokens: 4, totalTokens: 12 }),
        ];
        const [aggregate] = aggregateVerificationMetrics(records);
        expect(aggregate.totalInputTokens).toBe(18);
        expect(aggregate.tokensIncomplete).toBe(false);
    });

    it('computes total and average elapsed time', () => {
        const records: VerificationRunRecord[] = [
            record({ scenarioId: 'a', elapsedMs: 400 }),
            record({ scenarioId: 'b', elapsedMs: 600 }),
        ];
        const [aggregate] = aggregateVerificationMetrics(records);
        expect(aggregate.totalElapsedMs).toBe(1000);
        expect(aggregate.avgElapsedMs).toBe(500);
    });

    it('keeps separate providers/models in separate groups, sorted by provider then model', () => {
        const records: VerificationRunRecord[] = [
            record({ provider: 'Gemini', model: 'gemini-2.5-flash', scenarioId: 'a' }),
            record({ provider: 'OpenAI', model: 'gpt-5-mini', scenarioId: 'a' }),
            record({ provider: 'OpenAI', model: 'gpt-4o-mini', scenarioId: 'a' }),
        ];
        const aggregates = aggregateVerificationMetrics(records);
        expect(aggregates.map(a => `${a.provider}/${a.model}`)).toEqual([
            'Gemini/gemini-2.5-flash',
            'OpenAI/gpt-4o-mini',
            'OpenAI/gpt-5-mini',
        ]);
    });

    it('returns an empty array for an empty input, not a fabricated placeholder row', () => {
        expect(aggregateVerificationMetrics([])).toEqual([]);
    });

    describe('cost aggregation', () => {
        it('sums totalCost across the group and computes avgCostPerScenario', () => {
            const records: VerificationRunRecord[] = [
                record({ scenarioId: 'a', estimatedCost: 0.001, costSource: 'estimated' }),
                record({ scenarioId: 'b', estimatedCost: 0.003, costSource: 'estimated' }),
            ];
            const [aggregate] = aggregateVerificationMetrics(records);
            expect(aggregate.totalCost).toBeCloseTo(0.004, 10);
            expect(aggregate.avgCostPerScenario).toBeCloseTo(0.002, 10);
            expect(aggregate.costIncomplete).toBe(false);
        });

        it('prefers providerReportedCost over estimatedCost per record when summing', () => {
            const records: VerificationRunRecord[] = [
                record({ scenarioId: 'a', providerReportedCost: 0.01, estimatedCost: 0.5, costSource: 'provider-reported' }),
            ];
            const [aggregate] = aggregateVerificationMetrics(records);
            expect(aggregate.totalCost).toBeCloseTo(0.01, 10);
        });

        it('returns totalCost: null (not 0) when NO record in the group has any cost figure — e.g. usage never captured', () => {
            const records: VerificationRunRecord[] = [record({ scenarioId: 'a' }), record({ scenarioId: 'b' })];
            const [aggregate] = aggregateVerificationMetrics(records);
            expect(aggregate.totalCost).toBeNull();
            expect(aggregate.avgCostPerScenario).toBeNull();
            expect(aggregate.costIncomplete).toBe(true);
        });

        it('returns totalCost: null (not 0) when every record has estimatedCost: null — unknown pricing, never fabricated as free', () => {
            const records: VerificationRunRecord[] = [
                record({ scenarioId: 'a', estimatedCost: null }),
                record({ scenarioId: 'b', estimatedCost: null }),
            ];
            const [aggregate] = aggregateVerificationMetrics(records);
            expect(aggregate.totalCost).toBeNull();
            expect(aggregate.costIncomplete).toBe(true);
        });

        it('flags costIncomplete and still sums what IS available when only some records have a cost figure', () => {
            const records: VerificationRunRecord[] = [
                record({ scenarioId: 'a', estimatedCost: 0.002, costSource: 'estimated' }),
                record({ scenarioId: 'b', estimatedCost: null }), // unregistered pricing this record
                record({ scenarioId: 'c' }), // usage never captured at all
            ];
            const [aggregate] = aggregateVerificationMetrics(records);
            expect(aggregate.totalCost).toBeCloseTo(0.002, 10);
            expect(aggregate.costIncomplete).toBe(true);
        });

        it('sums the diagnostic token buckets (cached/cache-write/reasoning/tool-use/provider-total) independently of cost', () => {
            const records: VerificationRunRecord[] = [
                record({
                    scenarioId: 'a',
                    cachedInputTokens: 100,
                    cacheWriteInputTokens: 50,
                    reasoningTokens: 200,
                    toolUseInputTokens: 30,
                    providerTotalTokens: 500,
                }),
                record({
                    scenarioId: 'b',
                    cachedInputTokens: 20,
                    reasoningTokens: 10,
                }),
            ];
            const [aggregate] = aggregateVerificationMetrics(records);
            expect(aggregate.totalCachedInputTokens).toBe(120);
            expect(aggregate.totalCacheWriteInputTokens).toBe(50);
            expect(aggregate.totalReasoningTokens).toBe(210);
            expect(aggregate.totalToolUseInputTokens).toBe(30);
            expect(aggregate.totalProviderTokens).toBe(500);
        });

        it('returns null (not 0) for a diagnostic token bucket no record in the group reported at all', () => {
            const records: VerificationRunRecord[] = [record({ scenarioId: 'a' })];
            const [aggregate] = aggregateVerificationMetrics(records);
            expect(aggregate.totalCachedInputTokens).toBeNull();
            expect(aggregate.totalCacheWriteInputTokens).toBeNull();
            expect(aggregate.totalReasoningTokens).toBeNull();
            expect(aggregate.totalToolUseInputTokens).toBeNull();
            expect(aggregate.totalProviderTokens).toBeNull();
        });

        it('reports a single distinctActualModels entry when every record in the group resolved to the same model', () => {
            const records: VerificationRunRecord[] = [
                record({ scenarioId: 'a', actualModel: 'openai/gpt-4o-mini' }),
                record({ scenarioId: 'b', actualModel: 'openai/gpt-4o-mini' }),
            ];
            const [aggregate] = aggregateVerificationMetrics(records);
            expect(aggregate.distinctActualModels).toEqual(['openai/gpt-4o-mini']);
        });

        it('reports every distinct actualModel when a route resolved to more than one underlying model — never silently blended', () => {
            const records: VerificationRunRecord[] = [
                record({ provider: 'OpenRouter', model: 'openrouter/free', scenarioId: 'a', actualModel: 'model-a' }),
                record({ provider: 'OpenRouter', model: 'openrouter/free', scenarioId: 'b', actualModel: 'model-b' }),
            ];
            const [aggregate] = aggregateVerificationMetrics(records);
            expect(aggregate.distinctActualModels).toEqual(['model-a', 'model-b']);
        });

        it('returns an empty distinctActualModels when the provider never reports one', () => {
            const records: VerificationRunRecord[] = [record({ scenarioId: 'a' })];
            const [aggregate] = aggregateVerificationMetrics(records);
            expect(aggregate.distinctActualModels).toEqual([]);
        });

        it('reports every distinct pricingVersion among estimated-cost records — mixing after a rate update is never silently combined', () => {
            const records: VerificationRunRecord[] = [
                record({ scenarioId: 'a', estimatedCost: 0.001, costSource: 'estimated', pricingVersion: '2026-07-31' }),
                record({ scenarioId: 'b', estimatedCost: 0.002, costSource: 'estimated', pricingVersion: '2026-09-01' }),
            ];
            const [aggregate] = aggregateVerificationMetrics(records);
            expect(aggregate.distinctPricingVersions).toEqual(['2026-07-31', '2026-09-01']);
            // The sum is still mathematically correct even though the versions differ.
            expect(aggregate.totalCost).toBeCloseTo(0.003, 10);
        });

        it('does not report a pricingVersion mismatch for a group priced entirely via providerReportedCost', () => {
            const records: VerificationRunRecord[] = [
                record({ scenarioId: 'a', providerReportedCost: 0.001, costSource: 'provider-reported' }),
                record({ scenarioId: 'b', providerReportedCost: 0.002, costSource: 'provider-reported' }),
            ];
            const [aggregate] = aggregateVerificationMetrics(records);
            expect(aggregate.distinctPricingVersions).toEqual([]);
        });

        it('returns an empty distinctCacheWriteTtls when the group has no cache-write tokens at all', () => {
            const records: VerificationRunRecord[] = [record({ scenarioId: 'a' })];
            const [aggregate] = aggregateVerificationMetrics(records);
            expect(aggregate.distinctCacheWriteTtls).toEqual([]);
        });

        it('reports a single distinctCacheWriteTtls entry when every cache-write in the group used the same TTL', () => {
            const records: VerificationRunRecord[] = [
                record({ scenarioId: 'a', cacheWriteInputTokens: 100, cacheWriteTtl: '5m' }),
                record({ scenarioId: 'b', cacheWriteInputTokens: 200, cacheWriteTtl: '5m' }),
            ];
            const [aggregate] = aggregateVerificationMetrics(records);
            expect(aggregate.distinctCacheWriteTtls).toEqual(['5m']);
        });

        it('reports every distinct cacheWriteTtl when a group mixes TTLs, including "unknown"', () => {
            const records: VerificationRunRecord[] = [
                record({
                    scenarioId: 'a',
                    cacheWriteInputTokens: 100,
                    cacheWriteTtl: '5m',
                    estimatedCost: 0.001,
                    costSource: 'estimated',
                }),
                record({
                    scenarioId: 'b',
                    cacheWriteInputTokens: 200,
                    cacheWriteTtl: '1h',
                    estimatedCost: 0.002,
                    costSource: 'estimated',
                }),
                record({ scenarioId: 'c', cacheWriteInputTokens: 300, cacheWriteTtl: 'unknown', estimatedCost: null }),
            ];
            const [aggregate] = aggregateVerificationMetrics(records);
            expect(aggregate.distinctCacheWriteTtls).toEqual(['1h', '5m', 'unknown']);
            // 'a' and 'b' both have a real cost figure — only 'c' (the 'unknown'-TTL scenario) is
            // missing one, so costIncomplete traces specifically to the TTL ambiguity, not to some
            // other unrelated gap.
            expect(aggregate.costIncomplete).toBe(true);
            expect(aggregate.totalCost).toBeCloseTo(0.003, 10);
        });
    });
});

describe('formatMetricsMarkdownTable', () => {
    it('renders a header, separator, and one row per aggregate — cost-led, per "make cost primary"', () => {
        const table = formatMetricsMarkdownTable(aggregateVerificationMetrics([record({ estimatedCost: 0.0012 })]));
        const lines = table.split('\n');
        expect(lines[0]).toContain('Provider');
        expect(lines[0]).toContain('Total cost');
        expect(lines[0]).toContain('Avg cost/scenario');
        // Token counts moved to formatTokenDiagnosticsTable — no longer in the primary comparison.
        expect(lines[0]).not.toContain('Input tokens');
        expect(lines[1]).toMatch(/^\|( ---:? \|)+$/);
        expect(lines[2]).toContain('OpenAI');
        expect(lines[2]).toContain('gpt-4o-mini');
        expect(lines[2]).toContain('$0.0012');
    });

    it('renders n/a for a fully-null cost field, never a fabricated 0', () => {
        const table = formatMetricsMarkdownTable(aggregateVerificationMetrics([record({})]));
        expect(table).toContain('n/a | n/a |');
    });

    it('marks a partial cost total with * and adds the explanatory footnote', () => {
        const table = formatMetricsMarkdownTable(
            aggregateVerificationMetrics([
                record({ scenarioId: 'a', estimatedCost: 0.001, costSource: 'estimated' }),
                record({ scenarioId: 'b' }), // no cost figure at all
            ])
        );
        expect(table).toContain('$0.0010*');
        expect(table).toContain('partial total');
    });

    it('renders an honest empty-state message when there are no records, not an empty table', () => {
        const table = formatMetricsMarkdownTable([]);
        expect(table).not.toContain('|');
        expect(table.toLowerCase()).toContain('no real-provider verification runs');
    });

    it('marks a row with † and a footnote when its requested model/route resolved to more than one actual model', () => {
        const records: VerificationRunRecord[] = [
            record({ provider: 'OpenRouter', model: 'openrouter/free', scenarioId: 'a', actualModel: 'model-a' }),
            record({ provider: 'OpenRouter', model: 'openrouter/free', scenarioId: 'b', actualModel: 'model-b' }),
        ];
        const table = formatMetricsMarkdownTable(aggregateVerificationMetrics(records));
        expect(table).toContain('openrouter/free†');
        expect(table).toContain('resolved to more than one actual model');
        expect(table).toContain('model-a, model-b');
    });

    it('marks a row with ‡ and a footnote when its cost sums estimates from more than one pricing version', () => {
        const records: VerificationRunRecord[] = [
            record({ scenarioId: 'a', estimatedCost: 0.001, costSource: 'estimated', pricingVersion: '2026-07-31' }),
            record({ scenarioId: 'b', estimatedCost: 0.002, costSource: 'estimated', pricingVersion: '2026-09-01' }),
        ];
        const table = formatMetricsMarkdownTable(aggregateVerificationMetrics(records));
        expect(table).toContain('‡');
        expect(table).toContain('more than one pricing snapshot');
        expect(table).toContain('2026-07-31, 2026-09-01');
    });

    it('adds no mixing footnotes when every row has a single actualModel and pricingVersion', () => {
        const table = formatMetricsMarkdownTable(aggregateVerificationMetrics([record({})]));
        expect(table).not.toContain('†');
        expect(table).not.toContain('‡');
    });
});

describe('formatTokenDiagnosticsTable', () => {
    it('renders the full token breakdown, separate from the cost-led primary table', () => {
        const table = formatTokenDiagnosticsTable(
            aggregateVerificationMetrics([
                record({
                    inputTokens: 10,
                    cachedInputTokens: 3,
                    cacheWriteInputTokens: 1,
                    toolUseInputTokens: 2,
                    outputTokens: 5,
                    reasoningTokens: 4,
                    providerTotalTokens: 25,
                }),
            ])
        );
        const lines = table.split('\n');
        expect(lines[0]).toContain('Uncached input');
        expect(lines[0]).toContain('Cached input');
        expect(lines[0]).toContain('Reasoning');
        expect(lines[0]).toContain('Provider total');
        expect(lines[2]).toContain('10'); // uncached input
        expect(lines[2]).toContain('3'); // cached input
        expect(lines[2]).toContain('4'); // reasoning
    });

    it('renders n/a for a fully-null diagnostic bucket, never a fabricated 0', () => {
        const table = formatTokenDiagnosticsTable(aggregateVerificationMetrics([record({})]));
        expect(table).toContain('n/a');
    });

    it('renders an honest empty-state message when there are no records', () => {
        const table = formatTokenDiagnosticsTable([]);
        expect(table.toLowerCase()).toContain('no token diagnostics');
    });
});

describe('formatCostRanking', () => {
    it('ranks models cheapest to most expensive by total cost', () => {
        const aggregates = aggregateVerificationMetrics([
            record({ provider: 'Gemini', model: 'gemini-2.5-flash', scenarioId: 'a', estimatedCost: 0.005 }),
            record({ provider: 'OpenAI', model: 'gpt-4o-mini', scenarioId: 'a', estimatedCost: 0.001 }),
        ]);
        const ranking = formatCostRanking(aggregates);
        const openAiIndex = ranking.indexOf('OpenAI gpt-4o-mini');
        const geminiIndex = ranking.indexOf('Gemini gemini-2.5-flash');
        expect(openAiIndex).toBeGreaterThanOrEqual(0);
        expect(geminiIndex).toBeGreaterThan(openAiIndex);
        expect(ranking).toContain('1. **OpenAI gpt-4o-mini**');
    });

    it('excludes and separately lists models with no cost figure at all, never sorting null as "cheapest"', () => {
        const aggregates = aggregateVerificationMetrics([
            record({ provider: 'Gemini', model: 'gemini-2.5-flash', scenarioId: 'a', estimatedCost: 0.005 }),
            record({ provider: 'Claude', model: 'claude-haiku-4-5', scenarioId: 'a' }), // no cost at all
        ]);
        const ranking = formatCostRanking(aggregates);
        expect(ranking).toContain('1. **Gemini gemini-2.5-flash**');
        expect(ranking).not.toContain('Claude claude-haiku-4-5**'); // not ranked as a numbered entry
        expect(ranking).toContain('Not ranked');
        expect(ranking).toContain('Claude claude-haiku-4-5');
    });

    it('renders an honest empty-state message when no aggregate has a cost figure at all', () => {
        const aggregates = aggregateVerificationMetrics([record({})]);
        const ranking = formatCostRanking(aggregates);
        expect(ranking.toLowerCase()).toContain('no model has a cost figure');
    });
});

describe('buildVerificationMetricsReport', () => {
    it('bundles generatedAt (from the injected clock), aggregates, and raw records', () => {
        const fixedNow = () => new Date('2026-07-28T00:00:00.000Z');
        const records = [record({})];
        const report = buildVerificationMetricsReport(records, fixedNow);

        expect(report.generatedAt).toBe('2026-07-28T00:00:00.000Z');
        expect(report.records).toBe(records);
        expect(report.aggregates).toHaveLength(1);
        expect(report.aggregates[0].provider).toBe('OpenAI');
    });
});

describe('buildElapsedVsTokensChart', () => {
    const aggregate = (overrides: Partial<ProviderModelAggregate>): ProviderModelAggregate => ({
        provider: 'OpenAI',
        model: 'gpt-4o-mini',
        scenarioCount: 11,
        passCount: 10,
        knownVarianceCount: 1,
        failCount: 0,
        providerErrorCount: 0,
        timeoutCount: 0,
        acceptedCount: 11,
        totalInputTokens: 100,
        totalOutputTokens: 50,
        totalTokens: 150,
        tokensIncomplete: false,
        totalCachedInputTokens: null,
        totalCacheWriteInputTokens: null,
        totalReasoningTokens: null,
        totalToolUseInputTokens: null,
        totalProviderTokens: null,
        totalCost: 0.001,
        avgCostPerScenario: 0.001 / 11,
        costIncomplete: false,
        distinctActualModels: [],
        distinctPricingVersions: [],
        distinctCacheWriteTtls: [],
        totalElapsedMs: 5500,
        avgElapsedMs: 500,
        ...overrides,
    });

    it('renders a Mermaid quadrantChart with the required title and axes', () => {
        const { markdown } = buildElapsedVsTokensChart([aggregate({})]);
        expect(markdown).toContain('```mermaid');
        expect(markdown).toContain('quadrantChart');
        expect(markdown).toContain('title Average elapsed time vs. consumed tokens by model');
        expect(markdown).toContain('x-axis Low elapsed --> High elapsed');
        expect(markdown).toContain('y-axis Low tokens --> High tokens');
        expect(markdown).toContain('```\n');
    });

    it('plots x from avgElapsedMs and y from totalTokens, labeled by provider + model', () => {
        const a = aggregate({ provider: 'Gemini', model: 'gemini-2.5-flash', avgElapsedMs: 1645, totalTokens: 7999 });
        const { markdown, plotted } = buildElapsedVsTokensChart([a]);
        expect(plotted).toEqual([a]);
        // A single point normalizes to the midpoint (no other point to spread against).
        expect(markdown).toContain('Gemini gemini-2.5-flash: [0.50, 0.50]');
    });

    it('normalizes multiple points into the [0, 1] range required by quadrantChart, min at 0 and max at 1', () => {
        const slow = aggregate({ provider: 'A', model: 'slow', avgElapsedMs: 1000, totalTokens: 1000 });
        const fast = aggregate({ provider: 'A', model: 'fast', avgElapsedMs: 100, totalTokens: 100 });
        const { markdown } = buildElapsedVsTokensChart([slow, fast]);
        expect(markdown).toContain('A slow: [1.00, 1.00]');
        expect(markdown).toContain('A fast: [0.00, 0.00]');
    });

    it('sanitizes a model id containing : and / so it never breaks the Mermaid point-label syntax', () => {
        const a = aggregate({ provider: 'OpenRouter', model: 'openai/gpt-oss-20b:free' });
        const { markdown } = buildElapsedVsTokensChart([a]);
        // The label segment (before the coordinate pair) must carry no raw colon/bracket.
        const line = markdown.split('\n').find(l => l.includes('gpt-oss-20b'));
        expect(line).toBeDefined();
        const labelPart = line?.split(':').slice(0, -1).join(':'); // everything before the final "[x, y]" colon
        expect(labelPart).not.toMatch(/[:[\]]/);
        expect(line).toContain('openai/gpt-oss-20b free'); // slash kept, colon replaced
    });

    it('marks a partial token total with * in the companion table, same convention as formatMetricsMarkdownTable', () => {
        const a = aggregate({ totalTokens: 300, tokensIncomplete: true });
        const { markdown } = buildElapsedVsTokensChart([a]);
        expect(markdown).toContain('300*');
    });

    it('never fabricates a point for an aggregate with totalTokens: null — excludes it, never coerces to 0', () => {
        const withTokens = aggregate({ provider: 'A', model: 'has-tokens', totalTokens: 200 });
        const noTokens = aggregate({ provider: 'B', model: 'no-tokens', totalTokens: null, tokensIncomplete: true });
        const { markdown, plotted, excluded } = buildElapsedVsTokensChart([withTokens, noTokens]);

        expect(plotted).toEqual([withTokens]);
        expect(excluded).toEqual([noTokens]);
        expect(markdown).not.toContain('B no-tokens: [');
        expect(markdown).toContain('excluded from the chart');
        expect(markdown).toContain('B no-tokens');
        expect(markdown).not.toMatch(/no-tokens.*\[0\.00, 0\.00\]/); // never silently plotted at 0
    });

    it('returns an honest empty-state message, not an empty chart, when nothing is plottable', () => {
        const noTokens = aggregate({ totalTokens: null, tokensIncomplete: true });
        const { markdown, plotted } = buildElapsedVsTokensChart([noTokens]);
        expect(plotted).toEqual([]);
        expect(markdown).not.toContain('```mermaid');
        expect(markdown.toLowerCase()).toContain('no plottable');
    });

    it('returns an empty chart-state for an empty input, not an error', () => {
        const { markdown, plotted, excluded } = buildElapsedVsTokensChart([]);
        expect(plotted).toEqual([]);
        expect(excluded).toEqual([]);
        expect(markdown.toLowerCase()).toContain('no plottable');
    });

    it('includes the required interpretation note about lower-left meaning faster/fewer tokens, and its correctness caveat', () => {
        const { markdown } = buildElapsedVsTokensChart([aggregate({})]);
        expect(markdown.toLowerCase()).toContain('lower-left');
        expect(markdown.toLowerCase()).toContain('faster');
        expect(markdown.toLowerCase()).toContain('does not by itself measure correctness');
    });

    it('preserves the exact numeric avgElapsedMs/totalTokens values in the companion table, not just normalized coordinates', () => {
        const a = aggregate({ provider: 'Gemini', model: 'gemini-2.5-pro', avgElapsedMs: 3483.6363636363635, totalTokens: 5893 });
        const { markdown } = buildElapsedVsTokensChart([a]);
        expect(markdown).toContain('3484ms'); // rounded for the table, still the real value
        expect(markdown).toContain('5893');
    });
});

describe('mergeVerificationRecords', () => {
    const geminiRecord = record({ provider: 'Gemini', model: 'gemini-2.5-flash', scenarioId: 'a' });
    const openRouterRecordOld = record({ provider: 'OpenRouter', model: 'openrouter/free', scenarioId: 'a' });
    const previousReport: VerificationMetricsReport = {
        generatedAt: '2026-07-28T08:06:37.524Z',
        costCurrency: 'USD',
        aggregates: aggregateVerificationMetrics([geminiRecord, openRouterRecordOld]),
        records: [geminiRecord, openRouterRecordOld],
    };

    it('carries forward a (provider, model) pair not touched this session, unchanged', () => {
        const newOpenRouterRecord = record({
            provider: 'OpenRouter',
            model: 'openrouter/free',
            scenarioId: 'a',
            elapsedMs: 999,
        });
        const merged = mergeVerificationRecords(previousReport, [newOpenRouterRecord], '2026-07-30T10:00:00.000Z');

        // Gemini wasn't re-run this session — carried forward from the previous report untouched.
        const gemini = merged.find(r => r.provider === 'Gemini');
        expect(gemini?.elapsedMs).toBe(geminiRecord.elapsedMs);
        expect(gemini?.sourceGeneratedAt).toBe('2026-07-28T08:06:37.524Z');
    });

    it('fully replaces a (provider, model) pair that WAS re-run this session — never blends old and new rows for the same pair', () => {
        const newOpenRouterRecord = record({
            provider: 'OpenRouter',
            model: 'openrouter/free',
            scenarioId: 'a',
            elapsedMs: 999,
        });
        const merged = mergeVerificationRecords(previousReport, [newOpenRouterRecord], '2026-07-30T10:00:00.000Z');

        const openRouterRows = merged.filter(r => r.provider === 'OpenRouter' && r.model === 'openrouter/free');
        expect(openRouterRows).toHaveLength(1);
        expect(openRouterRows[0].elapsedMs).toBe(999); // the new row, not the old 500ms one
        expect(openRouterRows[0].sourceGeneratedAt).toBe('2026-07-30T10:00:00.000Z');
    });

    it('tags every record with sourceGeneratedAt so a merge is never silent about which session produced it', () => {
        const merged = mergeVerificationRecords(previousReport, [openRouterRecordOld], '2026-07-30T10:00:00.000Z');
        expect(merged.every(r => typeof r.sourceGeneratedAt === 'string' && r.sourceGeneratedAt.length > 0)).toBe(
            true
        );
    });

    it('adds a genuinely new (provider, model) pair without dropping anything already committed', () => {
        const newAnthropicRecord = record({ provider: 'Claude', model: 'claude-haiku-4-5', scenarioId: 'a' });
        const merged = mergeVerificationRecords(previousReport, [newAnthropicRecord], '2026-07-30T10:00:00.000Z');

        expect(merged).toHaveLength(3);
        expect(merged.some(r => r.provider === 'Gemini')).toBe(true);
        expect(merged.some(r => r.provider === 'OpenRouter')).toBe(true);
        expect(merged.some(r => r.provider === 'Claude')).toBe(true);
    });

    it('with no previous report (first run ever), returns exactly the new records tagged with this session', () => {
        const merged = mergeVerificationRecords(undefined, [openRouterRecordOld], '2026-07-30T10:00:00.000Z');
        expect(merged).toHaveLength(1);
        expect(merged[0].sourceGeneratedAt).toBe('2026-07-30T10:00:00.000Z');
    });
});

describe('distinctSourceSessions', () => {
    it('returns the distinct, sorted set of sourceGeneratedAt values', () => {
        const merged = mergeVerificationRecords(
            {
                generatedAt: '2026-07-28T08:06:37.524Z',
                costCurrency: 'USD',
                aggregates: [],
                records: [record({ provider: 'Gemini', model: 'gemini-2.5-flash' })],
            },
            [record({ provider: 'OpenRouter', model: 'openrouter/free' })],
            '2026-07-30T10:00:00.000Z'
        );
        expect(distinctSourceSessions(merged)).toEqual(['2026-07-28T08:06:37.524Z', '2026-07-30T10:00:00.000Z']);
    });

    it('returns a single-entry array when everything came from one session', () => {
        const merged = mergeVerificationRecords(undefined, [record({})], '2026-07-30T10:00:00.000Z');
        expect(distinctSourceSessions(merged)).toEqual(['2026-07-30T10:00:00.000Z']);
    });
});
