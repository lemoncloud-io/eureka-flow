import type { Chunk, LlmGateway } from '../../llm/llmGateway';

/**
 * Metering — the eval benchmark's efficiency axis (eval-benchmark.md §4.2). Provider-neutral,
 * decorator-composed: the {@link Meter} accumulates `Chunk.usage` and counts `chat()` calls (pure counting,
 * no dollars), {@link price} is the single seam that turns those counts into cost, and {@link meteringGateway}
 * is a thin {@link LlmGateway} tap composed alongside the recorder. No provider field names live here — the
 * `promptTokenCount`/`totalTokenCount`/`cachedContentTokenCount` mapping stays in `GeminiLlmGateway` (§3.2).
 */

/** What {@link Meter.totals} returns — pure per-turn counts, no dollars (§3, §3.2). */
export interface TokenTotals {
    /** Σ usage.inputTokens (promptTokenCount) across calls — re-sent history included (that IS the bill, §3.1). */
    inputTokens: number;
    /** Σ usage.cachedInputTokens (cachedContentTokenCount) — input served from the implicit cache (§3.1). */
    cachedTokens: number;
    /** Σ (providerTotalTokens − inputTokens) per call — visible output + thinking (derive, so thinking is counted, §3.1). */
    outputTokens: number;
    /** Σ usage.providerTotalTokens (totalTokenCount) — the stable, cache-independent ground-truth axis (§3.1). */
    totalTokens: number;
    /** Count of chat() calls in the turn. */
    roundTrips: number;
}

/** {@link TokenTotals} priced (§3): `usdList` cache-blind, `usdEffective` cache-aware. */
export interface TurnCost extends TokenTotals {
    /** Cache-blind: all input at standard rate — stable, apples-to-apples. */
    usdList: number;
    /** Cache-aware: cached input at cachedPerM — real spend, but noisy + order-dependent. */
    usdEffective: number;
}

/** A per-turn accumulator — counting only, provider-neutral. A fresh one per `run()` (§3). */
export interface Meter {
    /** Add one call's usage (call once, on the `done` chunk); a falsy usage is a no-op. */
    addUsage(u: Chunk['usage']): void;
    /** Count one chat() call. */
    tick(): void;
    /** A fresh copy of the five counters — NO dollars (that is {@link price}). */
    totals(): TokenTotals;
}

/** Build a mutable metering accumulator (§3). */
export const createMeter = (): Meter => {
    let inputTokens = 0;
    let cachedTokens = 0;
    let outputTokens = 0;
    let totalTokens = 0;
    let roundTrips = 0;

    return {
        addUsage(u: Chunk['usage']): void {
            if (!u) return;
            const input = u.inputTokens ?? 0;
            // Fall back to input + output only when a provider omits the total; otherwise trust providerTotalTokens.
            const total = u.providerTotalTokens ?? input + (u.outputTokens ?? 0);
            inputTokens += input;
            cachedTokens += u.cachedInputTokens ?? 0;
            totalTokens += total;
            // Derive output = total − prompt so thinking is included (not the visible outputTokens field, §3.1).
            outputTokens += Math.max(0, total - input);
        },
        tick(): void {
            roundTrips += 1;
        },
        totals(): TokenTotals {
            return { inputTokens, cachedTokens, outputTokens, totalTokens, roundTrips };
        },
    };
};

/**
 * Rates WE own (eval-benchmark.md §4.1) — raw tokens are the ground-truth axis; these only scale the
 * derived $ columns. Keyed by model so a bigger model reprices without touching the {@link Meter}. `cachedPerM`
 * is the discounted rate charged on cachedTokens: Gemini 2.5 bills implicit-cache hits at 10% of the standard
 * input rate (a 90% discount) — $0.30/M input → $0.03/M cached.
 */
export const PRICES: Record<string, { inPerM: number; outPerM: number; cachedPerM: number }> = {
    'gemini-2.5-flash': { inPerM: 0.3, outPerM: 2.5, cachedPerM: 0.03 },
};

/** The single pricing seam — a pure fn over {@link TokenTotals} + {@link PRICES} (§3.2); nothing else applies a rate. */
export const price = (t: TokenTotals, model: string): { usdList: number; usdEffective: number } => {
    // An unlisted model falls back to the flash rates (approximate) rather than throwing — tokens are the
    // ground-truth axis and must always report; add the model to PRICES for an accurate $ figure.
    const r = PRICES[model] ?? PRICES['gemini-2.5-flash'];
    const nonCached = Math.max(0, t.inputTokens - t.cachedTokens);
    // Rates are per million.
    const usdList = (t.inputTokens * r.inPerM + t.outputTokens * r.outPerM) / 1e6;
    const usdEffective = (nonCached * r.inPerM + t.cachedTokens * r.cachedPerM + t.outputTokens * r.outPerM) / 1e6;
    return { usdList, usdEffective };
};

/**
 * A thin {@link LlmGateway} decorator that taps usage into a shared {@link Meter} (§3.2). It counts the call,
 * adds any per-call usage once (on the `done` chunk), and re-yields every chunk unchanged — recording no
 * transcript (that is the separate recorder it is composed with). Both are pure pass-through observers, so
 * composition order is free.
 */
export const meteringGateway = (inner: LlmGateway, meter: Meter): LlmGateway => ({
    capabilities: inner.capabilities,
    async *chat(req, opts): AsyncIterable<Chunk> {
        meter.tick();
        for await (const chunk of inner.chat(req, opts)) {
            if (chunk.usage) meter.addUsage(chunk.usage);
            yield chunk;
        }
    },
});
