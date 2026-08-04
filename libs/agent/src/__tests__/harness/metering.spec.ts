import { describe, expect, it } from 'vitest';

import { createMeter, meteringGateway, price } from './metering';

import type { TokenTotals } from './metering';
import type { Chunk, LlmGateway } from '../../llm/llmGateway';

// Metering is the eval benchmark's efficiency axis (eval-benchmark-cost-time.md §3, §5.1). These offline tests
// guard every number the benchmark quotes, one responsibility each: the Meter counts (no rates), `price` prices
// (no gateway), and `meteringGateway` taps usage into a shared Meter without touching the stream.

describe('createMeter — provider-neutral token accounting (§3.1)', () => {
    // Three crafted per-call usages, mirroring the §3.1 worked example. `outputTokens` here is the VISIBLE
    // output only (candidatesTokenCount); the Meter must derive output = total − input so thinking counts.
    const usages: NonNullable<Chunk['usage']>[] = [
        { inputTokens: 1050, outputTokens: 15, totalTokens: 1185, cachedTokens: 0 }, // total > input + visible → thinking
        { inputTokens: 1125, outputTokens: 25, totalTokens: 1230, cachedTokens: 1050 }, // carries a cache hit
        { inputTokens: 1158, outputTokens: 15, totalTokens: 1213, cachedTokens: 1125 },
    ];

    it('sums input/cached/total, derives output as Σ(total − input), and counts one round-trip per call', () => {
        const meter = createMeter();
        for (const u of usages) {
            meter.addUsage(u); // one usage per call…
            meter.tick(); // …then count the call
        }

        const t = meter.totals();
        expect(t.inputTokens).toBe(1050 + 1125 + 1158); // 3333 — re-sent history included
        expect(t.cachedTokens).toBe(0 + 1050 + 1125); // 2175
        expect(t.totalTokens).toBe(1185 + 1230 + 1213); // 3628 — the ground-truth axis

        // Output is Σ(total − input) = 135 + 105 + 55 = 295 (thinking IS counted)…
        expect(t.outputTokens).toBe(295);
        // …and is emphatically NOT the sum of the visible outputTokens fields (15 + 25 + 15 = 55).
        expect(t.outputTokens).not.toBe(15 + 25 + 15);

        expect(t.roundTrips).toBe(usages.length); // K = 3
    });

    it('ignores a falsy usage and leaves round-trips to tick()', () => {
        const meter = createMeter();
        meter.addUsage(undefined);
        expect(meter.totals()).toEqual({
            inputTokens: 0,
            cachedTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            roundTrips: 0,
        });
    });

    it('totals() returns a fresh copy each call (no shared mutable state)', () => {
        const meter = createMeter();
        const before = meter.totals();
        meter.addUsage({ inputTokens: 10, totalTokens: 30 });
        expect(before.inputTokens).toBe(0); // the earlier snapshot is untouched
        expect(meter.totals().inputTokens).toBe(10);
    });
});

describe('price — the single pricing seam over PRICES (§2)', () => {
    it('prices a known TokenTotals: usdList cache-blind, usdEffective cached-discounted', () => {
        const totals: TokenTotals = {
            inputTokens: 1000,
            cachedTokens: 800,
            outputTokens: 200,
            totalTokens: 1200,
            roundTrips: 3,
        };

        // Rates (gemini-2.5-flash): in 0.30/M, out 2.50/M, cached 0.03/M (a 90% discount on input).
        // list      = (1000·0.30 + 200·2.50) / 1e6                 = 800   / 1e6
        // effective = (200·0.30 + 800·0.03 + 200·2.50) / 1e6       = 584   / 1e6  (200 non-cached input)
        const { usdList, usdEffective } = price(totals, 'gemini-2.5-flash');
        expect(usdList).toBeCloseTo(0.0008, 10);
        expect(usdEffective).toBeCloseTo(0.000584, 10);
        expect(usdEffective).toBeLessThan(usdList); // caching only ever discounts
    });

    it('an unlisted model falls back to the flash rates rather than crashing (tokens stay the truth)', () => {
        const totals: TokenTotals = {
            inputTokens: 1000,
            cachedTokens: 800,
            outputTokens: 200,
            totalTokens: 1200,
            roundTrips: 3,
        };
        // Deliberate, documented fallback: an unknown/mistyped model reuses gemini-2.5-flash rates.
        expect(price(totals, 'some-unlisted-model')).toEqual(price(totals, 'gemini-2.5-flash'));
    });
});

describe('meteringGateway — thin usage tap over one LlmGateway (§3.2)', () => {
    it('counts one round-trip and captures the done-chunk usage exactly once', async () => {
        const usage = { inputTokens: 120, outputTokens: 30, totalTokens: 180, cachedTokens: 40 };
        // A fake inner gateway: a text chunk (no usage), then the final done chunk carrying usage.
        const inner: LlmGateway = {
            capabilities: { toolCalls: true },
            async *chat(): AsyncIterable<Chunk> {
                yield { text: 'hello' };
                yield { done: true, usage };
            },
        };

        const meter = createMeter();
        const gateway = meteringGateway(inner, meter);

        const chunks: Chunk[] = [];
        for await (const chunk of gateway.chat({ messages: [], tools: [] })) chunks.push(chunk);

        // Chunks pass through unchanged (pure observer).
        expect(chunks).toEqual([{ text: 'hello' }, { done: true, usage }]);

        // Capabilities are forwarded from the inner gateway.
        expect(gateway.capabilities).toBe(inner.capabilities);

        // Usage added once (input === the single call's input, not doubled), one round-trip.
        const t = meter.totals();
        expect(t.roundTrips).toBe(1);
        expect(t.inputTokens).toBe(120);
        expect(t.cachedTokens).toBe(40);
        expect(t.totalTokens).toBe(180);
        expect(t.outputTokens).toBe(180 - 120); // derived
    });
});
