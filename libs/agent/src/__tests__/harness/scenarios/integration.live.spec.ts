/**
 * LIVE evaluation of the orchestrator against a REAL Gemini key — the scenarios in
 * docs/browser-agent/design/harness-scenarios.md, driven end-to-end with **no browser and no backend**.
 *
 * How it differs from integration.spec.ts:
 *   - integration.spec.ts is DETERMINISTIC — it scripts every tool call via the fake gateway and asserts
 *     the exact oracle. It always runs.
 *   - THIS file is an EVAL — it hands the orchestrator + specialists a real function-calling Gemini
 *     gateway (createGeminiLlmGateway, capabilities.toolCalls === true) and only checks the OUTCOME +
 *     the graph oracle from the doc. The model decides the tool calls, so a case can legitimately fail
 *     if the model misbehaves — that is the signal.
 *
 * OPT-IN: this eval hits the real Gemini API, so it runs ONLY when RUN_LIVE is set — a key in .env.local
 * is not enough. `nx test` and CI leave RUN_LIVE unset, so the whole suite stays offline and deterministic.
 *
 * Key: put GEMINI_API_KEY (and optionally GEMINI_MODEL) in the repo-root .env.local — this spec loads it
 * on import (../../loadEnvLocal), so no command prefix is needed. Inline `GEMINI_API_KEY=... ` still works too.
 *
 * Run all:      RUN_LIVE=1 npx vitest run libs/agent/src/__tests__/harness/scenarios/integration.live.spec.ts
 * One case:     RUN_LIVE=1 npx vitest run libs/agent/src/__tests__/harness/scenarios/integration.live.spec.ts -t A1
 * Bigger model: RUN_LIVE=1 GEMINI_MODEL=gemini-2.5-pro npx vitest run libs/agent/src/__tests__/harness/scenarios/integration.live.spec.ts
 * Chat log:     LIVE_VERBOSE=1 npx vitest run .../scenarios/integration.live.spec.ts -t A1      # each agent's turn (truncated)
 * Full text:    LIVE_VERBOSE=full npx vitest run .../scenarios/integration.live.spec.ts -t A1   # same, nothing truncated
 *
 * Headless: createVirtualAgentEnvironment (Node) + createFetchHttpRequest (global fetch) + a direct
 * call to generativelanguage.googleapis.com. No DOM, no flow socket, no block API.
 */
import '../../loadEnvLocal'; // FIRST: load repo-root .env.local so GEMINI_API_KEY is set before the gate below

import { afterAll, describe, expect, it } from 'vitest';

import { GENERATOR_MODELS, IDS, makeInitialGraph, nodeById } from '../fixtures';
import { resolveLiveGateway } from '../liveGateway';
import { runScenario } from '../runScenario';
import { outcomeText } from '../turnOutcome';
import { verboseGateway } from '../verboseGateway';

import type { ScenarioInput, TurnResult } from '../runScenario';

const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
// A single tool-capable gateway shared by the orchestrator + every spawned specialist; one seam picks the
// provider — Vertex when VERTEX_* env is set (draws the $300 credit), else the Developer API key, else
// undefined (vertex-migration.md). Each chat() is an independent generateContent call, so one instance is fine.
const gateway = resolveLiveGateway({
    model,
    // temperature: 0 → greedy decoding, the most repeatable output a real model gives (the eval still
    // tolerates non-determinism, but this cuts it). Keep thinking but BOUND it and leave ample output
    // room: gemini-2.5-flash otherwise sometimes spends its whole output budget on thoughts and returns
    // an empty candidate. The invariant is maxOutputTokens ≫ thinkingBudget; thinkingBudget: 0 disables thinking.
    generation: { temperature: 0, thinkingBudget: 1024, maxOutputTokens: 8192 },
});
// Opt-in gate: live specs hit the real API, so they run only when RUN_LIVE is set — a key in .env.local
// is not enough (else `nx test` would run them). Run live with `RUN_LIVE=1 npx vitest run <file>`.
const SKIP_LIVE = !gateway || !process.env.RUN_LIVE;

// Live multi-agent turns are several network round-trips; give each case room.
const TIMEOUT_MS = 120_000;

// Opt-in chat log: `LIVE_VERBOSE=1` wraps each agent's gateway to print its received messages +
// responses to the terminal (see verboseGateway). `LIVE_VERBOSE=full` prints everything verbatim (no
// truncation) — for reading a whole system prompt or tool result. Off by default: only the outcome line prints.
const VERBOSE = !!process.env.LIVE_VERBOSE;
const VERBOSE_FULL = process.env.LIVE_VERBOSE === 'full';

