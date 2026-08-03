/**
 * EVAL BENCHMARK — comparing two designs by CORRECTNESS (docs/browser-agent/design/eval-benchmark.md).
 *
 * The SAME design-agnostic scenario ladder is run against the TWO designs — Strategy 1 (orchestrator fans out
 * to narrow specialists; the `fanoutRoster` = every registration EXCEPT the builder) and Strategy 2 (the
 * orchestrator hands the whole plan to one `builder`; the `builderRoster` = only the builder). Both go through
 * the shipped `runScenario`; they differ ONLY in the roster exposed (the one seam runScenario now forwards).
 * A shared oracle reads only the three public observables — { outcome, graph, committed } — so the comparison
 * is honest. There is no token/time metering: correctness (oracle pass-rate) is the only axis.
 *
 * LIVE-ONLY: under the fake gateway both designs replay identical scripts, so the A/B is vacuous. This eval
 * therefore hands both designs a REAL function-calling Gemini gateway and only runs when RUN_LIVE is set — a
 * key in .env.local is not enough. `nx test` and CI leave RUN_LIVE unset, so the suite stays offline.
 *
 * The final scorecard (afterAll) is the deliverable: pass-rate per (scenario × design), side by side, plus a
 * per-scenario winner. The per-`it` ✓/✗ is only harness sanity (the turn ran) — a design MISSING a scenario is
 * the SIGNAL, recorded in the scorecard, not a harness failure.
 *
 * LOGS: every run auto-saves to the gitignored `bench-runs/` dir (repo root), NO flags needed:
 *   - <base>.transcript.log — the FULL run: every agent's system prompt, the user/tool-result messages it
 *     received, and the assistant text + tool CALLS + tool RESULTS it produced, verbatim & untruncated,
 *     delimited per (scenario · design · run). This is the "examine everything" log.
 *   - <base>.txt — the scorecard.   <base>.json — the raw cells[].   (base = eval-benchmark_<model>_N<n>_<ts>)
 *   - latest.{transcript.log,txt,json} — the most recent run, for quick diffing.
 * Override the dir with BENCH_OUT=/path. LIVE_VERBOSE=1 additionally streams the same transcript to the console.
 *
 * Run smoke (a few scenarios per tier, N=1):
 *   RUN_LIVE=1 npx vitest run libs/agent/src/__tests__/harness/scenarios/eval-benchmark.live.spec.ts
 * One scenario:   RUN_LIVE=1 npx vitest run .../eval-benchmark.live.spec.ts -t T4.build-pipeline
 * More runs:      RUN_LIVE=1 BENCH_N=5 npx vitest run .../eval-benchmark.live.spec.ts
 * Bigger model:   RUN_LIVE=1 GEMINI_MODEL=gemini-2.5-pro npx vitest run .../eval-benchmark.live.spec.ts
 * Full chat log:  LIVE_VERBOSE=1 RUN_LIVE=1 npx vitest run .../eval-benchmark.live.spec.ts -t T2.delete > bench-runs/mylog.txt 2>&1
 */
import '../../loadEnvLocal'; // FIRST: load repo-root .env.local so GEMINI_API_KEY is set before the gate below

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { DEFAULT_REGISTRATIONS, createAgentRoster } from '../../../agents';
import { createVirtualAgentEnvironment } from '../../../environment/createVirtualAgentEnvironment';
import { createFetchHttpRequest } from '../../../http/FetchHttpRequest';
import { createGeminiLlmGateway } from '../../../llm/GeminiLlmGateway';
import { GENERATOR_MODELS, IDS, makeInitialGraph } from '../fixtures';
import { runScenario } from '../runScenario';
import { outcomeText } from '../turnOutcome';

import type { AgentRoster } from '../../../agents';
import type { Graph } from '../../../canvas/canvasBinding';
import type { ChatMessage, ChatRequest, Chunk, LlmGateway } from '../../../llm/llmGateway';
import type { AgentGrant } from '../../../permissions';
import type { TurnOutcome } from '../turnOutcome';

// ── live gate + gateway ──────────────────────────────────────────────────────────────────────────
const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
const SKIP_LIVE = !apiKey || !process.env.RUN_LIVE;
const N = Math.max(1, Number(process.env.BENCH_N ?? '1')); // runs per (scenario × design); smoke default 1
const VERBOSE = !!process.env.LIVE_VERBOSE; // ALSO echo the transcript to the console (it is ALWAYS saved to file)
const TIMEOUT_MS = 240_000 * N; // a live multi-agent turn (+ the outcome re-ask) is several round-trips

