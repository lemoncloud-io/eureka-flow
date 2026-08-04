import { describe, expect, it } from 'vitest';

import {
    accumulateExtendedUsage,
    accumulateUsage,
    aggregateByActualModel,
    aggregateVerificationMetrics,
    buildElapsedVsTokensChart,
    buildVerificationMetricsReport,
    distinctSourceSessions,
    formatCostRanking,
    formatMetricsMarkdownTable,
    formatTokenDiagnosticsTable,
    formatVerificationRecordsCsv,
    formatVerificationRecordsJsonl,
    mergeVerificationRecords,
    wrapGatewayWithUsageCapture,
} from '../../llm/verificationMetrics';

import type { Chunk, LlmGateway } from '../../llm/llmGateway';
import type { CapturedCallInfo, VerificationMetricsReport, VerificationRunRecord } from '../../llm/verificationMetrics';

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

describe('aggregateByActualModel', () => {
    it('groups a fixed-model provider (no actualModel ever reported) as one aggregate, identified by requested model', () => {
        const records = [
            record({ provider: 'Gemini', model: 'gemini-2.5-flash', scenarioId: 'a' }),
            record({ provider: 'Gemini', model: 'gemini-2.5-flash', scenarioId: 'b' }),
        ];
        const aggregates = aggregateByActualModel(records);
        expect(aggregates).toHaveLength(1);
        expect(aggregates[0].requestedModel).toBe('gemini-2.5-flash');
        expect(aggregates[0].actualModel).toBeUndefined();
        expect(aggregates[0].unresolved).toBe(false);
        expect(aggregates[0].scenarioCount).toBe(2);
    });

    it('requested and actual model can be the same value (a direct, non-routed OpenAI call echoing its own model back)', () => {
        const records = [record({ provider: 'OpenAI', model: 'gpt-4o-mini', actualModel: 'gpt-4o-mini' })];
        const aggregates = aggregateByActualModel(records);
        expect(aggregates).toHaveLength(1);
        expect(aggregates[0].requestedModel).toBe('gpt-4o-mini');
        expect(aggregates[0].actualModel).toBe('gpt-4o-mini');
        expect(aggregates[0].unresolved).toBe(false);
    });

    it('openrouter/free resolves to one named actual model', () => {
        const records = [
            record({ provider: 'OpenRouter', model: 'openrouter/free', actualModel: 'meta-llama/llama-3.3-70b-instruct:free' }),
        ];
        const aggregates = aggregateByActualModel(records);
        expect(aggregates).toHaveLength(1);
        expect(aggregates[0].requestedModel).toBe('openrouter/free');
        expect(aggregates[0].actualModel).toBe('meta-llama/llama-3.3-70b-instruct:free');
        expect(aggregates[0].unresolved).toBe(false);
    });

    it('one route resolving to two different actual models across calls produces two separate aggregates, never combined', () => {
        const records = [
            record({ provider: 'OpenRouter', model: 'openrouter/free', scenarioId: 'a', actualModel: 'model-a', inputTokens: 100, outputTokens: 10 }),
            record({ provider: 'OpenRouter', model: 'openrouter/free', scenarioId: 'b', actualModel: 'model-b', inputTokens: 200, outputTokens: 20 }),
        ];
        const aggregates = aggregateByActualModel(records);
        expect(aggregates).toHaveLength(2);
        const byActual = new Map(aggregates.map(a => [a.actualModel, a]));
        expect(byActual.get('model-a')?.totalTokens).toBe(110);
        expect(byActual.get('model-b')?.totalTokens).toBe(220);
        // Neither aggregate's requestedModel loses the route it came from.
        expect(byActual.get('model-a')?.requestedModel).toBe('openrouter/free');
        expect(byActual.get('model-b')?.requestedModel).toBe('openrouter/free');
    });

    it('a route call with no actualModel, on a route where other calls DID report one, is flagged unresolved — never guessed onto a resolved model', () => {
        const records = [
            record({ provider: 'OpenRouter', model: 'openrouter/free', scenarioId: 'a', actualModel: 'model-a' }),
            record({ provider: 'OpenRouter', model: 'openrouter/free', scenarioId: 'b', actualModel: undefined }),
        ];
        const aggregates = aggregateByActualModel(records);
        expect(aggregates).toHaveLength(2);
        const unresolved = aggregates.find(a => a.unresolved);
        expect(unresolved).toBeDefined();
        expect(unresolved?.actualModel).toBeUndefined();
        expect(unresolved?.requestedModel).toBe('openrouter/free');
        expect(unresolved?.scenarioCount).toBe(1);
        // Never merged into the resolved model's aggregate.
        const resolved = aggregates.find(a => a.actualModel === 'model-a');
        expect(resolved?.scenarioCount).toBe(1);
    });

    it('returns an empty array for an empty input', () => {
        expect(aggregateByActualModel([])).toEqual([]);
    });
});

