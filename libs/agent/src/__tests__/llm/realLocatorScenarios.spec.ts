import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { createFetchHttpClient } from '../../http/FetchHttpClient';
import {
    TIMEOUT_MARKER,
    classifyGeminiFailureCategory,
    classifyLocatorScenarioResult,
    classifyThrownError,
    isAcceptedOutcome,
} from '../../llm/classifyRealProviderResult';
import { COST_CURRENCY } from '../../llm/pricing';
import { PROVIDER_REGISTRY, createGatewayForEntry, resolveModelsToRun } from '../../llm/providerRegistry';
import {
    aggregateVerificationMetrics,
    buildElapsedVsTokensChart,
    distinctSourceSessions,
    formatCostRanking,
    formatMetricsMarkdownTable,
    formatTokenDiagnosticsTable,
    formatVerificationRecordsCsv,
    formatVerificationRecordsJsonl,
    mergeVerificationRecords,
    wrapGatewayWithUsageCapture,
} from '../../llm/verificationMetrics';
import { LOCATOR_SCENARIOS, runLocatorScenario } from '../../llm/verifyLocatorScenarios';

import type { RealProviderOutcome } from '../../llm/classifyRealProviderResult';
import type { LlmGateway } from '../../llm/llmGateway';
import type {
    CapturedCallInfo,
    VerificationMetricsReport,
    VerificationRunRecord,
} from '../../llm/verificationMetrics';
import type { LocatorScenarioResult } from '../../llm/verifyLocatorScenarios';

/**
 * Monitoring: every scenario run below is timed at
 * the call site (`Date.now()` immediately around the racing `runLocatorScenario` call — always
 * available, even on a timeout or thrown error) and its token usage is captured, best-effort, via
 * `wrapGatewayWithUsageCapture` (see verificationMetrics.ts's module doc for exactly why timing
 * and usage capture are split this way). Every record lands in `ALL_METRIC_RECORDS`, a module-level
 * collector shared across every provider/model `describe.runIf` block in this file. The file-level
 * `afterAll` below (not nested inside `runMatrix`, so it fires once after every block finishes, in
 * whichever order vitest runs them) writes a Markdown + JSON artifact — but ONLY if at least one
 * scenario actually ran; with no API keys set, `ALL_METRIC_RECORDS` stays empty and nothing is
 * written, matching this project's "do not claim tokens/runs that didn't happen" rule (the same
 * reasoning `runMatrix`'s own per-block afterAll already applies to `rows.length === 0`).
 */
const ALL_METRIC_RECORDS: VerificationRunRecord[] = [];

/**
 * Explicit opt-in required on top of a real provider key: a key being present alone is NOT
 * sufficient to make a live network call. This is the same "never run live merely because a key
 * variable exists" rule the surrounding docs describe — it was previously enforced only by whoever
 * chose to set a key at all; this makes it a real, checked gate.
 */
const LIVE_RUN_OPTED_IN = process.env['RUN_LIVE_PROVIDER_TESTS'] === '1';

/** Optional single-provider filter for an inexpensive smoke run before the full matrix — matches
 * `ProviderModelEntry.providerId` (e.g. `openai`, `gemini`, `openrouter`), not the display name.
 * Unset means every registered provider with a key (and RUN_LIVE_PROVIDER_TESTS=1) is in scope,
 * same as before this option existed. Combine with the entry's own `<PROVIDER>_TEST_MODEL`
 * override (see `providerRegistry.ts`) to narrow to exactly one provider AND one model. */
const LIVE_PROVIDER_FILTER = process.env['LIVE_PROVIDER_FILTER'];

/** Output directory for every generated artifact (Markdown/JSON/CSV/JSONL/run-manifest). Defaults
 * to this repo's existing in-tree path (unchanged behavior); set to an absolute path outside the
 * working tree to keep live-run output out of `git status` entirely — see
 * docs/browser-agent/design/production-readiness.md for example commands. */
