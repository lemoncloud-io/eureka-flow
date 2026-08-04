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

/**
 * Fine-grained failure categories for Gemini specifically (Phase 8 of the production-review
 * request) — a reporting-only refinement of the coarse `provider-error`/`fail` outcome above,
 * built entirely from sanitized diagnostics `GeminiToolLlmGateway.ts` already produces
 * (`describeGeminiFailure`'s `finishReason=`/`promptFeedback.blockReason=`/`safetyRatings=`
 * markers, plus an HTTP status when available). Never changes `RealProviderOutcome` scoring —
 * purely a classification layer for the human-facing report.
 *
 * `no-candidate` and `malformed-provider-response` are NOT distinguished by this classifier:
 * `describeGeminiFailure` deliberately covers "no candidates", "missing content", "missing
 * parts", and "empty parts" with one uniform message shape (see its own doc comment), so there is
 * no diagnostic signal today to tell those apart. Both map to `no-candidate` here; splitting them
 * would need a `GeminiToolLlmGateway.ts` change to preserve which specific shape occurred, which
 * this repo should only do once a live run actually needs the distinction (see the "Add
 * regression tests only when a concrete implementation defect is found" rule this task was given
 * — the same caution applies to adding classification precision with no real failure to justify
 * it yet).
 */
export type GeminiFailureCategory =
    | 'authentication'
    | 'invalid-request'
    | 'unavailable-model'
    | 'rate-limit'
    | 'timeout'
    | 'retryable-upstream-failure'
    | 'safety-block'
    | 'no-candidate'
    | 'parser-defect'
    | 'model-behavior-variance'
    | 'unresolved';

/** Classify a Gemini failure message (+ optional sanitized HTTP status) into one of
 * {@link GeminiFailureCategory}. Pure string/shape matching — no network, no live call. Order
 * matters: an HTTP-status-derived category takes precedence over a message-content match, since a
 * non-2xx response never reaches Gemini's own JSON body at all. */
export const classifyGeminiFailureCategory = (message: string, httpStatus?: number): GeminiFailureCategory => {
    if (message.includes(TIMEOUT_MARKER)) return 'timeout';

    if (httpStatus !== undefined) {
        if (httpStatus === 401 || httpStatus === 403) return 'authentication';
        if (httpStatus === 400) return 'invalid-request';
        if (httpStatus === 404) return 'unavailable-model';
        if (httpStatus === 429) return 'rate-limit';
        if (httpStatus >= 500) return 'retryable-upstream-failure';
    }

    if (/blockReason=/.test(message) || /safetyRatings=\[[^\]]*blocked/.test(message)) {
        return 'safety-block';
    }
    if (/not valid JSON|JSON\.parse|Unexpected token/i.test(message)) {
        return 'parser-defect';
    }
    if (/finishReason=(RECITATION|OTHER)/.test(message)) {
        return 'model-behavior-variance';
    }
    if (/no candidates or no usable content parts/.test(message)) {
        return 'no-candidate';
    }

    return 'unresolved';
};
