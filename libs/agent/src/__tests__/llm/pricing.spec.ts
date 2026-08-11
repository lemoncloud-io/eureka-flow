import { describe, expect, it } from 'vitest';

import { PRICING_CONFIG_VERSION, estimateCost, getModelPricing } from '../../llm/pricing';
import { PROVIDER_REGISTRY } from '../../llm/providerRegistry';

import type { UsageInfo } from '../../llm/llmGateway';

describe('PRICING_CONFIG_VERSION', () => {
    it('is a non-empty version string', () => {
        expect(typeof PRICING_CONFIG_VERSION).toBe('string');
        expect(PRICING_CONFIG_VERSION.length).toBeGreaterThan(0);
    });
});

describe('pricing table identifiers stay in sync with providerRegistry.ts', () => {
    // A typo'd model id in pricing.ts (e.g. a trailing space, a missing hyphen) would silently
    // make getModelPricing return null forever for that model — the same as "unregistered" — with
    // no error anywhere. This locks the two files' identifiers together so that drift breaks the
    // test suite immediately instead of silently degrading every estimate for a real model.
    const PRICED_PROVIDER_IDS = ['openai', 'gemini', 'anthropic'];

    for (const entry of PROVIDER_REGISTRY) {
        if (!PRICED_PROVIDER_IDS.includes(entry.providerId)) continue;

        for (const model of entry.models) {
            it(`${entry.providerId}/${model} (from providerRegistry.ts) has a pricing.ts entry with the exact same identifier`, () => {
                expect(getModelPricing(entry.providerId, model)).not.toBeNull();
            });
        }
    }
});

describe('getModelPricing', () => {
    it('returns a pricing entry for a registered provider/model', () => {
        const pricing = getModelPricing('gemini', 'gemini-2.5-flash');
        expect(pricing).not.toBeNull();
        expect(pricing?.inputPerMillion).toBeGreaterThan(0);
        expect(pricing?.outputPerMillion).toBeGreaterThan(0);
    });

    it('returns null for an unregistered model — never a fabricated default', () => {
        expect(getModelPricing('gemini', 'gemini-does-not-exist')).toBeNull();
    });

    it('returns null for an unregistered provider', () => {
        expect(getModelPricing('does-not-exist', 'gemini-2.5-flash')).toBeNull();
    });

    it('never registers OpenRouter locally — provider-reported cost is preferred instead', () => {
        expect(getModelPricing('openrouter', 'openrouter/free')).toBeNull();
        expect(getModelPricing('openrouter', 'openai/gpt-4o-mini')).toBeNull();
    });
});