const METRICS_DIR = process.env['LIVE_METRICS_OUTPUT_DIR'] ?? join(__dirname, '../../../../../docs/browser-agent/verification-metrics');
const METRICS_MD_PATH = join(METRICS_DIR, 'latest.md');
const METRICS_JSON_PATH = join(METRICS_DIR, 'latest.json');
const METRICS_CSV_PATH = join(METRICS_DIR, 'latest.csv');
const METRICS_JSONL_PATH = join(METRICS_DIR, 'latest.jsonl');
const RUN_MANIFEST_PATH = join(METRICS_DIR, 'run-manifest.json');
/** Canonical, editable Mermaid source for the elapsed-vs-tokens chart — the actual `.mmd` file, no
 * code fence, no Markdown wrapper. `latest.md` links to this file rather than re-embedding the
 * Mermaid text inline, since inline-fenced Mermaid is exactly what an editor/extension rendering
 * quirk (see production-readiness.md's Mermaid-rendering note) can fail on inconsistently — an SVG
 * embed always renders, everywhere, and this file stays the one place the raw source lives. */
const CHART_MMD_PATH = join(METRICS_DIR, 'elapsed-vs-tokens.mmd');
/** Rendered SVG of the identical chart, generated from the same aggregate/point data
 * `CHART_MMD_PATH` is generated from — see `buildElapsedVsTokensChart`'s own doc for why the two
 * cannot diverge (neither is derived from the other; both come from the same `points` array). */
const CHART_SVG_PATH = join(METRICS_DIR, 'elapsed-vs-tokens.svg');

/**
 * Env-gated real-provider run of the full scenario matrix (list_nodes vs move_node selection, all
 * four move directions, absolute position, refusal, unknown-target) — all single-turn. Skipped
 * entirely unless BOTH `RUN_LIVE_PROVIDER_TESTS=1` is explicitly set AND the provider's key env
 * var is present — a key being set is no longer sufficient by itself, so a key left in the
 * environment for an unrelated reason can never trigger an accidental live run. Optionally narrow
 * to one provider with `LIVE_PROVIDER_FILTER=<providerId>` (combine with `<PROVIDER>_TEST_MODEL`
 * for one provider AND one model). Never hits the network in CI or a keyless/opted-out run, and no
 * key is ever read into a browser bundle (Node test env, `process.env` only) or logged.
 *
 * Deliberately does NOT include a multi-step `list_nodes` -> `move_node` conversation: that needs
 * the real tool-result round-trip, a structurally different harness than this file's
 * single-`chat()`-call-per-scenario shape. This file's own matrix stays single-turn by design, not
 * because either provider can't do a second turn. See
 * docs/browser-agent/design/provider-tool-calling.md §4.
 *
 * Gemini has an observed lookup-first *target-resolution* strategy: given a prompt that requires
 * resolving a specific node, it may call `list_nodes` before committing to the scenario's expected
 * tool, even when the per-turn context it already received should make the lookup unnecessary.
 * The known-variance allowance for this covers every scenario that involves resolving a specific
 * node target — move-node-right/-left/-up/-down/-absolute, plus unknown-target — NOT
 * list-nodes-read-only (a different shape entirely: that scenario's own distinct variance is about
 * *not* calling list_nodes, the opposite direction) and NOT no-tool-refusal (no node-resolution
 * involved).
 *
 * Registry-driven: this file loops `PROVIDER_REGISTRY` (`../../llm/providerRegistry`) rather than
 * hard-coding one gateway-builder call per provider. Per entry, every model in
 * `resolveModelsToRun(entry, ...)` runs — every model in `entry.models` unless the entry's
 * `modelEnvOverride` env var narrows it to one. Concretely: setting only `OPENAI_API_KEY` runs the
 * full matrix against every model in `OPENAI_ENTRY.models`; set `OPENAI_TEST_MODEL` to pin to a
 * single model.
 *
 * **Timeout handling:** `runMatrix` races `runLocatorScenario` against its own internal timeout
 * (`DEFAULT_REAL_TEST_TIMEOUT_MS`, 30s, overridable per entry via `realTestTimeoutMs` — e.g. a slow
 * free-tier model) instead of relying on vitest's per-test timeout to catch a slow real API call.
 * This matters because vitest's own timeout aborts the test *before* any of this file's own code
 * runs — a scenario that timed out would never reach `rows.push(...)`, so it would be silently
 * absent from the matrix rather than counted, making `rows.length` itself smaller and letting e.g.
 * "6/6 accepted" hide 2 real timeouts that should have made it "6/8". The internal race always
 * wins first and always pushes a row (a `'timeout'` outcome, distinct from `'fail'`), so the
 * summary can never go quietly dishonest this way; vitest's own per-test timeout is still set
 * (comfortably higher, via `VITEST_TIMEOUT_BUFFER_MS`) purely as a backstop that should never
 * actually fire.
 *
 * **`provider-error` outcome:** classification lives in `../../llm/classifyRealProviderResult.ts`
 * (pure, offline-tested — `classifyRealProviderResult.spec.ts` — since this spec file itself is
 * real-key-gated and can't offer offline coverage on its own). `LocatorScenarioResult.providerError`
 * is set only when `runLocatorScenario`'s own try/catch caught a thrown gateway/provider error (a
 * safety block, an HTTP failure, a Gemini response with no usable candidates, ...) — never for a
 * normal `check()`-scored `pass: false`. The classifier checks it *before* `knownVariance`, so a
 * provider-error result can never be misread as a tool-choice variance. `provider-error` is NOT
 * accepted (same as `fail` and `timeout`) — accepted stays exactly `pass + known-variance`, per
 * `isAcceptedOutcome`.
 *
 * Neither provider's known-variance case is a gateway parsing bug: `OpenAiLlmGateway.spec.ts` and
 * `GeminiToolLlmGateway.spec.ts` already prove request mapping and response parsing are correct
 * for whatever tool call *is* returned. These results are about model tool *choice* — and for
 * Gemini specifically, "chose to look up first" is where it gets stuck: this file's own matrix is
 * single-turn by design (see the module-level note above), so there's no second turn here for the
 * model to continue past the lookup and actually resolve the target, regardless of the multi-turn
 * tool-result mapping being available in general. A known-variance result means exactly "hit the
 * documented alternate, accepted as known variance — not a strict pass", never "the move
 * completed" or "the refusal/executor-error path completed". A provider-error result is a
 * different kind of thing entirely — not a tool-choice question.
 *
 * `check()` in `verifyLocatorScenarios.ts` is NOT changed by any of this — offline scoring stays
 * exactly as strict as before. Only this file treats a `knownVariance`-documented alternate
 * outcome as non-fatal, and only for the exact shape `matches()` describes.
 */