// Every case records what the model actually did here, so `afterAll` can print ONE final scorecard even
// when individual cases fail their oracle. A case that fails is a data point, not a stop — the whole
// matrix always runs to the end (vitest never bails), and the summary makes the final picture unmissable.
const evalSummary: { label: string; status: string; committed: boolean; detail: string }[] = [];

/** Run one objective live (real gateway, no script), log what the model did, and record it for the summary. */
const runLive = async (label: string, input: Omit<ScenarioInput, 'makeGateway' | 'script'>): Promise<TurnResult> => {
    if (VERBOSE) console.log(`\n━━━━━━━━ ${label} · "${input.objective}" ━━━━━━━━`);
    // A fresh verbose wrapper per agent (labelled by type) so each turn's chat is attributed; the real
    // Gemini gateway underneath is shared. Without the flag, every agent shares the one gateway directly.
    const makeGateway = VERBOSE
        ? (agentType: string) => verboseGateway(gateway!, agentType, VERBOSE_FULL)
        : () => gateway!;
    let result: TurnResult;
    try {
        result = await runScenario({ ...input, makeGateway });
    } catch (err) {
        // A thrown error (network / rate-limit) is recorded and re-thrown as a normal test failure — it
        // never escapes as an unhandled rejection, so the remaining cases still run.
        evalSummary.push({
            label,
            status: 'ERROR',
            committed: false,
            detail: err instanceof Error ? err.message : String(err),
        });
        throw err;
    }
    // Surface what actually happened — invaluable when a live case fails.
    console.log(`[${label}] outcome:`, JSON.stringify(result.outcome), '| committed:', result.committed);
    evalSummary.push({
        label,
        status: result.outcome.status,
        committed: result.committed,
        detail: outcomeText(result.outcome),
    });
    return result;
};

/** No-edit oracle: nothing committed and the graph is byte-identical to the fixture. */
const expectUnchanged = (result: TurnResult): void => {
    expect(result.committed).toBe(false);
    expect(result.graph).toEqual(makeInitialGraph());
};