const gateway = apiKey
    ? createGeminiLlmGateway({
          environment: createVirtualAgentEnvironment(),
          http: createFetchHttpRequest(),
          apiKey,
          model,
          // temperature 0 → the most repeatable output a real model gives; bound thinking, leave output room.
          generation: { temperature: 0, thinkingBudget: 1024, maxOutputTokens: 8192 },
      })
    : undefined;

// ── full-transcript recorder ───────────────────────────────────────────────────────────────────────
// Every LLM round-trip of every agent (orchestrator + each spawned specialist/builder) flows through the
// makeGateway seam, so wrapping it captures the WHOLE run VERBATIM: each agent's system prompt, the user /
// tool-result messages it receives, and the assistant text + tool CALLS it emits. Tool RESULTS reappear as
// role:'tool' messages on the next call, so they are captured too. Unlike verboseGateway (console-only,
// truncated) this ALWAYS appends to a durable sink, untruncated — the run's examinable record. Written to a
// per-run *.transcript.log by afterAll; LIVE_VERBOSE additionally echoes it to the console.
const transcript: string[] = [];
const rec = (line: string): void => {
    transcript.push(line);
    if (VERBOSE) console.log(line);
};
const recordingGateway = (inner: LlmGateway, label: string): LlmGateway => {
    const clean = (s: string | null | undefined): string => (s ?? '').replace(/\r\n/g, '\n'); // verbatim, no truncation
    // Log only messages this agent has not logged yet (its history grows each iteration). Assistant messages
    // are NOT re-logged here — they are captured as ▶ says / ▶ calls when generated, below.
    const logReceive = (m: ChatMessage): void => {
        if (m.role === 'system') rec(`  ⟨${label}⟩ ◀ system : ${clean(m.content)}`);
        else if (m.role === 'tool') rec(`  ⟨${label}⟩ ◀ result : [${m.toolCallId ?? '?'}] ${clean(m.content)}`);
        else if (m.role === 'user') rec(`  ⟨${label}⟩ ◀ user   : ${clean(m.content)}`);
    };
    let printed = 0;
    return {
        capabilities: inner.capabilities,
        async *chat(req: ChatRequest, opts?: { signal?: AbortSignal }): AsyncIterable<Chunk> {
            for (let i = printed; i < req.messages.length; i += 1) logReceive(req.messages[i]);
            printed = req.messages.length;
            const acc = new Map<string, { name: string; args: string }>();
            const order: string[] = [];
            let text = '';
            for await (const chunk of inner.chat(req, opts)) {
                if (chunk.text) text += chunk.text;
                if (chunk.toolCall) {
                    const { id, name, argsDelta } = chunk.toolCall;
                    const cur = acc.get(id);
                    if (cur) cur.args += argsDelta;
                    else {
                        order.push(id);
                        acc.set(id, { name, args: argsDelta });
                    }
                }
                yield chunk;
            }
            if (text.trim()) rec(`  ⟨${label}⟩ ▶ says   : ${clean(text)}`);
            for (const id of order) {
                const c = acc.get(id) as { name: string; args: string };
                rec(`  ⟨${label}⟩ ▶ calls  : ${c.name}(${c.args})`);
            }
            if (!text.trim() && order.length === 0) rec(`  ⟨${label}⟩ ▶ (no text, no tool calls)`);
        },
    };
};

// ── the two designs — same runScenario, one roster apart (§0/§1) ───────────────────────────────────
interface BenchmarkInput {
    objective: string;
    initialGraph: Graph;
    userPermissions?: AgentGrant;
}
interface BenchmarkResult {
    outcome: TurnOutcome;
    graph: Graph;
    committed: boolean;
}
interface RunAdapter {
    readonly designId: string;
    run(input: BenchmarkInput): Promise<BenchmarkResult>;
}

