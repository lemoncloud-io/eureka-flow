import type { LocatorScenarioKnownVariance, LocatorScenarioResult } from './verifyLocatorScenarios';

/**
 * Reporting-only outcome categories for the real-provider locator scenario matrix
 * (`realLocatorScenarios.spec.ts`). This is a classification layer over {@link LocatorScenarioResult}
 * — it never changes what `check()` scores as pass/fail in `verifyLocatorScenarios.ts`, and never
 * changes which `knownVariance` allowance applies. Extracted into its own module (rather than
 * inlined in the env-gated spec file) specifically so it has real, always-on offline test coverage
 * — `realLocatorScenarios.spec.ts` only runs at all when a real API key is present.
 *
 * - `pass` / `known-variance`: both "accepted" — see {@link isAcceptedOutcome}.
 * - `fail`: an ordinary, uncharacterized scoring failure — the model's tool choice or arguments
 *   were wrong, scored by `check()`. No thrown error involved.
 * - `timeout`: the real-provider call didn't settle within the harness's timeout window.
 * - `provider-error`: the gateway/provider itself failed to produce a usable response at all (e.g.
 *   a safety block or an HTTP failure) — a thrown error caught by `runLocatorScenario`'s own
 *   try/catch, not a logical scoring failure. Distinct from `fail` so a provider outage or
 *   content-policy block is never silently conflated with a wrong tool choice.
 */
export type RealProviderOutcome = 'pass' | 'known-variance' | 'fail' | 'timeout' | 'provider-error';

export interface RealProviderClassification {
    outcome: RealProviderOutcome;
    note?: string;
}

/**
 * Substring marker used by the harness's own timeout-race rejection message (see
 * `realLocatorScenarios.spec.ts`'s `raceWithTimeout`) — checked against a caught thrown error's
 * message to distinguish our own timeout from anything else that might escape
 * `runLocatorScenario` entirely. In practice only the timeout race does: `runLocatorScenario`
 * catches everything else internally, including provider errors, into a normal `pass: false`
 * return (see {@link classifyLocatorScenarioResult} below), so it never throws on its own.
 */
export const TIMEOUT_MARKER = 'timed out after';

/**
 * Classify a thrown error that escaped `runLocatorScenario` entirely (a raw caught error, not a
 * {@link LocatorScenarioResult}). In practice this is only ever the harness's own timeout race.
 */
export const classifyThrownError = (error: unknown): RealProviderOutcome => {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes(TIMEOUT_MARKER) ? 'timeout' : 'fail';
};

/**
 * Classify a completed (non-thrown) {@link LocatorScenarioResult}. Order matters: `pass` first,
 * then `providerError` — checked **before** `knownVariance` so a provider-error result (typically
 * `toolCallName: null`, `textPresent: false`) can never be misread as a tool-choice variance —
 * then `knownVariance`, then a plain uncharacterized `fail`.
 */
export const classifyLocatorScenarioResult = (
    result: LocatorScenarioResult,
    knownVariance: LocatorScenarioKnownVariance | undefined
): RealProviderClassification => {
    if (result.pass) {
        return { outcome: 'pass' };
    }
    if (result.providerError) {
        return { outcome: 'provider-error', note: result.error };
    }
    if (knownVariance?.matches(result)) {
        return { outcome: 'known-variance', note: knownVariance.note };
    }
    return { outcome: 'fail', note: result.error };
};

/**
 * Whether an outcome counts toward "accepted" in the real-provider matrix summary. Only `pass`
 * and `known-variance` do — `provider-error`, `fail`, and `timeout` are all NOT accepted.
 */
export const isAcceptedOutcome = (outcome: RealProviderOutcome): boolean =>
    outcome === 'pass' || outcome === 'known-variance';