interface MatrixRow {
    scenarioId: string;
    outcome: RealProviderOutcome;
    note?: string;
}

/** Real-provider tests only — never applies to offline specs, which never call runMatrix. Providers
 * known to be slower (e.g. a free-tier OpenRouter model) can override via `entry.realTestTimeoutMs`. */
const DEFAULT_REAL_TEST_TIMEOUT_MS = 30_000;
/** Vitest's own per-test timeout is set above our internal race so it's a backstop only — our
 * internal race always wins first and always pushes a row, keeping the summary honest even on a
 * genuine timeout (see the "not honest" bug this harness fix addresses). */
const VITEST_TIMEOUT_BUFFER_MS = 10_000;

/** Races a promise against a timeout that rejects with a recognizable message (TIMEOUT_MARKER),
 * so the caller can push a row and fail the test even when the underlying call never settles in
 * time — vitest's own timeout, by contrast, aborts the test before any of *our* code can run. */
const raceWithTimeout = async <T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} ${TIMEOUT_MARKER} ${timeoutMs}ms`)), timeoutMs);
    });
    try {
        return await Promise.race([promise, timeout]);
    } finally {
        clearTimeout(timer);
    }
};

/** Sanitized failure category — populated for Gemini only (the sole provider with a real
 * classifier today, see `classifyRealProviderResult.ts`'s own doc for why one isn't invented for
 * the others without a concrete failure to classify), and only for the two outcomes that
 * represent a real failure/error rather than a scoring disagreement. */
const errorCategoryFor = (
    provider: string,
    outcome: RealProviderOutcome,
    message: string | undefined
): string | undefined => {
    if (provider !== 'Gemini') return undefined;
    if (outcome !== 'fail' && outcome !== 'provider-error') return undefined;
    return classifyGeminiFailureCategory(message ?? '');
};

const runMatrix = (
    providerLabel: string,
    provider: string,
    model: string,
    buildGateway: () => LlmGateway,
    timeoutMs: number = DEFAULT_REAL_TEST_TIMEOUT_MS
) => {
    const rows: MatrixRow[] = [];

    for (const scenario of LOCATOR_SCENARIOS) {
        const title = scenario.knownVariance
            ? `${scenario.id}: ${scenario.description} [has a documented known-variance allowance]`
            : `${scenario.id}: ${scenario.description}`;

        it(
            title,
            async () => {
                // Timing measured at the call site — always available (even on a timeout/thrown
                // error), unlike usage/actualModel, which are captured inside the gateway wrapper
                // below and may not have fired yet if the call never completed. See
                // verificationMetrics.ts.
                const startedAt = Date.now();
                let usage: CapturedCallInfo = { inputTokens: null, outputTokens: null, totalTokens: null };
                const gateway = wrapGatewayWithUsageCapture(buildGateway(), captured => {
                    usage = captured;
                });

                let result: LocatorScenarioResult;
                try {
                    result = await raceWithTimeout(
                        runLocatorScenario(gateway, scenario.id),
                        timeoutMs,
                        `${providerLabel} ${scenario.id}`
                    );
                } catch (err) {
                    // Escaped runLocatorScenario entirely — in practice this is only our own
                    // timeout race (runLocatorScenario's own try/catch turns every other failure,
                    // including real provider errors, into a normal `pass: false` result handled
                    // below). Recorded honestly as its own outcome, NEVER silently dropped from
                    // `rows` — a dropped row is exactly how "7/7 accepted" could previously hide 2
                    // real timeouts (rows.length would shrink instead of counting the failure).
                    const message = err instanceof Error ? err.message : String(err);
                    const outcome = classifyThrownError(err);
                    const errorCategory = errorCategoryFor(provider, outcome, message);
                    rows.push({ scenarioId: scenario.id, outcome, note: message });
                    const endedAt = Date.now();
                    ALL_METRIC_RECORDS.push({
                        provider,
                        model,
                        scenarioId: scenario.id,
                        outcome,
                        startedAt,
                        endedAt,
                        elapsedMs: endedAt - startedAt,
                        ...usage,
                        toolCallName: null,
                        canvasStateCorrect: isAcceptedOutcome(outcome),
                        retries: 0,
                        ...(errorCategory ? { errorCategory } : {}),
                    });
                    throw err;
                }

                // Classification-only: does NOT change what check() scored, or which knownVariance
                // allowance applies — see classifyRealProviderResult.ts for the ordering rationale
                // (provider-error is checked before knownVariance so a thrown provider/gateway
                // failure can never be misread as a tool-choice variance).
                const { outcome, note } = classifyLocatorScenarioResult(result, scenario.knownVariance);
                const errorCategory = errorCategoryFor(provider, outcome, note ?? result.error);
                rows.push({ scenarioId: scenario.id, outcome, ...(note ? { note } : {}) });
                const endedAt = Date.now();
                ALL_METRIC_RECORDS.push({
                    provider,
                    model,
                    scenarioId: scenario.id,
                    outcome,
                    startedAt,
                    endedAt,
                    elapsedMs: endedAt - startedAt,
                    ...usage,
                    toolCallName: result.toolCallName,
                    ...(result.argsValid !== undefined ? { argsValid: result.argsValid } : {}),
                    ...(result.dispatchOk !== undefined ? { dispatchOk: result.dispatchOk } : {}),
                    canvasStateCorrect: isAcceptedOutcome(outcome),
                    retries: 0,
                    ...(errorCategory ? { errorCategory } : {}),
                });

                if (outcome === 'known-variance') {
                    expect(scenario.knownVariance?.matches(result)).toBe(true);
                    return;
                }
                // pass: this passes. fail/provider-error: this fails the test, exactly as before —
                // provider-error is still a real failure, just reported in its own category.
                expect(result.pass).toBe(true);
            },
            timeoutMs + VITEST_TIMEOUT_BUFFER_MS
        );
    }

    afterAll(() => {
        if (rows.length === 0) {
            return;
        }
        const passed = rows.filter(r => r.outcome === 'pass').length;
        const variance = rows.filter(r => r.outcome === 'known-variance').length;
        const failed = rows.filter(r => r.outcome === 'fail').length;
        const timedOut = rows.filter(r => r.outcome === 'timeout').length;
        const providerErrors = rows.filter(r => r.outcome === 'provider-error').length;
        const accepted = rows.filter(r => isAcceptedOutcome(r.outcome)).length;
        const summary =
            `${providerLabel} real-provider matrix: ${accepted}/${rows.length} accepted` +
            ` (${passed} pass, ${variance} known-variance, ${failed} fail, ${timedOut} timeout, ` +
            `${providerErrors} provider-error)`;

        console.log(`\n${summary}`);

        console.table(rows);
    });
};

// Registry-driven: loops every entry in PROVIDER_REGISTRY (see the module doc above for which
// providers are currently registered) and, per entry, every model resolveModelsToRun() returns —
// every configured model unless the entry's modelEnvOverride narrows it to one. Each
// (provider, model) pair gets its own describe.runIf, gated on THREE things now, all required:
// RUN_LIVE_PROVIDER_TESTS=1 (explicit opt-in — a key alone is no longer sufficient), that entry's
// own apiKeyEnv, and (if set) LIVE_PROVIDER_FILTER matching this entry's providerId.
const PLANNED_PAIRS: Array<{ provider: string; providerId: string; model: string; keyPresent: boolean }> = [];
for (const entry of PROVIDER_REGISTRY) {
    const apiKey = process.env[entry.apiKeyEnv];
    const overrideValue = entry.modelEnvOverride ? process.env[entry.modelEnvOverride] : undefined;
    const providerSelected = !LIVE_PROVIDER_FILTER || LIVE_PROVIDER_FILTER === entry.providerId;

    for (const model of resolveModelsToRun(entry, overrideValue)) {
        if (providerSelected) {
            PLANNED_PAIRS.push({ provider: entry.displayName, providerId: entry.providerId, model, keyPresent: !!apiKey });
        }
        const willRun = LIVE_RUN_OPTED_IN && !!apiKey && providerSelected;

        describe.runIf(willRun)(`${entry.displayName} scenario matrix (env-gated) — ${model}`, () => {
            runMatrix(
                `${entry.displayName} (${model})`,
                entry.displayName,
                model,
                () =>
                    createGatewayForEntry(entry, {
                        apiKey: apiKey as string,
                        model,
                        http: createFetchHttpClient(),
                    }),
                entry.realTestTimeoutMs
            );
        });
    }
}

// Printed at module-collection time — before vitest runs a single test body, so this always
// appears before any real network call could happen, whether or not anything is actually gated
// in to run. Never silent about what would/would not run and why.
{
    const runnable = PLANNED_PAIRS.filter(p => p.keyPresent);
    const totalRequests = runnable.length * LOCATOR_SCENARIOS.length;
    console.log('\n[realLocatorScenarios] live-run selection:');
    console.log(`  RUN_LIVE_PROVIDER_TESTS=${LIVE_RUN_OPTED_IN ? '1 (opted in)' : 'unset — nothing will run'}`);
    console.log(`  LIVE_PROVIDER_FILTER=${LIVE_PROVIDER_FILTER ?? '(none — every registered provider in scope)'}`);
    if (PLANNED_PAIRS.length === 0) {
        console.log('  no (provider, model) pairs match the current filter');
    } else {
        for (const pair of PLANNED_PAIRS) {
            const status = !LIVE_RUN_OPTED_IN ? 'skipped: opt-in not set' : pair.keyPresent ? 'WILL RUN' : `skipped: ${pair.providerId} key not set`;
            console.log(`  - ${pair.provider} (${pair.providerId}) / ${pair.model} — ${status}`);
        }
    }
    console.log(
        `  ${runnable.length} (provider, model) pair(s) × ${LOCATOR_SCENARIOS.length} scenarios = ` +
            `${LIVE_RUN_OPTED_IN ? totalRequests : 0} expected live request(s) this run.\n`
    );
}

// File-level afterAll (not nested inside runMatrix/describe — see the module doc above): fires
// once after every provider/model block in this file finishes. Writes the monitoring report only
// when at least one scenario actually ran against a real key this run — an empty
// ALL_METRIC_RECORDS (no keys set) means nothing is written, not an empty/placeholder file. See
// docs/browser-agent/design/provider-tool-calling.md §6 for the reporting semantics.
afterAll(() => {
    if (ALL_METRIC_RECORDS.length === 0) {
        console.log('\n[verificationMetrics] no real-key scenarios ran this session — no artifact written.');
        return;
    }

    // Carry forward (provider, model) pairs not re-run this session from the previously-committed
    // report, rather than overwriting it wholesale — see mergeVerificationRecords's own doc for why
    // a partial real-key run (e.g. only OPENROUTER_API_KEY set) must never silently drop coverage a
    // prior session already verified. Missing/unparsable previous file means this is the first run
    // ever (or a corrupted artifact) — treated as "nothing to carry forward", same as before.
    let previousReport: VerificationMetricsReport | undefined;
    if (existsSync(METRICS_JSON_PATH)) {
        try {
            previousReport = JSON.parse(readFileSync(METRICS_JSON_PATH, 'utf8')) as VerificationMetricsReport;
        } catch {
            previousReport = undefined;
        }
    }

    const generatedAt = new Date().toISOString();
    const mergedRecords = mergeVerificationRecords(previousReport, ALL_METRIC_RECORDS, generatedAt);
    const aggregates = aggregateVerificationMetrics(mergedRecords);
    const report: VerificationMetricsReport = {
        generatedAt,
        costCurrency: COST_CURRENCY,
        aggregates,
        records: mergedRecords,
    };
    const chart = buildElapsedVsTokensChart(mergedRecords);

    const sessions = distinctSourceSessions(mergedRecords);
    const sessionsNote =
        sessions.length > 1
            ? `\n\nThis report combines ${sessions.length} sessions — generated at: ${sessions.join(', ')}.`
            : '';

    // The chart section embeds the rendered SVG and links to the canonical .mmd source, rather
    // than re-embedding raw Mermaid text inline — an inline ```mermaid fence is exactly what an
    // editor/extension rendering inconsistency can fail on; an <img>-embedded SVG always renders,
    // everywhere, and elapsed-vs-tokens.mmd stays the one place anyone needs to go to edit the
    // actual chart source. Both files are generated from `chart.points`, never from each other.
    const chartSection =
        chart.points.length > 0
            ? `## Average elapsed time vs. consumed tokens by model\n\n` +
              `![Average elapsed time vs. consumed tokens by model](./elapsed-vs-tokens.svg)\n\n` +
              `[Mermaid source](./elapsed-vs-tokens.mmd)\n\n${chart.tableMarkdown}\n`
            : `## Average elapsed time vs. consumed tokens by model\n\n${chart.tableMarkdown}\n`;

    const markdown =
        `# LlmGateway verification metrics — generated ${report.generatedAt}\n\n` +
        `Source: \`realLocatorScenarios.spec.ts\` (registry-driven scenario matrix). Regenerated on ` +
        `every real-key run; (provider, model) pairs re-run this session are replaced, pairs not ` +
        `re-run are carried forward from the previously-generated report — never silently dropped. ` +
        `See provider-tool-calling.md §6 for how to read this table and its known ` +
        `limits (a \`*\` on a cell means partial data, not a fabricated number). Cost is the ` +
        `primary comparison metric below; token counts are diagnostic detail — see the token ` +
        `table and existing chart further down.${sessionsNote}\n\n` +
        `${formatMetricsMarkdownTable(report.aggregates)}\n\n` +
        `## Cost ranking (cheapest to most expensive)\n\n${formatCostRanking(report.aggregates)}\n\n` +
        `## Token diagnostics\n\n${formatTokenDiagnosticsTable(report.aggregates)}\n\n` +
        `${chartSection}`;

    const runManifest = {
        generatedAt,
        runLiveProviderTestsOptedIn: LIVE_RUN_OPTED_IN,
        liveProviderFilter: LIVE_PROVIDER_FILTER ?? null,
        scenarioCount: LOCATOR_SCENARIOS.length,
        attemptedThisSession: ALL_METRIC_RECORDS.map(r => ({ provider: r.provider, model: r.model, scenarioId: r.scenarioId, outcome: r.outcome })),
        sourceSessions: sessions,
    };

    mkdirSync(METRICS_DIR, { recursive: true });
    writeFileSync(METRICS_MD_PATH, markdown);
    writeFileSync(METRICS_JSON_PATH, JSON.stringify(report, null, 2));
    writeFileSync(METRICS_CSV_PATH, formatVerificationRecordsCsv(mergedRecords));
    writeFileSync(METRICS_JSONL_PATH, formatVerificationRecordsJsonl(mergedRecords));
    writeFileSync(RUN_MANIFEST_PATH, JSON.stringify(runManifest, null, 2));

    // Only written when there's an actual chart to write — never overwrites/deletes a previously
    // generated .mmd/.svg with empty placeholder content when this particular run had nothing
    // plottable (e.g. a partial re-run of one provider). The .mmd/.svg pair is regenerated as a
    // unit, from the same `chart.points`, whenever there IS something to plot.
    if (chart.points.length > 0) {
        writeFileSync(CHART_MMD_PATH, chart.mermaidSource);
        writeFileSync(CHART_SVG_PATH, chart.svg);
    }

    console.log(
        `\n[verificationMetrics] wrote ${METRICS_MD_PATH}, ${METRICS_JSON_PATH}, ${METRICS_CSV_PATH}, ` +
            `${METRICS_JSONL_PATH}, ${RUN_MANIFEST_PATH}` +
            (chart.points.length > 0 ? `, ${CHART_MMD_PATH}, and ${CHART_SVG_PATH}` : ' (no chart data to write this run)')
    );
    console.table(aggregates);
});