describe('estimateCost', () => {
    it('returns null, not 0, for an unregistered model', () => {
        expect(estimateCost('gemini', 'gemini-does-not-exist', { inputTokens: 1000, outputTokens: 500 })).toBeNull();
    });

    it('returns null, not 0, when usage has no token counts at all', () => {
        expect(estimateCost('gemini', 'gemini-2.5-flash', {})).toBeNull();
    });

    it('computes a plain input+output estimate with no caching involved', () => {
        const pricing = getModelPricing('gemini', 'gemini-2.5-flash');
        if (!pricing) throw new Error('expected gemini-2.5-flash to be priced');
        const usage: UsageInfo = { inputTokens: 1_000_000, outputTokens: 1_000_000 };
        const cost = estimateCost('gemini', 'gemini-2.5-flash', usage);
        expect(cost).toBeCloseTo(pricing.inputPerMillion + pricing.outputPerMillion, 10);
    });

    it('prices cachedInputTokens at the cached rate, separately from inputTokens at the standard rate', () => {
        const pricing = getModelPricing('gemini', 'gemini-2.5-flash');
        if (!pricing?.cachedInputPerMillion) throw new Error('expected a cached rate for gemini-2.5-flash');
        const usage: UsageInfo = { inputTokens: 1_000_000, cachedInputTokens: 1_000_000 };
        const cost = estimateCost('gemini', 'gemini-2.5-flash', usage);
        expect(cost).toBeCloseTo(pricing.inputPerMillion + pricing.cachedInputPerMillion, 10);
        // Sanity: the cached rate must actually be a discount, or this test would pass by accident.
        expect(pricing.cachedInputPerMillion).toBeLessThan(pricing.inputPerMillion);
    });

    it('prices cacheWriteInputTokens at the 5m cache-write rate when cacheWriteTtl is "5m"', () => {
        const pricing = getModelPricing('anthropic', 'claude-haiku-4-5');
        if (!pricing?.cacheWritePerMillion) throw new Error('expected a cache-write rate for claude-haiku-4-5');
        const usage: UsageInfo = { inputTokens: 1_000_000, cacheWriteInputTokens: 1_000_000, cacheWriteTtl: '5m' };
        const cost = estimateCost('anthropic', 'claude-haiku-4-5', usage);
        expect(cost).toBeCloseTo(pricing.inputPerMillion + pricing.cacheWritePerMillion, 10);
    });

    it('prices cacheWriteInputTokens at the 1h cache-write rate when cacheWriteTtl is "1h" — a genuinely different rate from 5m', () => {
        const pricing = getModelPricing('anthropic', 'claude-haiku-4-5');
        if (!pricing?.cacheWrite1hPerMillion) throw new Error('expected a 1h cache-write rate for claude-haiku-4-5');
        const usage: UsageInfo = { inputTokens: 1_000_000, cacheWriteInputTokens: 1_000_000, cacheWriteTtl: '1h' };
        const cost = estimateCost('anthropic', 'claude-haiku-4-5', usage);
        expect(cost).toBeCloseTo(pricing.inputPerMillion + pricing.cacheWrite1hPerMillion, 10);
    });

    it('returns null for cacheWriteInputTokens with cacheWriteTtl "unknown" — never guesses which rate applies', () => {
        const usage: UsageInfo = { inputTokens: 1_000_000, cacheWriteInputTokens: 1_000_000, cacheWriteTtl: 'unknown' };
        expect(estimateCost('anthropic', 'claude-haiku-4-5', usage)).toBeNull();
    });

    it('returns null for nonzero cacheWriteInputTokens with no cacheWriteTtl at all — same as "unknown"', () => {
        const usage: UsageInfo = { inputTokens: 1_000_000, cacheWriteInputTokens: 1_000_000 };
        expect(estimateCost('anthropic', 'claude-haiku-4-5', usage)).toBeNull();
    });

    it('does not let cacheWriteInputTokens: 0 block estimation, TTL or no TTL', () => {
        const usage: UsageInfo = { inputTokens: 1_000_000, cacheWriteInputTokens: 0 };
        expect(estimateCost('anthropic', 'claude-haiku-4-5', usage)).not.toBeNull();
    });

    it('returns null when a nonzero bucket has no configured rate, rather than silently dropping it', () => {
        // gemini has no cacheWritePerMillion configured at all — a nonzero cacheWriteInputTokens
        // must not be silently ignored (which would under-report a real cost as smaller than it is).
        const usage: UsageInfo = { inputTokens: 1000, cacheWriteInputTokens: 500 };
        expect(estimateCost('gemini', 'gemini-2.5-flash', usage)).toBeNull();
    });

    it('does not fail on a bucket with 0 tokens even without a configured rate for it', () => {
        const usage: UsageInfo = { inputTokens: 1000, cacheWriteInputTokens: 0 };
        expect(estimateCost('gemini', 'gemini-2.5-flash', usage)).not.toBeNull();
    });

    it('produces a real, non-null 0 only via explicitly-configured rates applied to 0 tokens — never via a missing rate', () => {
        const pricing = getModelPricing('gemini', 'gemini-2.5-flash');
        if (!pricing) throw new Error('expected gemini-2.5-flash to be priced');
        // Every rate this model has IS configured (inputPerMillion, cachedInputPerMillion,
        // outputPerMillion are all real numbers) — 0 tokens against real rates legitimately sums
        // to 0, and that 0 must be returned as a genuine number, not conflated with "unknown".
        const usage: UsageInfo = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
        const cost = estimateCost('gemini', 'gemini-2.5-flash', usage);
        expect(cost).toBe(0);
        expect(cost).not.toBeNull();

        // The contrast case: a registered model, but a bucket with real (nonzero) tokens and NO
        // configured rate — this must stay null, never silently collapse to the same 0 as above.
        const ambiguous = estimateCost('gemini', 'gemini-2.5-flash', { inputTokens: 0, cacheWriteInputTokens: 500 });
        expect(ambiguous).toBeNull();
    });

    it('bills reasoningTokens at the output rate when no explicit reasoningPerMillion is configured', () => {
        const pricing = getModelPricing('openai', 'gpt-4o-mini');
        if (!pricing) throw new Error('expected gpt-4o-mini to be priced');
        expect(pricing.reasoningPerMillion).toBeUndefined();
        const withReasoning = estimateCost('openai', 'gpt-4o-mini', { reasoningTokens: 1_000_000 });
        expect(withReasoning).toBeCloseTo(pricing.outputPerMillion, 10);
    });

    it('bills toolUseInputTokens at the standard input rate', () => {
        const pricing = getModelPricing('gemini', 'gemini-2.5-flash');
        if (!pricing) throw new Error('expected gemini-2.5-flash to be priced');
        const cost = estimateCost('gemini', 'gemini-2.5-flash', { toolUseInputTokens: 1_000_000 });
        expect(cost).toBeCloseTo(pricing.inputPerMillion, 10);
    });

    it('sums every populated bucket into one total', () => {
        const pricing = getModelPricing('gemini', 'gemini-2.5-flash');
        if (!pricing?.cachedInputPerMillion) throw new Error('expected gemini-2.5-flash pricing with a cached rate');
        const usage: UsageInfo = {
            inputTokens: 500_000,
            cachedInputTokens: 200_000,
            outputTokens: 100_000,
            reasoningTokens: 50_000,
            toolUseInputTokens: 10_000,
        };
        const expected =
            (500_000 / 1_000_000) * pricing.inputPerMillion +
            (200_000 / 1_000_000) * pricing.cachedInputPerMillion +
            (100_000 / 1_000_000) * pricing.outputPerMillion +
            (50_000 / 1_000_000) * pricing.outputPerMillion +
            (10_000 / 1_000_000) * pricing.inputPerMillion;
        expect(estimateCost('gemini', 'gemini-2.5-flash', usage)).toBeCloseTo(expected, 10);
    });

    it('never mutates the pricing table between calls (pure function)', () => {
        const before = getModelPricing('gemini', 'gemini-2.5-flash');
        estimateCost('gemini', 'gemini-2.5-flash', { inputTokens: 999_999_999, outputTokens: 999_999_999 });
        const after = getModelPricing('gemini', 'gemini-2.5-flash');
        expect(after).toEqual(before);
    });

    it('returns null for a call whose prompt size crosses a configured long-context threshold, rather than silently applying the wrong tier', () => {
        const pricing = getModelPricing('gemini', 'gemini-2.5-pro');
        if (!pricing?.longContextThresholdTokens)
            {throw new Error('expected gemini-2.5-pro to have a long-context threshold');}

        const atThreshold = estimateCost('gemini', 'gemini-2.5-pro', {
            inputTokens: pricing.longContextThresholdTokens,
            outputTokens: 100,
        });
        expect(atThreshold).not.toBeNull(); // exactly at the threshold still uses the modeled tier

        const overThreshold = estimateCost('gemini', 'gemini-2.5-pro', {
            inputTokens: pricing.longContextThresholdTokens + 1,
            outputTokens: 100,
        });
        expect(overThreshold).toBeNull();
    });

    it('counts cachedInputTokens toward the long-context threshold, since it is still prompt size', () => {
        const pricing = getModelPricing('gemini', 'gemini-2.5-pro');
        if (!pricing?.longContextThresholdTokens)
            {throw new Error('expected gemini-2.5-pro to have a long-context threshold');}

        const cost = estimateCost('gemini', 'gemini-2.5-pro', {
            inputTokens: pricing.longContextThresholdTokens - 100,
            cachedInputTokens: 200, // pushes total prompt size over the threshold
            outputTokens: 100,
        });
        expect(cost).toBeNull();
    });

    it('treats a completely absent inputTokens as 0 when checking the long-context threshold — cachedInputTokens alone can still trip it', () => {
        const pricing = getModelPricing('gemini', 'gemini-2.5-pro');
        if (!pricing?.longContextThresholdTokens)
            {throw new Error('expected gemini-2.5-pro to have a long-context threshold');}

        // inputTokens is entirely absent (not just 0) — promptSize must fall back to 0 for it, so
        // cachedInputTokens alone determines whether the threshold is crossed.
        const overThreshold = estimateCost('gemini', 'gemini-2.5-pro', {
            cachedInputTokens: pricing.longContextThresholdTokens + 1,
            outputTokens: 100,
        });
        expect(overThreshold).toBeNull();

        const underThreshold = estimateCost('gemini', 'gemini-2.5-pro', {
            cachedInputTokens: pricing.longContextThresholdTokens - 1,
            outputTokens: 100,
        });
        expect(underThreshold).not.toBeNull();
    });

    it('does not apply a long-context guard to a model with no configured threshold', () => {
        const pricing = getModelPricing('gemini', 'gemini-2.5-flash');
        expect(pricing?.longContextThresholdTokens).toBeUndefined();
        const cost = estimateCost('gemini', 'gemini-2.5-flash', { inputTokens: 5_000_000, outputTokens: 100 });
        expect(cost).not.toBeNull();
    });
});

describe('ModelPricing.currency', () => {
    it('every registered entry declares USD explicitly, not just in prose', () => {
        for (const provider of ['gemini', 'openai', 'anthropic']) {
            for (const entry of PROVIDER_REGISTRY) {
                if (entry.providerId !== provider) continue;
                for (const model of entry.models) {
                    const pricing = getModelPricing(provider, model);
                    if (pricing) expect(pricing.currency).toBe('USD');
                }
            }
        }
    });
});