/** Strategy 1: every registration EXCEPT the builder — the orchestrator must coordinate narrow specialists. */
const fanoutRoster: AgentRoster = createAgentRoster(DEFAULT_REGISTRATIONS.filter(r => r.type !== 'builder'));
/** Strategy 2: ONLY the builder — the orchestrator hands it the whole plan and it edits single-handedly. */
const builderRoster: AgentRoster = createAgentRoster(DEFAULT_REGISTRATIONS.filter(r => r.type === 'builder'));

/** An adapter is a one-liner over runScenario that only swaps the roster; every agent's gateway is recorded. */
const makeAdapter = (designId: string, roster: AgentRoster): RunAdapter => ({
    designId,
    async run({ objective, initialGraph, userPermissions }) {
        const { outcome, graph, committed } = await runScenario({
            objective,
            initialGraph,
            userPermissions,
            roster,
            makeGateway: (agentType: string) => recordingGateway(gateway!, `${designId}:${agentType}`),
        });
        return { outcome, graph, committed };
    },
});

const DESIGNS: RunAdapter[] = [
    makeAdapter('strategy-1-fanout', fanoutRoster),
    makeAdapter('strategy-2-builder', builderRoster),
];

// ── oracle helpers — pure over Graph (§2) ──────────────────────────────────────────────────────────
const findNode = (g: Graph, id: string) => g.nodes.find(n => n.id === id);
const edgeExists = (g: Graph, s: string, t: string) => g.edges.some(e => e.sourceNodeId === s && e.targetNodeId === t);
const hasNodeOfType = (g: Graph, type: string) => g.nodes.some(n => n.type === type);
const sameGraph = (a: Graph, b: Graph) => JSON.stringify(a) === JSON.stringify(b);
/** No-edit oracle for refused/answered: nothing committed AND the graph is byte-identical to the initial. */
const unchanged = (r: BenchmarkResult, initial: Graph) => r.committed === false && sameGraph(r.graph, initial);

/** A directed path a ⇒ … ⇒ b exists (BFS over sourceNodeId→targetNodeId). */
const reaches = (g: Graph, a: string, b: string): boolean => {
    if (a === b) return true;
    const seen = new Set<string>([a]);
    const queue = [a];
    while (queue.length) {
        const cur = queue.shift() as string;
        for (const e of g.edges) {
            if (e.sourceNodeId === cur && !seen.has(e.targetNodeId)) {
                if (e.targetNodeId === b) return true;
                seen.add(e.targetNodeId);
                queue.push(e.targetNodeId);
            }
        }
    }
    return false;
};
/** ∃ a directed dataflow chain threading nodes of these types, in order (§2.1 typed-path embedding). */
const embedsTypedPath = (g: Graph, types: string[]): boolean => {
    const idsOf = (t: string): string[] =>
        g.nodes
            .filter(n => n.type === t)
            .map(n => n.id)
            .filter((id): id is string => !!id);
    const first = types[0];
    if (!first) return false;
    let frontier = idsOf(first);
    if (!frontier.length) return false;
    for (const t of types.slice(1)) {
        frontier = idsOf(t).filter(dst => frontier.some(src => src !== dst && reaches(g, src, dst)));
        if (!frontier.length) return false;
    }
    return true;
};

interface Verdict {
    pass: boolean;
    note?: string;
}
interface Scenario {
    id: string;
    tier: number;
    objective: string;
    initial: () => Graph;
    userPermissions?: AgentGrant;
    expect: TurnOutcome['status'];
    oracle: (r: BenchmarkResult, initial: Graph) => Verdict;
}

const EMPTY = (): Graph => ({ nodes: [], edges: [] });

/** The fixture chain with the buffer removed: input-text → generator → preview. The T5.insert-between start. */
const makeNoBufferGraph = (): Graph => {
    const g = makeInitialGraph();
    return {
        nodes: g.nodes.filter(n => n.id !== IDS.buf),
        edges: [
            { id: 'e_txt_gen', sourceNodeId: IDS.txt, sourcePortId: 'out', targetNodeId: IDS.gen, targetPortId: 'in' },
            {
                id: 'e_gen_prev',
                sourceNodeId: IDS.gen,
                sourcePortId: 'out',
                targetNodeId: IDS.prev,
                targetPortId: 'in',
            },
        ],
    };
};

