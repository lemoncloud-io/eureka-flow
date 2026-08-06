import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { createVirtualAgentEnvironment } from '../../environment/createVirtualAgentEnvironment';
import { createFetchHttpRequest } from '../../http/FetchHttpRequest';
import { TIMEOUT_MARKER } from '../../llm/classifyRealProviderResult';
import { buildMultiTurnDashboardHtml } from '../../llm/multiTurnDashboard';
import { planMultiTurnModelSelection } from '../../llm/multiTurnRunSelection';
import {
    buildMultiTurnVerificationReport,
    formatGenerationConfigurationMarkdown,
    formatMultiTurnCompletionModeMarkdownTable,
    formatMultiTurnModelSummaryMarkdownTable,
    formatMultiTurnRecordsCsv,
    formatMultiTurnRecordsJsonl,
    formatMultiTurnRecordsMarkdownDetails,
    formatMultiTurnScenarioMarkdownTable,
    resolveEffectiveCost,
} from '../../llm/multiTurnVerificationMetrics';
import { PRICING_CONFIG_VERSION } from '../../llm/pricing';
import { PROVIDER_REGISTRY, createGatewayForEntry, deriveGenerationConfiguration, resolveModelsToRun } from '../../llm/providerRegistry';
import { accumulateExtendedUsage, wrapGatewayWithUsageCapture } from '../../llm/verificationMetrics';
import { LOCATOR_SCENARIOS, MULTI_TURN_ONLY_SCENARIO_IDS, runMultiTurnLocatorScenario } from '../../llm/verifyLocatorScenarios';

import type { MultiTurnLiveRecord, MultiTurnReportingOutcome, MultiTurnRunManifest } from '../../llm/multiTurnVerificationMetrics';
import type { GenerationConfiguration, ProviderModelEntry } from '../../llm/providerRegistry';
import type { CapturedCallInfo } from '../../llm/verificationMetrics';
import type { LocatorScenarioId, MultiTurnOnlyScenarioId } from '../../llm/verifyLocatorScenarios';

/** Any scenario id the multi-turn runner (`runMultiTurnLocatorScenario`) can accept — the
 * single-turn catalog's ids plus the multi-turn-only ids from `MULTI_TURN_ONLY_SCENARIO_IDS`. Kept
 * as its own alias so `SELECTED_SCENARIOS`/`runOneAttempt` don't need to repeat the union. */
type AnyMultiTurnScenarioId = LocatorScenarioId | MultiTurnOnlyScenarioId;

/**
 * Phase 2: a live, repeated, MULTI-turn pilot over `runMultiTurnLocatorScenario`
 * (`verifyLocatorScenarios.ts`) — the sibling of `realLocatorScenarios.spec.ts`, which stays
 * strictly single-turn and is completely untouched by this file. Every task attempt here is one
 * full multi-turn conversation (up to `maxTurns` model round trips), not one `gateway.chat()` call
 * — so its record shape, outcome vocabulary, and output artifacts are all deliberately separate
 * (see `multiTurnVerificationMetrics.ts`) and never overwrite or merge into the single-turn report.
 *
 * `knownVariance` is never consulted anywhere in this file — `runMultiTurnLocatorScenario` doesn't
 * accept or use it, and neither does anything below. Final success comes only from the returned
 * `MultiTurnTaskOutcome`.
 */

// =============================================================================================
// A. Config parsing + validation — runs at module-collection time, i.e. BEFORE vitest executes
// any `it()` body and therefore before any network call could happen, whether or not this file's
// tests end up gated in to run at all. A key being present is never, by itself, sufficient to
// trigger a live call — RUN_LIVE_MULTI_TURN_TESTS=1 is a separate, explicit, additional opt-in on
// top of `realLocatorScenarios.spec.ts`'s own RUN_LIVE_PROVIDER_TESTS (deliberately a DIFFERENT
// variable, so opting into the single-turn matrix never silently opts into this multi-turn pilot).
// =============================================================================================