/** Every four-space-indented `<id>: [x, y]` point line in a Mermaid source string, in source
 * order — deliberately excludes `title`/`x-axis`/`y-axis`/`quadrant-N` lines, which share the same
 * indentation but never contain a coordinate pair. */
const mermaidPointLines = (mermaidSource: string): string[] =>
    mermaidSource.split('\n').filter(l => /^ {4}\S+: \[-?\d/.test(l));

/** Characters that must never appear anywhere in generated Mermaid source or SVG: a carriage
 * return (Windows line ending or a stray `\r`), the Unicode line/paragraph separators (U+2028,
 * U+2029 — invisible in most editors but treated as line breaks by some parsers and not by
 * others, a classic source of "looks fine, parses wrong"), and common zero-width characters
 * (U+200B zero-width space, U+FEFF byte-order-mark/zero-width-no-break-space) that can silently
 * split or merge tokens depending on the exact parser. */
const FORBIDDEN_INVISIBLE_CHARS = /[\r\u2028\u2029\u200B\uFEFF]/;

describe('buildElapsedVsTokensChart', () => {
    it('renders a Mermaid quadrantChart source with the required title and axes, no code fence', () => {
        const { mermaidSource } = buildElapsedVsTokensChart([record({})]);
        expect(mermaidSource).not.toContain('```');
        expect(mermaidSource.startsWith('quadrantChart')).toBe(true);
        expect(mermaidSource).toContain('title Average elapsed time vs. consumed tokens by model');
        expect(mermaidSource).toContain('x-axis Low elapsed --> High elapsed');
        expect(mermaidSource).toContain('y-axis Low tokens --> High tokens');
    });

    it('assigns the single point the deterministic id M01, never a raw provider/model label', () => {
        const r = record({
            provider: 'Gemini',
            model: 'gemini-2.5-flash',
            elapsedMs: 1645,
            inputTokens: 7767,
            outputTokens: 232,
        });
        const { mermaidSource, tableMarkdown, plotted } = buildElapsedVsTokensChart([r]);
        expect(plotted).toHaveLength(1);
        expect(plotted[0].totalTokens).toBe(7999);
        // A single point normalizes to the midpoint (no other point to spread against).
        expect(mermaidSource).toContain('M01: [0.50, 0.50]');
        // The real model id never appears inside the Mermaid source — only in the table.
        expect(mermaidSource).not.toContain('gemini');
        expect(tableMarkdown).toContain('| M01 | Gemini | gemini-2.5-flash |');
    });

    it('normalizes multiple points into the [0, 1] range required by quadrantChart, min at 0 and max at 1, in deterministic M01/M02 order', () => {
        const slow = record({ provider: 'A', model: 'slow', elapsedMs: 1000, inputTokens: 1000, outputTokens: 0 });
        const fast = record({ provider: 'A', model: 'fast', elapsedMs: 100, inputTokens: 100, outputTokens: 0 });
        const { mermaidSource, tableMarkdown } = buildElapsedVsTokensChart([slow, fast]);
        // aggregateByActualModel sorts by (provider, requestedModel) — "fast" < "slow" alphabetically.
        expect(mermaidSource).toContain('M01: [0.00, 0.00]');
        expect(mermaidSource).toContain('M02: [1.00, 1.00]');
        expect(tableMarkdown).toContain('| M01 | A | fast |');
        expect(tableMarkdown).toContain('| M02 | A | slow |');
    });

    it('produces the same point ids, coordinates, and SVG in the same order across repeated calls with the same records', () => {
        const records = [
            record({ provider: 'OpenRouter', model: 'openrouter/free', scenarioId: 'a', actualModel: 'anthropic/claude-haiku-4.5' }),
            record({ provider: 'Gemini', model: 'gemini-2.5-pro', scenarioId: 'b', elapsedMs: 500 }),
        ];
        const first = buildElapsedVsTokensChart(records);
        const second = buildElapsedVsTokensChart(records);
        expect(second.mermaidSource).toBe(first.mermaidSource);
        expect(second.svg).toBe(first.svg);
    });

    it('labels a dynamic route by its actual resolved model in the table, never the requested route, while the chart uses only the opaque id', () => {
        const r = record({ provider: 'OpenRouter', model: 'openrouter/free', actualModel: 'openai/gpt-oss-20b:free' });
        const { mermaidSource, tableMarkdown } = buildElapsedVsTokensChart([r]);
        expect(mermaidPointLines(mermaidSource)).toEqual(['    M01: [0.50, 0.50]']);
        expect(tableMarkdown).toContain('| M01 | OpenRouter | openrouter/free | openai/gpt-oss-20b:free |');
        expect(mermaidSource).not.toContain('gpt-oss');
    });

    it('gives a route resolving to two different actual models two separate points, never one averaged point', () => {
        const a = record({ provider: 'OpenRouter', model: 'openrouter/free', scenarioId: 'a', actualModel: 'model-a', inputTokens: 100, outputTokens: 0, elapsedMs: 100 });
        const b = record({ provider: 'OpenRouter', model: 'openrouter/free', scenarioId: 'b', actualModel: 'model-b', inputTokens: 900, outputTokens: 0, elapsedMs: 900 });
        const { mermaidSource, tableMarkdown, plotted } = buildElapsedVsTokensChart([a, b]);
        expect(plotted).toHaveLength(2);
        expect(mermaidSource).toContain('M01: [0.00, 0.00]');
        expect(mermaidSource).toContain('M02: [1.00, 1.00]');
        expect(tableMarkdown).toContain('| M01 | OpenRouter | openrouter/free | model-a |');
        expect(tableMarkdown).toContain('| M02 | OpenRouter | openrouter/free | model-b |');
    });

    it('labels an unresolved route call explicitly in the table — never guesses it onto a resolved model — while the chart stays a plain opaque id', () => {
        const resolved = record({ provider: 'OpenRouter', model: 'openrouter/free', scenarioId: 'a', actualModel: 'model-a' });
        const unresolvedCall = record({ provider: 'OpenRouter', model: 'openrouter/free', scenarioId: 'b', actualModel: undefined });
        const { mermaidSource, tableMarkdown, plotted } = buildElapsedVsTokensChart([resolved, unresolvedCall]);
        expect(plotted).toHaveLength(2);
        expect(mermaidPointLines(mermaidSource)).toHaveLength(2);
        expect(tableMarkdown).toContain('| OpenRouter | openrouter/free | unresolved |');
        expect(mermaidSource).not.toContain('unresolved');
    });

    it('the companion table preserves the requested route in its own column even when the Point column carries the opaque id', () => {
        const r = record({ provider: 'OpenRouter', model: 'openrouter/free', actualModel: 'model-a' });
        const { tableMarkdown } = buildElapsedVsTokensChart([r]);
        expect(tableMarkdown).toContain('| M01 | OpenRouter | openrouter/free | model-a |');
    });

    it('plots openrouter/free itself (no actual model resolved) behind an opaque id, exact route preserved in the table', () => {
        const r = record({ provider: 'OpenRouter', model: 'openrouter/free' });
        const { mermaidSource, tableMarkdown } = buildElapsedVsTokensChart([r]);
        expect(mermaidPointLines(mermaidSource)).toEqual(['    M01: [0.50, 0.50]']);
        expect(tableMarkdown).toContain('| M01 | OpenRouter | openrouter/free |');
    });

    it('regression: every model id from the original quadrantChart lexical-failure report gets a clean opaque point and an unchanged table row', () => {
        // Exact identifiers reported to break the old character-sanitizing approach — every one of
        // them a real, currently-registered or provider-reported OpenRouter identifier. Each gets a
        // distinct elapsedMs/token value so a point can be uniquely traced back to its source record
        // without depending on (or asserting) any particular sort order.
        const ACTUAL_MODELS = [
            'anthropic/claude-haiku-4.5',
            'openai/gpt-oss-20b:free',
            'google/gemma-4-26b-a4b-it:free',
            'nvidia/nemotron-3-ultra-550b-a55b:free',
            'nvidia/nemotron-nano-9b-v2:free',
        ];
        const records = [
            ...ACTUAL_MODELS.map((actualModel, i) =>
                record({
                    provider: 'OpenRouter',
                    model: 'openrouter/free',
                    scenarioId: `scenario-${i}`,
                    actualModel,
                    elapsedMs: (i + 1) * 100,
                    inputTokens: (i + 1) * 100,
                    outputTokens: 0,
                })
            ),
            record({
                provider: 'OpenRouter',
                model: 'openrouter/free',
                scenarioId: 'scenario-unresolved',
                actualModel: undefined,
                elapsedMs: 600,
                inputTokens: 600,
                outputTokens: 0,
            }),
        ];
        const { mermaidSource, tableMarkdown, plotted } = buildElapsedVsTokensChart(records);

        // (b) number of Mermaid point lines equals number of plotted aggregates.
        expect(plotted).toHaveLength(6);
        const pointLines = mermaidPointLines(mermaidSource);
        expect(pointLines).toHaveLength(6);

        // (a)/(f)/(g): every point line matches a strict safe pattern — one opaque `M<digits>` id,
        // one coordinate pair, nothing else; each line is its own newline-delimited entry (verified
        // by the fact that `mermaidPointLines` split on '\n' found exactly 6 discrete matches, not
        // one giant run-on match or fewer-than-expected lines from swallowed concatenation). No raw
        // slash/colon/bracket/paren/whitespace inside any point identifier itself (the portion
        // before the coordinate pair) — checked on the id token in isolation, not the whole line
        // (which legitimately contains `[`, `]`, `,`, and a space as coordinate syntax).
        const SAFE_POINT_LINE = /^ {4}M\d+: \[\d\.\d\d, \d\.\d\d\]$/;
        const usedIds = new Set<string>();
        for (const line of pointLines) {
            expect(line).toMatch(SAFE_POINT_LINE);
            const id = line.trim().split(':')[0];
            expect(id).toMatch(/^M[0-9]+$/);
            expect(id).not.toMatch(/[/:[\]() \t]/);
            usedIds.add(id);
        }
        expect(usedIds.size).toBe(6); // every point got its own distinct id — none reused

        // Parse the companion table's Point/Actual-model columns so each id can be traced back to
        // its source record without assuming a particular sort order.
        const tableRowById = new Map<string, string>();
        for (const line of tableMarkdown.split('\n')) {
            const cells = line.split('|').map(c => c.trim());
            if (cells.length >= 5 && /^M[0-9]+$/.test(cells[1])) {
                tableRowById.set(cells[1], cells[4]); // [ '', Point, Provider, Requested, Actual, ... ]
            }
        }

        // (c) each short point id used in the chart also appears as a table row.
        for (const id of usedIds) {
            expect(tableRowById.has(id)).toBe(true);
        }
        // (d) exact canonical actual-model ids — slash, dot, colon, `:free` suffix all intact —
        // remain unchanged in the table; every one of the 5 real ids plus the literal "unresolved"
        // label is present exactly once.
        const tableActualModels = Array.from(tableRowById.values()).sort();
        expect(tableActualModels).toEqual([...ACTUAL_MODELS, 'unresolved'].sort());

        // (e) the dynamic openrouter/free route produced separate points per distinct actual model
        // — never one averaged/merged point — plus one more for the unresolved call.
        expect(tableRowById.size).toBe(ACTUAL_MODELS.length + 1);

        // None of the raw identifiers — slashes, dots, colons — leak into the Mermaid source itself.
        for (const actualModel of ACTUAL_MODELS) {
            expect(mermaidSource).not.toContain(actualModel);
        }
        expect(mermaidSource).not.toMatch(/[/]/);
    });

    it('unresolved labels containing parentheses never reach the Mermaid source — only the opaque id does', () => {
        const resolved = record({ provider: 'OpenRouter', model: 'openrouter/free', scenarioId: 'a', actualModel: 'model-a' });
        const unresolvedCall = record({ provider: 'OpenRouter', model: 'openrouter/free', scenarioId: 'b', actualModel: undefined });
        const { mermaidSource, tableMarkdown } = buildElapsedVsTokensChart([resolved, unresolvedCall]);
        expect(mermaidSource).not.toMatch(/[()]/);
        expect(tableMarkdown).toContain('unresolved'); // still present, in the table only
    });

    it('marks a partial token total with * in the companion table, same convention as formatMetricsMarkdownTable', () => {
        const r = record({ inputTokens: 300, outputTokens: null });
        const { tableMarkdown } = buildElapsedVsTokensChart([r]);
        expect(tableMarkdown).toContain('300*');
    });

    it('never fabricates a point for a group with no token usage at all — excludes it, never coerces to 0', () => {
        const withTokens = record({ provider: 'A', model: 'has-tokens', inputTokens: 200, outputTokens: 0 });
        const noTokens = record({ provider: 'B', model: 'no-tokens', inputTokens: null, outputTokens: null });
        const { mermaidSource, tableMarkdown, plotted, excluded } = buildElapsedVsTokensChart([withTokens, noTokens]);

        expect(plotted).toHaveLength(1);
        expect(plotted[0].requestedModel).toBe('has-tokens');
        expect(excluded).toHaveLength(1);
        expect(excluded[0].requestedModel).toBe('no-tokens');
        expect(mermaidSource).not.toContain('B no-tokens: [');
        expect(tableMarkdown).toContain('excluded from the chart');
        expect(tableMarkdown).toContain('B no-tokens');
        expect(mermaidSource).not.toMatch(/no-tokens.*\[0\.00, 0\.00\]/); // never silently plotted at 0
    });

    it('returns an honest empty-state message, not an empty chart, when nothing is plottable', () => {
        const noTokens = record({ inputTokens: null, outputTokens: null });
        const { mermaidSource, svg, tableMarkdown, plotted } = buildElapsedVsTokensChart([noTokens]);
        expect(plotted).toEqual([]);
        expect(mermaidSource).toBe('');
        expect(svg).toBe('');
        expect(tableMarkdown.toLowerCase()).toContain('no plottable');
    });

    it('returns an empty chart-state for an empty input, not an error', () => {
        const { mermaidSource, svg, tableMarkdown, plotted, excluded } = buildElapsedVsTokensChart([]);
        expect(plotted).toEqual([]);
        expect(excluded).toEqual([]);
        expect(mermaidSource).toBe('');
        expect(svg).toBe('');
        expect(tableMarkdown.toLowerCase()).toContain('no plottable');
    });

    it('includes the required interpretation note about lower-left meaning faster/fewer tokens, and its correctness caveat', () => {
        const { tableMarkdown } = buildElapsedVsTokensChart([record({})]);
        expect(tableMarkdown.toLowerCase()).toContain('lower-left');
        expect(tableMarkdown.toLowerCase()).toContain('faster');
        expect(tableMarkdown.toLowerCase()).toContain('does not by itself measure correctness');
    });

    it('preserves the exact numeric avgElapsedMs/totalTokens values in the companion table, not just normalized coordinates', () => {
        const r = record({
            provider: 'Gemini',
            model: 'gemini-2.5-pro',
            elapsedMs: 3483.6363636363635,
            inputTokens: 5656,
            outputTokens: 237,
        });
        const { tableMarkdown } = buildElapsedVsTokensChart([r]);
        expect(tableMarkdown).toContain('3484ms'); // rounded for the table, still the real value
        expect(tableMarkdown).toContain('5893');
    });

    describe('point-line newline separation (regression: VS Code "two lines read as one" failure)', () => {
        // Reproduces the exact shape of the reported failure — 20 points, so point ids reach two
        // digits on both sides of a round number (M09/M10/M11/M20), the same boundary the bug
        // report named specifically.
        const twentyPointRecords = Array.from({ length: 20 }, (_, i) =>
            record({
                provider: 'OpenRouter',
                model: 'openrouter/free',
                scenarioId: `s${i}`,
                actualModel: `vendor/model-${i}:free`,
                elapsedMs: (i + 1) * 10,
                inputTokens: (i + 1) * 10,
                outputTokens: 0,
            })
        );

        it('produces exactly one point per plotted aggregate, each its own literal-\\n-delimited line', () => {
            const { mermaidSource, plotted } = buildElapsedVsTokensChart(twentyPointRecords);
            expect(plotted).toHaveLength(20);

            // Splitting on the literal newline character must yield exactly one point line per
            // plotted aggregate — if two points were ever concatenated without a separating '\n',
            // split('\n') would find fewer lines than plotted aggregates, exactly as the bug
            // report's "M10: [...]    M11: [...]" symptom describes.
            const lines = mermaidPointLines(mermaidSource);
            expect(lines).toHaveLength(20);
            expect(new Set(lines).size).toBe(20); // no duplicate/merged line text either

            // The specific boundary named in the bug report: M10 and M11 must be two distinct
            // array entries, not one string containing both.
            const m10 = lines.find(l => l.startsWith('    M10:'));
            const m11 = lines.find(l => l.startsWith('    M11:'));
            expect(m10).toBeDefined();
            expect(m11).toBeDefined();
            expect(m10).not.toContain('M11');
            expect(m11).not.toContain('M10');
        });

        it('contains no carriage return, Unicode line/paragraph separator, or zero-width character anywhere in the Mermaid source', () => {
            const { mermaidSource } = buildElapsedVsTokensChart(twentyPointRecords);
            expect(mermaidSource).not.toMatch(FORBIDDEN_INVISIBLE_CHARS);
            // Confirms line count via '\n' matches the visual line count exactly — i.e. every
            // line break in this string really is the literal '\n' character, not some other
            // Unicode separator that a naive visual read (or a lenient parser) might also treat
            // as a break while a stricter one (VS Code's Mermaid extension) does not.
            expect(mermaidSource.split('\n')).toHaveLength(mermaidSource.split(/\r\n|\r|\n/).length);
        });

        it('the rendered SVG also contains no carriage return, Unicode separator, or zero-width character', () => {
            const { svg } = buildElapsedVsTokensChart(twentyPointRecords);
            expect(svg).not.toMatch(FORBIDDEN_INVISIBLE_CHARS);
        });
    });
});

describe('buildElapsedVsTokensChart — SVG output', () => {
    it('renders a well-formed SVG document with the correct point count and no raw model text', () => {
        const records = [
            record({ provider: 'Gemini', model: 'gemini-2.5-flash', scenarioId: 'a', elapsedMs: 500, inputTokens: 100, outputTokens: 0 }),
            record({ provider: 'OpenRouter', model: 'openrouter/free', scenarioId: 'b', actualModel: 'anthropic/claude-haiku-4.5', elapsedMs: 900, inputTokens: 300, outputTokens: 0 }),
        ];
        const { svg, plotted } = buildElapsedVsTokensChart(records);
        expect(svg.startsWith('<svg')).toBe(true);
        expect(svg.trim().endsWith('</svg>')).toBe(true);
        expect(svg).toContain('<circle');
        expect((svg.match(/<circle/g) ?? [])).toHaveLength(plotted.length);
        expect(svg).toContain('>M01<');
        expect(svg).toContain('>M02<');
        expect(svg).not.toContain('gemini-2.5-flash');
        expect(svg).not.toContain('anthropic/claude-haiku-4.5');
        expect(svg).not.toContain('openrouter/free');
    });

    it('is empty when nothing is plottable, same as mermaidSource', () => {
        const { svg } = buildElapsedVsTokensChart([record({ inputTokens: null, outputTokens: null })]);
        expect(svg).toBe('');
    });

    it('produces the same point ids/order as mermaidSource — the two representations cannot diverge because both come from the same points array', () => {
        const records = [
            record({ provider: 'A', model: 'slow', scenarioId: 'a', elapsedMs: 1000, inputTokens: 1000, outputTokens: 0 }),
            record({ provider: 'A', model: 'fast', scenarioId: 'b', elapsedMs: 100, inputTokens: 100, outputTokens: 0 }),
        ];
        const { mermaidSource, svg } = buildElapsedVsTokensChart(records);
        const idsInMermaid = mermaidPointLines(mermaidSource).map(l => l.trim().split(':')[0]);
        const idsInSvg = Array.from(svg.matchAll(/>(M\d+)</g)).map(m => m[1]);
        expect(idsInSvg).toEqual(idsInMermaid);
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

describe('formatVerificationRecordsCsv', () => {
    it('returns just a header row for an empty record set', () => {
        const csv = formatVerificationRecordsCsv([]);
        expect(csv.split('\n')).toHaveLength(1);
        expect(csv).toContain('provider,model,actualModel,scenarioId,outcome');
    });

    it('emits one data row per record, preserving canonical model ids exactly', () => {
        const csv = formatVerificationRecordsCsv([
            record({ provider: 'OpenRouter', model: 'openrouter/free', actualModel: 'meta-llama/llama-3.3-70b-instruct:free' }),
        ]);
        const rows = csv.split('\n');
        expect(rows).toHaveLength(2);
        expect(rows[1]).toContain('openrouter/free');
        expect(rows[1]).toContain('meta-llama/llama-3.3-70b-instruct:free');
    });

    it('never sanitizes slashes, colons, or parentheses — only the Mermaid label does that', () => {
        const csv = formatVerificationRecordsCsv([record({ model: 'openai/gpt-oss-20b:free (preview)' })]);
        expect(csv).toContain('openai/gpt-oss-20b:free (preview)');
    });

    it('emits an empty cell (never a fabricated 0) for a missing optional usage field', () => {
        const csv = formatVerificationRecordsCsv([record({ inputTokens: null, outputTokens: null, reasoningTokens: undefined })]);
        const [header, row] = csv.split('\n');
        const cols = header.split(',');
        const cells = row.split(',');
        expect(cells[cols.indexOf('inputTokens')]).toBe('');
        expect(cells[cols.indexOf('reasoningTokens')]).toBe('');
    });

    it('quote-escapes a field containing a comma', () => {
        const csv = formatVerificationRecordsCsv([record({ scenarioId: 'a, b' })]);
        expect(csv).toContain('"a, b"');
    });
});

describe('formatVerificationRecordsJsonl', () => {
    it('returns an empty string for an empty record set', () => {
        expect(formatVerificationRecordsJsonl([])).toBe('');
    });

    it('emits exactly one JSON line per record, each parseable independently', () => {
        const records = [
            record({ scenarioId: 'move-node-right' }),
            record({ scenarioId: 'move-node-left', model: 'openrouter/free', actualModel: 'model-a' }),
        ];
        const jsonl = formatVerificationRecordsJsonl(records);
        const lines = jsonl.split('\n');
        expect(lines).toHaveLength(2);
        expect(JSON.parse(lines[0])).toEqual(records[0]);
        expect(JSON.parse(lines[1])).toEqual(records[1]);
    });
});