// ── the smoke ladder: a few scenarios per tier (§4), oracles as strict as the intent fixes (§2) ─────
const SMOKE: Scenario[] = [
    {
        id: 'T0.config',
        tier: 0,
        objective: "set the generator's temperature to 0.2",
        initial: makeInitialGraph,
        expect: 'applied',
        oracle: r => {
            const gen = findNode(r.graph, IDS.gen);
            if (!gen) return { pass: false, note: 'generator node missing' };
            if (gen.config?.temperature !== '0.2') {
                return { pass: false, note: `temperature=${gen.config?.temperature}` };
            }
            if (gen.config?.model !== 'gemini-2.5-flash') {
                return { pass: false, note: `model not preserved (=${gen.config?.model})` };
            }
            return { pass: r.committed, note: r.committed ? undefined : 'nothing committed' };
        },
    },
    {
        id: 'T1.model-merge',
        tier: 1,
        objective: "set the generator's model to Gemini 2.5 Pro",
        initial: makeInitialGraph,
        expect: 'applied',
        oracle: r => {
            const gen = findNode(r.graph, IDS.gen);
            if (!gen) return { pass: false, note: 'generator node missing' };
            if (gen.config?.model !== 'gemini-2.5-pro') return { pass: false, note: `model=${gen.config?.model}` };
            // the merge must keep the pre-set temperature (the whole point of the case)
            if (gen.config?.temperature !== '0.7') {
                return { pass: false, note: `temperature not preserved (=${gen.config?.temperature})` };
            }
            return { pass: true };
        },
    },
    {
        id: 'T2.delete-rewire',
        tier: 2,
        objective: 'delete the buffer node and connect the input directly to the generator',
        initial: makeInitialGraph,
        expect: 'applied',
        oracle: r => {
            const g = r.graph;
            if (findNode(g, IDS.buf)) return { pass: false, note: 'buffer still present' };
            if (g.edges.some(e => e.sourceNodeId === IDS.buf || e.targetNodeId === IDS.buf)) {
                return { pass: false, note: 'a dangling edge still references the buffer' };
            }
            if (!edgeExists(g, IDS.txt, IDS.gen)) return { pass: false, note: 'input not wired to generator' };
            return { pass: r.committed };
        },
    },
    {
        id: 'T2.bad-value',
        tier: 2,
        objective: "set the generator's model to gpt-4o",
        initial: makeInitialGraph,
        expect: 'refused',
        oracle: (r, initial) => {
            // gpt-4o is not a valid GENERATOR_MODELS value — the agent must NOT edit; the graph must be untouched.
            if (!unchanged(r, initial)) {
                return { pass: false, note: r.committed ? 'edited despite the bad value' : 'graph changed' };
            }
            const reason = r.outcome.status === 'refused' ? r.outcome.reason : '';
            const namesReal = GENERATOR_MODELS.some(m => reason.includes(m));
            return { pass: true, note: namesReal ? undefined : `refused but reason did not name a real model` };
        },
    },
    {
        // The generator's input is already fed by the buffer, but connecting the input to the generator is
        // COMPLETABLE: the agent frees the occupied input (disconnects the buffer's edge into it) and connects.
        // APPLIED is correct — the agent doesn't need permission to change the canvas; it refuses only the
        // genuinely impossible (see T2.bad-value). No golden graph: just assert the input now drives the generator.
        id: 'T2.occupied-input',
        tier: 2,
        objective: 'connect the input directly into the generator',
        initial: makeInitialGraph,
        expect: 'applied',
        oracle: r => {
            const g = r.graph;
            if (!edgeExists(g, IDS.txt, IDS.gen)) return { pass: false, note: 'input not wired to the generator' };
            if (edgeExists(g, IDS.buf, IDS.gen)) {
                return { pass: false, note: 'buffer still occupies the generator input' };
            }
            return { pass: r.committed };
        },
    },
    {
        id: 'T3.reroute',
        tier: 3,
        objective: "make the preview show the buffer's output instead of the generator's",
        initial: makeInitialGraph,
        expect: 'applied',
        oracle: r => {
            const g = r.graph;
            if (!edgeExists(g, IDS.buf, IDS.prev)) return { pass: false, note: 'preview not fed by the buffer' };
            if (edgeExists(g, IDS.gen, IDS.prev)) return { pass: false, note: 'old generator→preview edge remains' };
            if (g.nodes.length !== 4) return { pass: false, note: `node count changed (=${g.nodes.length})` };
            return { pass: r.committed };
        },
    },
    {
        id: 'T4.build-pipeline',
        tier: 4,
        objective: 'build a flow that takes a text input, runs it through a generator, and previews the result',
        initial: EMPTY,
        expect: 'applied',
        oracle: r => {
            const g = r.graph;
            const required = ['input-text', 'single-output-generator', 'output-preview'];
            const missing = required.filter(t => !hasNodeOfType(g, t));
            if (missing.length) return { pass: false, note: `missing node type(s): ${missing.join(', ')}` };
            if (!embedsTypedPath(g, required)) return { pass: false, note: 'no input→generator→preview dataflow path' };
            if (g.nodes.length < 3) return { pass: false, note: `fewer than 3 nodes (=${g.nodes.length})` };
            return { pass: r.committed };
        },
    },
    {
        // Refactor / splice (§2.1 relational): start from txt → gen → prev, insert a buffer onto the gen→prev
        // path. Verify the DELTA (a buffer now sits between gen and prev) AND that the direct edge is gone —
        // no golden graph, any ids/positions accepted.
        id: 'T5.insert-between',
        tier: 5,
        objective: 'insert a buffer between the generator and the preview',
        initial: makeNoBufferGraph,
        expect: 'applied',
        oracle: r => {
            const g = r.graph;
            if (!hasNodeOfType(g, 'buffer')) return { pass: false, note: 'no buffer node added' };
            if (!embedsTypedPath(g, ['single-output-generator', 'buffer', 'output-preview'])) {
                return { pass: false, note: 'buffer is not on the generator→preview path' };
            }
            if (edgeExists(g, IDS.gen, IDS.prev)) {
                return { pass: false, note: 'direct generator→preview edge still present' };
            }
            return { pass: r.committed };
        },
    },
];