const LIVE_RUN_OPTED_IN = process.env['RUN_LIVE_MULTI_TURN_TESTS'] === '1';
const PROVIDER_FILTER = process.env['LIVE_MULTI_TURN_PROVIDER_FILTER'];
const MODEL_FILTER = process.env['LIVE_MULTI_TURN_MODEL_FILTER'];

const DEFAULT_REPETITIONS = 5;
const DEFAULT_MAX_TURNS = 3;
const DEFAULT_SCENARIO_IDS: readonly LocatorScenarioId[] = ['move-node-right', 'ambiguous-instruction', 'unknown-target'];
/** Outer per-TASK timeout (the whole multi-turn conversation, not one turn) — see the timeout doc
 * further down for exactly what this does and does not guarantee. */
const DEFAULT_TASK_TIMEOUT_MS = 60_000;
/** Vitest's own per-test timeout sits above our internal task-timeout race purely as a backstop —
 * our race always settles first and always pushes a record, so this should never actually fire. */
const VITEST_TIMEOUT_BUFFER_MS = 15_000;

const parseIntegerInRange = (raw: string | undefined, fallback: number, min: number, max: number, name: string): number => {
    if (raw === undefined) return fallback;
    const trimmed = raw.trim();
    if (!/^-?\d+$/.test(trimmed)) {
        throw new Error(`realMultiTurnLocatorScenarios: ${name} must be an integer, got "${raw}"`);
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (parsed < min || parsed > max) {
        throw new Error(`realMultiTurnLocatorScenarios: ${name} must be an integer from ${min} to ${max}, got ${parsed}`);
    }
    return parsed;
};

const REPETITIONS = parseIntegerInRange(process.env['LIVE_MULTI_TURN_REPETITIONS'], DEFAULT_REPETITIONS, 1, 50, 'LIVE_MULTI_TURN_REPETITIONS');
const MAX_TURNS = parseIntegerInRange(process.env['LIVE_MULTI_TURN_MAX_TURNS'], DEFAULT_MAX_TURNS, 1, 10, 'LIVE_MULTI_TURN_MAX_TURNS');

const parseScenarioIds = (raw: string | undefined): AnyMultiTurnScenarioId[] => {
    const requested = raw
        ? raw
              .split(',')
              .map(s => s.trim())
              .filter(Boolean)
        : [...DEFAULT_SCENARIO_IDS];
    // Accepts both the single-turn catalog's ids AND the multi-turn-only ids (e.g.
    // `move-named-node-without-id`) — the latter exist solely for this runner and are never added
    // to `LOCATOR_SCENARIOS`/`DEFAULT_SCENARIO_IDS` (the default list is unchanged by this).
    const valid = new Set<string>([...LOCATOR_SCENARIOS.map(s => s.id), ...MULTI_TURN_ONLY_SCENARIO_IDS]);
    for (const id of requested) {
        if (!valid.has(id)) {
            throw new Error(
                `realMultiTurnLocatorScenarios: LIVE_MULTI_TURN_SCENARIOS has an unknown scenario id "${id}" — ` +
                    `valid ids: ${[...valid].join(', ')}`
            );
        }
    }
    if (requested.length === 0) {
        throw new Error('realMultiTurnLocatorScenarios: LIVE_MULTI_TURN_SCENARIOS resolved to zero scenarios');
    }
    return requested as AnyMultiTurnScenarioId[];
};

const SELECTED_SCENARIOS = parseScenarioIds(process.env['LIVE_MULTI_TURN_SCENARIOS']);

const OUTPUT_DIR_OVERRIDE = process.env['LIVE_MULTI_TURN_OUTPUT_DIR'];
/** Deliberately a SEPARATE directory from the single-turn report's `METRICS_DIR` — never the same
 * path, so this file can never overwrite `latest.md`/`latest.json` from `realLocatorScenarios.spec.ts`. */
const METRICS_DIR = OUTPUT_DIR_OVERRIDE ?? join(__dirname, '../../../../../docs/browser-agent/verification-metrics/multi-turn');
const METRICS_MD_PATH = join(METRICS_DIR, 'latest.md');
const METRICS_JSON_PATH = join(METRICS_DIR, 'latest.json');
const METRICS_CSV_PATH = join(METRICS_DIR, 'latest.csv');
const METRICS_JSONL_PATH = join(METRICS_DIR, 'latest.jsonl');
const METRICS_HTML_PATH = join(METRICS_DIR, 'latest.html');
const RUN_MANIFEST_PATH = join(METRICS_DIR, 'run-manifest.json');
const ERROR_MESSAGE_LIMIT = 200;

// =============================================================================================
// B. Provider/model selection — registry-driven, same PROVIDER_REGISTRY/createGatewayForEntry/
// resolveModelsToRun as the single-turn matrix, so this file never hard-codes a model id.
// LIVE_MULTI_TURN_MODEL_FILTER accepts either one model (unchanged behavior) or a comma-separated
// list (e.g. `gpt-4o-mini,gpt-5-mini`) — parsing/validation/registry-order lives in the pure,
// separately-unit-tested `planMultiTurnModelSelection` (multiTurnRunSelection.ts); this file only
// supplies the env-derived inputs (provider/model filters, per-entry model-override values) and
// layers `keyPresent`/`willRun` on top, since only this file owns `process.env` access. Every
// selected pair — one model or several — accumulates into the SAME `ALL_MULTI_TURN_RECORDS` array
// below and is written as ONE consolidated set of artifacts in the single `afterAll`; there is no
// per-model process spawn or temporary directory to merge.
// =============================================================================================

interface PlannedPair {
    provider: string;
    providerId: string;
    model: string;
    keyPresent: boolean;
}

interface SelectedPair {
    entry: ProviderModelEntry;
    model: string;
    willRun: boolean;
}

// Throws synchronously here — at module-collection time, before any `it()` body (and therefore
// before any network call) — if LIVE_MULTI_TURN_MODEL_FILTER names a model absent from every
// selected provider's registry entry.
const MODEL_SELECTION = planMultiTurnModelSelection({
    registry: PROVIDER_REGISTRY,
    providerFilter: PROVIDER_FILTER,
    modelFilter: MODEL_FILTER,
    resolveModelsToRun: entry => resolveModelsToRun(entry, entry.modelEnvOverride ? process.env[entry.modelEnvOverride] : undefined),
});

const PLANNED_PAIRS: PlannedPair[] = [];
/** Every SELECTED (provider, model) pair, whether or not it will actually run — a `describe.runIf`
 * block is registered for each one regardless (see the registration loop below), the same way
 * `realLocatorScenarios.spec.ts` always registers a (possibly skipped) suite per pair. This is
 * deliberate: filtering pairs out of the loop entirely (registering zero suites when nothing is
 * opted in) makes vitest fail this file with "No test suite found" when it's run in isolation with
 * a clean/default env — `describe.runIf(false)` avoids that while still running nothing. */
const SELECTED_PAIRS: SelectedPair[] = [];

// One entry per PROVIDER actually planned this run (never per model — see
// GenerationConfiguration's own doc for why that would just repeat the same values). `generation`
// is never passed to createGatewayForEntry today (see runOneAttempt below), so this always
// reflects that — becomes accurate automatically if a future change ever starts configuring it.
const GENERATION_CONFIGURATION: Record<string, GenerationConfiguration> = {};

for (const { entry, model } of MODEL_SELECTION.pairs) {
    const keyPresent = !!process.env[entry.apiKeyEnv];
    PLANNED_PAIRS.push({ provider: entry.displayName, providerId: entry.providerId, model, keyPresent });
    SELECTED_PAIRS.push({ entry, model, willRun: LIVE_RUN_OPTED_IN && keyPresent });
    if (!(entry.providerId in GENERATION_CONFIGURATION)) {
        GENERATION_CONFIGURATION[entry.providerId] = deriveGenerationConfiguration(entry.gatewayType);
    }
}

// Printed at module-collection time — before any test body runs, so this always appears before a
// single network call could happen, whether or not anything ends up gated in. Required by design:
// "the runner must print the exact selected provider/model pairs before running."
{
    const expectedTaskCount = SELECTED_PAIRS.filter(p => p.willRun).length * SELECTED_SCENARIOS.length * REPETITIONS;
    console.log('\n[realMultiTurnLocatorScenarios] live multi-turn pilot selection:');
    console.log(`  RUN_LIVE_MULTI_TURN_TESTS=${LIVE_RUN_OPTED_IN ? '1 (opted in)' : 'unset — nothing will run'}`);
    console.log(`  LIVE_MULTI_TURN_PROVIDER_FILTER=${PROVIDER_FILTER ?? '(none)'}`);
    console.log(`  LIVE_MULTI_TURN_MODEL_FILTER=${MODEL_FILTER ?? '(none)'}`);
    console.log(`  scenarios=${SELECTED_SCENARIOS.join(', ')}`);
    console.log(`  repetitions=${REPETITIONS}  maxTurns=${MAX_TURNS}  taskTimeoutMs=${DEFAULT_TASK_TIMEOUT_MS}`);
    if (PLANNED_PAIRS.length === 0) {
        console.log('  no (provider, model) pairs match the current filter(s)');
    } else {
        for (const pair of PLANNED_PAIRS) {
            const status = !LIVE_RUN_OPTED_IN ? 'skipped: opt-in not set' : pair.keyPresent ? 'WILL RUN' : `skipped: ${pair.providerId} key not set`;
            console.log(`  - ${pair.provider} (${pair.providerId}) / ${pair.model} — ${status}`);
        }
    }
    console.log(`  expected task count this run: ${LIVE_RUN_OPTED_IN ? expectedTaskCount : 0}\n`);
}

// =============================================================================================
// D. Timeout handling
//
// `raceWithTaskTimeout` covers the COMPLETE multi-turn task (every turn `runMultiTurnLocatorScenario`
// runs internally), not each turn separately — there is no per-turn timeout inside this file or
// inside `runMultiTurnLocatorScenario` itself.
//
// IMPORTANT LIMITATION, stated plainly: `Promise.race` only stops *this file* from waiting on the
// losing promise any longer — it does NOT cancel the in-flight HTTP request(s) `gateway.chat()`
// already started. Neither `runMultiTurnLocatorScenario` nor `runLocatorScenario` accepts an
// `AbortSignal` today (see `verifyLocatorScenarios.ts`), and no gateway call below is passed one,
// so a "timed out" task's underlying network call(s) may keep running in the background after this
// file records the row and moves on. This is not claimed as cancellation anywhere in this file's
// output (record, manifest, or report) — it is a known, honestly-documented limitation, not a bug
// to silently paper over. Fixing it would mean threading an `AbortSignal` through
// `runMultiTurnLocatorScenario` and every provider gateway's `chat()` — out of scope for this
// phase, which is deliberately kept to "reliable live multi-turn records."
// =============================================================================================

const raceWithTaskTimeout = async <T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
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

// =============================================================================================
// C. Per-attempt execution
// =============================================================================================

const ALL_MULTI_TURN_RECORDS: MultiTurnLiveRecord[] = [];

const lastReportedActualModel = (calls: readonly CapturedCallInfo[]): string | undefined => {
    for (let i = calls.length - 1; i >= 0; i -= 1) {
        if (calls[i].actualModel !== undefined) return calls[i].actualModel;
    }
    return undefined;
};

const runOneAttempt = async (
    entry: ProviderModelEntry,
    model: string,
    scenarioId: AnyMultiTurnScenarioId,
    attempt: number
): Promise<MultiTurnLiveRecord> => {
    // 1. Fresh gateway + fresh scenario canvas state for THIS attempt. `runMultiTurnLocatorScenario`
    // already builds a brand-new `createInMemoryCanvasBinding` internally on every call — no
    // canvas state is shared across attempts, scenarios, or repetitions.
    const baseGateway = createGatewayForEntry(entry, {
        apiKey: process.env[entry.apiKeyEnv] as string,
        model,
        environment: createVirtualAgentEnvironment(),
        http: createFetchHttpRequest(),
    });

    // 2/3. The wrapper's onUsage callback may fire once per gateway.chat() call inside the
    // multi-turn task (i.e. once per turn) — every firing is collected, in call order.
    const capturedCalls: CapturedCallInfo[] = [];
    const gateway = wrapGatewayWithUsageCapture(baseGateway, captured => {
        capturedCalls.push(captured);
    });

    const label = `${entry.displayName} ${model} ${scenarioId} attempt ${attempt}/${REPETITIONS}`;
    const startedAt = Date.now();

    try {
        // 4. One outer task timer around the COMPLETE runMultiTurnLocatorScenario() call.
        const result = await raceWithTaskTimeout(
            runMultiTurnLocatorScenario(gateway, scenarioId, { maxTurns: MAX_TURNS }),
            DEFAULT_TASK_TIMEOUT_MS,
            label
        );
        const endedAt = Date.now();
        // 5. Combine every captured call's usage into one accumulated figure for the whole task.
        const usage = accumulateExtendedUsage(capturedCalls);
        const actualModel = lastReportedActualModel(capturedCalls);
        const effectiveCost = resolveEffectiveCost(usage);

        // 6/7/8. One record per task; knownVariance is never consulted; outcome comes only from
        // result.taskOutcome (MultiTurnTaskOutcome), never from strategy.
        return {
            provider: entry.displayName,
            providerId: entry.providerId,
            requestedModel: model,
            ...(actualModel !== undefined ? { actualModel } : {}),
            scenarioId,
            attempt,
            repetitions: REPETITIONS,
            maxTurns: MAX_TURNS,
            outcome: result.taskOutcome,
            strategy: result.strategy,
            completionMode: result.completionMode,
            turnCount: result.turnCount,
            requestedToolSequence: result.toolSequence,
            turns: result.turns,
            // `runMultiTurnLocatorScenario` always returns positionsBefore/positionsAfter — on
            // every outcome it can itself produce, including 'provider-error' (see that function's
            // own `finalize` helper) — so these are unconditionally present here. The only outcome
            // with no positions at all is 'timeout', handled in the catch branch below, which never
            // reaches this return at all.
            positionsBefore: result.positionsBefore,
            positionsAfter: result.positionsAfter,
            finalStateCorrect: result.taskOutcome === 'success',
            startedAt,
            endedAt,
            elapsedMs: endedAt - startedAt,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            totalTokens: usage.totalTokens,
            ...(usage.cachedInputTokens !== undefined ? { cachedInputTokens: usage.cachedInputTokens } : {}),
            ...(usage.cacheWriteInputTokens !== undefined ? { cacheWriteInputTokens: usage.cacheWriteInputTokens } : {}),
            ...(usage.cacheWriteTtl !== undefined ? { cacheWriteTtl: usage.cacheWriteTtl } : {}),
            ...(usage.reasoningTokens !== undefined ? { reasoningTokens: usage.reasoningTokens } : {}),
            ...(usage.toolUseInputTokens !== undefined ? { toolUseInputTokens: usage.toolUseInputTokens } : {}),
            ...(usage.providerTotalTokens !== undefined ? { providerTotalTokens: usage.providerTotalTokens } : {}),
            ...(usage.providerReportedCost !== undefined ? { providerReportedCost: usage.providerReportedCost } : {}),
            ...(usage.estimatedCost !== undefined ? { estimatedCost: usage.estimatedCost } : {}),
            ...(effectiveCost !== undefined ? { effectiveCost } : {}),
            ...(usage.costSource !== undefined ? { costSource: usage.costSource } : {}),
            ...(usage.pricingVersion !== undefined ? { pricingVersion: usage.pricingVersion } : {}),
            ...(result.error ? { error: result.error } : {}),
        };
    } catch (err) {
        // Escaped entirely — in practice this is only our own timeout race; runMultiTurnLocatorScenario
        // itself never throws (a provider/gateway failure becomes taskOutcome: 'provider-error').
        // Recorded honestly with whatever usage was captured before the race was abandoned — see
        // the timeout doc above for why the underlying call(s) may still be running.
        const endedAt = Date.now();
        const message = err instanceof Error ? err.message : String(err);
        const outcome: MultiTurnReportingOutcome = message.includes(TIMEOUT_MARKER) ? 'timeout' : 'failure';
        const usage = accumulateExtendedUsage(capturedCalls);
        const actualModel = lastReportedActualModel(capturedCalls);
        const effectiveCost = resolveEffectiveCost(usage);

        return {
            provider: entry.displayName,
            providerId: entry.providerId,
            requestedModel: model,
            ...(actualModel !== undefined ? { actualModel } : {}),
            scenarioId,
            attempt,
            repetitions: REPETITIONS,
            maxTurns: MAX_TURNS,
            outcome,
            strategy: 'other',
            // Both `timeout` and `failure` here are non-success outcomes, so `completionMode` is
            // unconditionally `'none'`.
            completionMode: 'none',
            turnCount: 0,
            requestedToolSequence: [],
            turns: [],
            // No `MultiTurnLocatorScenarioResult` exists here at all — the race was lost before
            // `runMultiTurnLocatorScenario` returned, so there is no position snapshot to report.
            // Never fabricated as `{}`: absent means "not available", not "no nodes moved".
            finalStateCorrect: false,
            startedAt,
            endedAt,
            elapsedMs: endedAt - startedAt,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            totalTokens: usage.totalTokens,
            ...(effectiveCost !== undefined ? { effectiveCost } : {}),
            error: message.slice(0, ERROR_MESSAGE_LIMIT),
        };
    }
};

// =============================================================================================
// Test registration — one `it()` per (provider, model, scenario, repetition attempt). This is a
// PILOT collecting a distribution of outcomes, not a correctness gate: unlike the single-turn
// matrix's `expect(result.pass).toBe(true)`, a `failure`/`provider-error`/`timeout`/`max-turns`
// outcome here is expected, measured data, not a broken test — so no `it()` below asserts on
// `outcome`. The point of this file is the recorded distribution in the generated report, not a
// green/red CI signal per attempt.
// =============================================================================================

for (const { entry, model, willRun } of SELECTED_PAIRS) {
    describe.runIf(willRun)(`${entry.displayName} multi-turn pilot (env-gated) — ${model}`, () => {
        for (const scenarioId of SELECTED_SCENARIOS) {
            for (let attempt = 1; attempt <= REPETITIONS; attempt += 1) {
                it(
                    `${scenarioId} attempt ${attempt}/${REPETITIONS}`,
                    async () => {
                        const record = await runOneAttempt(entry, model, scenarioId, attempt);
                        ALL_MULTI_TURN_RECORDS.push(record);
                        expect(record.scenarioId).toBe(scenarioId);
                    },
                    DEFAULT_TASK_TIMEOUT_MS + VITEST_TIMEOUT_BUFFER_MS
                );
            }
        }
    });
}

// =============================================================================================
// F/G/I. Report + run manifest — written only when at least one task actually ran this session
// (no API keys / not opted in => ALL_MULTI_TURN_RECORDS stays empty => nothing written, matching
// the single-turn runner's "never write a fake/empty artifact" rule).
// =============================================================================================

/** Best-effort, never-throwing git SHA + dirty-status lookup — `null` for either field when it
 * can't be safely determined (no `.git`, `git` unavailable, or any other failure). No repository
 * helper for this already exists in the codebase, so this is a small local, defensive one; it
 * never reads or logs anything beyond the commit hash and a clean/dirty boolean. */
const readGitState = (): { sha: string | null; dirty: boolean | null } => {
    const repoRoot = join(__dirname, '../../../../../');
    try {
        const sha = execSync('git rev-parse HEAD', { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] })
            .toString()
            .trim();
        const status = execSync('git status --porcelain', { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
        return { sha: sha || null, dirty: status.trim().length > 0 };
    } catch {
        return { sha: null, dirty: null };
    }
};

afterAll(() => {
    if (ALL_MULTI_TURN_RECORDS.length === 0) {
        console.log('\n[realMultiTurnLocatorScenarios] no live multi-turn tasks ran this session — no artifact written.');
        return;
    }

    const generatedAt = new Date().toISOString();
    const report = buildMultiTurnVerificationReport(ALL_MULTI_TURN_RECORDS, generatedAt);

    const markdown =
        `# Multi-turn locator pilot — generated ${report.generatedAt}\n\n` +
        `Source: \`realMultiTurnLocatorScenarios.spec.ts\` (registry-driven multi-turn pilot, up to ` +
        `${MAX_TURNS} turns/task, ${REPETITIONS} repetition(s)/scenario). Separate from, and never merged ` +
        `with, the single-turn report at \`docs/browser-agent/verification-metrics/latest.md\`. Overwrites ` +
        `only this session's own output in \`multi-turn/\` — no cross-session carry-forward yet (see the ` +
        `run manifest for exactly what this session covered).\n\n` +
        `A lookup-first attempt counts toward \`Success\`/\`Lookup-first\` only when its task outcome is ` +
        `\`success\` — a lookup-first \`provider-error\`, \`timeout\`, or \`max-turns\` is never counted as ` +
        `"accepted" merely because its strategy looks reasonable; see the failure/provider-error/timeout/ ` +
        `max-turns columns for those.\n\n` +
        `## Generation configuration\n\n${formatGenerationConfigurationMarkdown(GENERATION_CONFIGURATION)}\n\n` +
        `## By model (initial strategy)\n\n${formatMultiTurnModelSummaryMarkdownTable(report.modelSummaries)}\n\n` +
        `## By model (completion mode)\n\n${formatMultiTurnCompletionModeMarkdownTable(report.modelSummaries)}\n\n` +
        `## By scenario\n\n${formatMultiTurnScenarioMarkdownTable(report.scenarioSummaries)}\n\n` +
        `## Attempt-level details\n\n${formatMultiTurnRecordsMarkdownDetails(report.records)}\n`;

    const gitState = readGitState();
    const manifest: MultiTurnRunManifest = {
        generatedAt,
        liveMultiTurnTestsOptedIn: LIVE_RUN_OPTED_IN,
        providerFilter: PROVIDER_FILTER ?? null,
        modelFilter: MODEL_FILTER ?? null,
        requestedModels: MODEL_SELECTION.requestedModels,
        selectedScenarios: SELECTED_SCENARIOS,
        repetitions: REPETITIONS,
        maxTurns: MAX_TURNS,
        taskTimeoutMs: DEFAULT_TASK_TIMEOUT_MS,
        plannedPairs: PLANNED_PAIRS,
        expectedTaskCount: SELECTED_PAIRS.filter(p => p.willRun).length * SELECTED_SCENARIOS.length * REPETITIONS,
        sourceSessionId: generatedAt,
        pricingVersion: PRICING_CONFIG_VERSION,
        gitSha: gitState.sha,
        gitDirty: gitState.dirty,
        generationConfiguration: GENERATION_CONFIGURATION,
    };

    // One consolidated set of artifacts per invocation — covering every selected model/pair
    // together — never one set per model and never merged from separate temporary directories.
    mkdirSync(METRICS_DIR, { recursive: true });
    writeFileSync(METRICS_MD_PATH, markdown);
    writeFileSync(METRICS_JSON_PATH, JSON.stringify(report, null, 2));
    writeFileSync(METRICS_CSV_PATH, formatMultiTurnRecordsCsv(report.records));
    writeFileSync(METRICS_JSONL_PATH, formatMultiTurnRecordsJsonl(report.records));
    writeFileSync(METRICS_HTML_PATH, buildMultiTurnDashboardHtml(report));
    writeFileSync(RUN_MANIFEST_PATH, JSON.stringify(manifest, null, 2));

    console.log(
        `\n[realMultiTurnLocatorScenarios] wrote ${METRICS_MD_PATH}, ${METRICS_JSON_PATH}, ${METRICS_CSV_PATH}, ` +
            `${METRICS_JSONL_PATH}, ${METRICS_HTML_PATH}, ${RUN_MANIFEST_PATH}`
    );
});