describe.skipIf(SKIP_LIVE)('Harness scenarios — LIVE against a real Gemini key', () => {
    // Print ONE scorecard after the whole matrix has run — the model's outcome for every scenario, so the
    // final results are unmistakable regardless of how many cases failed their oracle (✓/× above is the
    // pass/fail vs the oracle; this is WHAT the model did, incl. the reason a case missed).
    afterAll(() => {
        if (evalSummary.length === 0) return;
        const rows = evalSummary
            .map(r => {
                const committed = r.committed ? 'committed' : '—        ';
                return `  ${r.label.padEnd(3)} ${r.status.padEnd(20)} ${committed}  ${r.detail.replace(/\s+/g, ' ').slice(0, 88)}`;
            })
            .join('\n');
        console.log(
            `\n━━━━━━━━━━ LIVE EVAL SUMMARY (${evalSummary.length} scenarios, model=${model}) ━━━━━━━━━━\n${rows}\n` +
                `  (pass/fail vs the oracle is the ✓/× list above; a live case can miss on model non-determinism)`
        );
    });

    // ── applied ──────────────────────────────────────────────────────────────────────────────────
    it(
        'A1 — nudge the input right a bit (relational: x↑, y=)',
        async () => {
            const before = nodeById(makeInitialGraph(), IDS.txt).position;
            const result = await runLive('A1', {
                objective: 'nudge the input right a bit',
                initialGraph: makeInitialGraph(),
            });

            expect(result.outcome.status).toBe('applied');
            const after = nodeById(result.graph, IDS.txt).position;
            expect(after.x).toBeGreaterThan(before.x); // relational — never assert ==120
            expect(after.y).toBe(before.y);
            // the other three nodes are untouched
            for (const id of [IDS.buf, IDS.gen, IDS.prev]) {
                expect(nodeById(result.graph, id).position).toEqual(nodeById(makeInitialGraph(), id).position);
            }
            expect(result.committed).toBe(true);
        },
        TIMEOUT_MS
    );

    it(
        "A2 — set the generator's model to Gemini 2.5 Pro (merge keeps temperature)",
        async () => {
            const result = await runLive('A2', {
                objective: "set the generator's model to Gemini 2.5 Pro",
                initialGraph: makeInitialGraph(),
            });

            expect(result.outcome.status).toBe('applied');
            expect(nodeById(result.graph, IDS.gen).config?.model).toBe('gemini-2.5-pro');
            expect(nodeById(result.graph, IDS.gen).config?.temperature).toBe('0.7'); // preserved by the merge
        },
        TIMEOUT_MS
    );

    it(
        "A3 — rename the preview to 'Result'",
        async () => {
            const result = await runLive('A3', {
                objective: "rename the preview to 'Result'",
                initialGraph: makeInitialGraph(),
            });

            expect(result.outcome.status).toBe('applied');
            expect(nodeById(result.graph, IDS.prev).customLabel).toBe('Result');
        },
        TIMEOUT_MS
    );

    it(
        'A4 — line the four up on one column (four x equal, y kept)',
        async () => {
            const result = await runLive('A4', {
                objective:
                    'line the four nodes up in one column (same x), keeping each node’s current vertical (y) position',
                initialGraph: makeInitialGraph(),
            });

            expect(result.outcome.status).toBe('applied');
            const xs = [IDS.txt, IDS.buf, IDS.gen, IDS.prev].map(id => nodeById(result.graph, id).position.x);
            expect(new Set(xs).size).toBe(1); // all four share one column — never assert a specific value
            // y's preserved
            for (const id of [IDS.txt, IDS.buf, IDS.gen, IDS.prev]) {
                expect(nodeById(result.graph, id).position.y).toBe(nodeById(makeInitialGraph(), id).position.y);
            }
            expect(result.committed).toBe(true);
        },
        TIMEOUT_MS
    );

    // ── applied (structural: node + edge composition) ─────────────────────────────────────────────
    it(
        'A5 — delete the buffer AND rewire input→generator (node + edge → applied)',
        async () => {
            const result = await runLive('A5', {
                objective: 'delete the buffer node and connect the input directly to the generator',
                initialGraph: makeInitialGraph(),
            });

            expect(result.outcome.status).toBe('applied');
            expect(result.committed).toBe(true);
            // the buffer is gone and no edge references it
            expect(result.graph.nodes.some(n => n.id === IDS.buf)).toBe(false);
            expect(result.graph.edges.some(e => e.sourceNodeId === IDS.buf || e.targetNodeId === IDS.buf)).toBe(false);
            // the input now feeds the generator directly
            expect(result.graph.edges.some(e => e.sourceNodeId === IDS.txt && e.targetNodeId === IDS.gen)).toBe(true);
        },
        TIMEOUT_MS
    );

    // ── refused — needs a decision from the user (ambiguity / invalid input) ────────────────────────
    it(
        'Q1 — move "the node" right (ambiguous → refused, asks which)',
        async () => {
            const result = await runLive('Q1', { objective: 'move the node right', initialGraph: makeInitialGraph() });

            expect(result.outcome.status).toBe('refused');
            expectUnchanged(result);
        },
        TIMEOUT_MS
    );

    it(
        'Q2 — set model to gpt-4o (invalid value → refused, lists valid models)',
        async () => {
            const result = await runLive('Q2', {
                objective: "set the generator's model to gpt-4o",
                initialGraph: makeInitialGraph(),
            });

            expect(result.outcome.status).toBe('refused');
            if (result.outcome.status === 'refused') {
                // the reason should offer at least one real model option
                expect(
                    GENERATOR_MODELS.some(m => result.outcome.status === 'refused' && result.outcome.reason.includes(m))
                ).toBe(true);
            }
            expectUnchanged(result);
        },
        TIMEOUT_MS
    );

    it(
        'Q3 — move the "fetch" node right (no such node → refused)',
        async () => {
            const result = await runLive('Q3', {
                objective: 'move the fetch node right',
                initialGraph: makeInitialGraph(),
            });

            expect(result.outcome.status).toBe('refused');
            expectUnchanged(result);
        },
        TIMEOUT_MS
    );

    it(
        "Q4 — set a config field the block doesn't have (unknown key → refused)",
        async () => {
            const result = await runLive('Q4', {
                objective: "set the generator's max tokens to 500",
                initialGraph: makeInitialGraph(),
            });

            // maxTokens isn't in the generator's schema (model/temperature/topK). The agent must not
            // invent it or map it onto a real field — nothing changes, and it reports why.
            expect(result.outcome.status).toBe('refused');
            expectUnchanged(result);
        },
        TIMEOUT_MS
    );

    // ── refused ──────────────────────────────────────────────────────────────────────────────────
    it(
        'R1 — run the generator (only task; no run specialist → refused)',
        async () => {
            // Structural edits are covered now (node/edge); this keeps the capability-gap refusal on a
            // genuinely-unsupported ask — no specialist executes nodes.
            const result = await runLive('R1', {
                objective: 'run the generator node',
                initialGraph: makeInitialGraph(),
            });

            expect(result.outcome.status).toBe('refused');
            expectUnchanged(result);
        },
        TIMEOUT_MS
    );

    it(
        'R2 — rename the preview as a viewer (empty userPermissions → permission denied → refused)',
        async () => {
            const result = await runLive('R2', {
                objective: "rename the preview to 'Result'",
                initialGraph: makeInitialGraph(),
                userPermissions: {}, // viewer ⇒ rename denied at the executor's requires-gate
            });

            expect(result.outcome.status).toBe('refused');
            expectUnchanged(result);
        },
        TIMEOUT_MS
    );
});