// ── the scorecard ──────────────────────────────────────────────────────────────────────────────────
interface Cell {
    scenarioId: string;
    tier: number;
    designId: string;
    passRate: string; // 'k/N'
    passes: number;
    expected: TurnOutcome['status'];
    notes: string[]; // one line per missed run (why)
}
const cells: Cell[] = [];

describe.skipIf(SKIP_LIVE)(`Eval benchmark — correctness A/B (model=${model}, N=${N})`, () => {
    for (const s of SMOKE) {
        for (const d of DESIGNS) {
            it(
                `${s.id} · ${d.designId}`,
                async () => {
                    let passes = 0;
                    const notes: string[] = [];
                    for (let i = 0; i < N; i += 1) {
                        // Delimit this cell's run in the shared transcript so the saved log is navigable.
                        rec(`\n══════════ ${s.id} · ${d.designId} · run ${i + 1}/${N} ══════════`);
                        rec(`objective: ${s.objective}\n`);
                        const initial = s.initial();
                        // A turn can ERROR (a live-model malformed call, or an agent that exceeds its iteration
                        // budget) and runScenario rethrows it. That is a failure to complete the task, so record
                        // it as a MISS and keep going — it must not crash the cell and lose the other N-1 runs.
                        let r: BenchmarkResult;
                        try {
                            r = await d.run({
                                objective: s.objective,
                                initialGraph: initial,
                                userPermissions: s.userPermissions,
                            });
                        } catch (err) {
                            const msg = (err instanceof Error ? err.message : String(err)).replace(/\s+/g, ' ');
                            rec(`── result: ERRORED → MISS (${msg}) ──`);
                            notes.push(`run${i + 1}: ERROR — ${msg.slice(0, 140)}`);
                            continue;
                        }
                        const v = s.oracle(r, initial);
                        if (v.pass) passes += 1;
                        const statusTag =
                            r.outcome.status === s.expect ? '' : ` [outcome=${r.outcome.status}≠${s.expect}]`;
                        const line = `run${i + 1}: ${v.pass ? 'PASS' : `MISS — ${v.note ?? 'oracle failed'}`}${statusTag}`;
                        rec(
                            `── result: outcome=${r.outcome.status} committed=${r.committed} → ${v.pass ? 'PASS' : `MISS (${v.note ?? 'oracle failed'})`} ──`
                        );
                        if (!v.pass || statusTag) {
                            notes.push(`${line} · "${outcomeText(r.outcome).replace(/\s+/g, ' ').slice(0, 100)}"`);
                        }
                    }
                    // The oracle verdicts live in the scorecard, not in an assertion here — a design missing a
                    // scenario is signal, not a harness failure. This only guards the loop bookkeeping.
                    expect(passes).toBeLessThanOrEqual(N);
                    cells.push({
                        scenarioId: s.id,
                        tier: s.tier,
                        designId: d.designId,
                        passRate: `${passes}/${N}`,
                        passes,
                        expected: s.expect,
                        notes,
                    });
                    console.log(`  [${s.id} · ${d.designId}] ${passes}/${N}${notes.length ? ` — ${notes[0]}` : ' ✓'}`);
                },
                TIMEOUT_MS
            );
        }
    }

    afterAll(() => {
        if (!cells.length) return;
        const designIds = DESIGNS.map(d => d.designId);
        const byScenario = new Map<string, Cell[]>();
        for (const c of cells) {
            const list = byScenario.get(c.scenarioId) ?? [];
            list.push(c);
            byScenario.set(c.scenarioId, list);
        }
        const lines: string[] = [];
        lines.push(`\n━━━━━━━━━━ EVAL BENCHMARK · correctness A/B · model=${model} · N=${N} ━━━━━━━━━━`);
        lines.push(`  scenario            ${designIds.map(d => d.padEnd(20)).join('')}winner`);
        const totals: Record<string, number> = Object.fromEntries(designIds.map(d => [d, 0]));
        for (const s of SMOKE) {
            const row = byScenario.get(s.id) ?? [];
            const passOf = (d: string) => row.find(c => c.designId === d)?.passes ?? 0;
            for (const d of designIds) totals[d] += passOf(d);
            const cellStr = designIds
                .map(d => {
                    const c = row.find(x => x.designId === d);
                    return `${c?.passRate ?? '—'}`.padEnd(20);
                })
                .join('');
            const a = passOf(designIds[0]);
            const b = passOf(designIds[1]);
            const winner = a === b ? 'tie' : a > b ? designIds[0] : designIds[1];
            lines.push(`  ${s.id.padEnd(20)}${cellStr}${winner}`);
        }
        lines.push(`  ${''.padEnd(20)}${'─'.repeat(20 * designIds.length)}`);
        lines.push(
            `  ${'TOTAL'.padEnd(20)}${designIds.map(d => `${totals[d]}/${SMOKE.length * N}`.padEnd(20)).join('')}`
        );
        // The misses, so a failure is localized to which invariant broke.
        const misses = cells.filter(c => c.notes.length);
        if (misses.length) {
            lines.push(`\n  misses:`);
            for (const c of misses) for (const n of c.notes) lines.push(`   · ${c.scenarioId} · ${c.designId}: ${n}`);
        }
        const scorecard = lines.join('\n');
        console.log(scorecard);
        // Persist every run to the gitignored bench-runs/ dir (repo root) so runs are diggable + diffable over
        // time: a timestamped {json,txt} pair per run, plus latest.{json,txt}. Override the dir with BENCH_OUT.
        try {
            const dir = process.env.BENCH_OUT ?? join(process.cwd(), 'bench-runs');
            mkdirSync(dir, { recursive: true });
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            const base = `eval-benchmark_${model}_N${N}_${stamp}`;
            const payload = { model, n: N, timestamp: new Date().toISOString(), cells };
            const fullTranscript = `${scorecard}\n\n${'═'.repeat(60)}\nFULL TRANSCRIPT (every agent's messages + tool calls)\n${'═'.repeat(60)}\n${transcript.join('\n')}\n`;
            writeFileSync(join(dir, `${base}.json`), JSON.stringify(payload, null, 2));
            writeFileSync(join(dir, `${base}.txt`), `${scorecard}\n`);
            writeFileSync(join(dir, `${base}.transcript.log`), fullTranscript);
            writeFileSync(join(dir, 'latest.json'), JSON.stringify(payload, null, 2));
            writeFileSync(join(dir, 'latest.txt'), `${scorecard}\n`);
            writeFileSync(join(dir, 'latest.transcript.log'), fullTranscript);
            console.log(`\n  saved → ${join(dir, base)}.{json,txt,transcript.log}  (and latest.*)`);
        } catch (e) {
            console.log(`  (could not persist bench results: ${e instanceof Error ? e.message : String(e)})`);
        }
    });
});
