import { describe, expect, it } from 'vitest';

import { createMeter, meteringGateway, price } from './metering';

import type { TokenTotals } from './metering';
import type { Chunk, LlmGateway } from '../../llm/llmGateway';

// Metering is the eval benchmark's efficiency axis (eval-benchmark.md §4.2). These offline tests
// guard every number the benchmark quotes, one responsibility each: the Meter counts (no rates), `price` prices
// (no gateway), and `meteringGateway` taps usage into a shared Meter without touching the stream.

describe('createMeter — provider-neutral token accounting (§3.1)', () => {
    // Three crafted per-call usages, mirroring the §3.1 worked example. `outputTokens` here is the VISIBLE
    // output only (candidatesTokenCount); the Meter must derive output = total − input so thinking counts.
    const usages: NonNullable<Chunk['usage']>[] = [
        { inputTokens: 1050, outputTokens: 15, providerTotalTokens: 1185, cachedInputTokens: 0 }, // total > input + visible → thinking
        { inputTokens: 1125, outputTokens: 25, providerTotalTokens: 1230, cachedInputTokens: 1050 }, // carries a cache hit
        { inputTokens: 1158, outputTokens: 15, providerTotalTokens: 1213, cachedInputTokens: 1125 },
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

    it('falls back to inputTokens + outputTokens for totalTokens when a provider omits providerTotalTokens', () => {
        // Documented fallback (see the comment on line 56): a provider that never reports its own
        // total must not leave totalTokens undefined — it's reconstructed from the two buckets we
        // do have. cachedTokens still sums normally (0, since this usage carries none).
        const meter = createMeter();
        meter.addUsage({ inputTokens: 100, outputTokens: 20 });
        meter.tick();

        const t = meter.totals();
        expect(t.inputTokens).toBe(100);
        expect(t.totalTokens).toBe(120); // 100 + 20 — the fallback path, not providerTotalTokens
        expect(t.outputTokens).toBe(20); // total(120) - input(100) = 20, matches the visible figure here
        expect(t.cachedTokens).toBe(0);
        expect(t.roundTrips).toBe(1);
    });

    it('falls back to inputTokens alone (outputTokens also omitted) when both providerTotalTokens and outputTokens are absent', () => {
        // The fallback expression is `input + (u.outputTokens ?? 0)` — the OUTER providerTotalTokens
        // fallback is only half the story; a provider that omits BOTH must still resolve totalTokens
        // to a defined number (never NaN/undefined) via the INNER ?? 0 on outputTokens too.
        const meter = createMeter();
        meter.addUsage({ inputTokens: 100 });
        meter.tick();

        const t = meter.totals();
        expect(t.inputTokens).toBe(100);
        expect(t.totalTokens).toBe(100); // 100 + 0 — both fallbacks taken
        expect(t.outputTokens).toBe(0); // total(100) - input(100) = 0
        expect(t.roundTrips).toBe(1);
    });

    it("treats a usage object that omits inputTokens as zero input (line 54's own `?? 0` fallback)", () => {
        // The two fallback tests above already exercise `u.providerTotalTokens ?? input + (u.outputTokens
        // ?? 0)` both ways — that branch is fully covered. The one still-uncovered branch is the earlier,
        // separate fallback one line up: `const input = u.inputTokens ?? 0`. No existing test omits
        // inputTokens itself (every usage above always supplies it), so this asserts a provider that
        // reports a total but never reports its own input side still resolves to a defined, non-NaN
        // input of 0 rather than leaving it undefined.
        const meter = createMeter();
        meter.addUsage({ providerTotalTokens: 9 });
        meter.tick();

        const t = meter.totals();
        expect(t.inputTokens).toBe(0); // the ?? 0 fallback on line 54, not undefined/NaN
        expect(t.totalTokens).toBe(9); // providerTotalTokens is present, so line 56's own fallback isn't involved
        expect(t.outputTokens).toBe(9); // total(9) - input(0) = 9
        expect(t.roundTrips).toBe(1);
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
        meter.addUsage({ inputTokens: 10, providerTotalTokens: 30 });
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
        const usage = { inputTokens: 120, outputTokens: 30, providerTotalTokens: 180, cachedInputTokens: 40 };
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
