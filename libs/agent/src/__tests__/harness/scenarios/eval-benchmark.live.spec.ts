/**
 * EVAL BENCHMARK — comparing two designs by CORRECTNESS (docs/browser-agent/design/eval-benchmark.md).
 *
 * SETTLED (2026-08-05) — this A/B produced the shipped decision: the HYBRID (builder builds structure, block
 * specialists author content) — see context-strategy-and-composition.md §7. This spec is kept as the HISTORICAL
 * experiment record, not a live gate. NOTE: since edge + locator were retired, the `fanoutRoster` is now
 * degenerate (just the generator), so the fan-out arm no longer models a real design — do not read new meaning
 * into a re-run.
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

import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_REGISTRATIONS, createAgentRoster } from '../../../agents';
import { GENERATOR_MODELS, IDS, makeInitialGraph } from '../fixtures';
import { liveProvider, resolveLiveGateway } from '../liveGateway';
import { createMeter, meteringGateway, price } from '../metering';
import { runScenario } from '../runScenario';
import { outcomeText } from '../turnOutcome';

import type { AgentRoster } from '../../../agents';
import type { Graph } from '../../../canvas/canvasBinding';
import type { ChatMessage, ChatRequest, Chunk, LlmGateway } from '../../../llm/llmGateway';
import type { AgentGrant } from '../../../permissions';
import type { TurnCost } from '../metering';
import type { TurnOutcome } from '../turnOutcome';

// ── live gate + gateway ──────────────────────────────────────────────────────────────────────────
const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
// One seam for the whole live suite: the Gemini Developer API when GEMINI_API_KEY is set, else undefined.
// temperature 0 → the most repeatable real output.
const gateway = resolveLiveGateway({
    model,
    generation: { temperature: 0, thinkingBudget: 1024, maxOutputTokens: 8192 },
});
const SKIP_LIVE = !gateway || !process.env.RUN_LIVE;
const N = Math.max(1, Number(process.env.BENCH_N ?? '1')); // runs per (scenario × design); smoke default 1
const VERBOSE = !!process.env.LIVE_VERBOSE; // ALSO echo the transcript to the console (it is ALWAYS saved to file)
const TIMEOUT_MS = 240_000 * N; // a live multi-agent turn (+ the outcome re-ask) is several round-trips
// Ease rate-limit (429) pressure: pause after each (scenario × design) cell. Off by default (0); set e.g.
// BENCH_PAUSE_MS=3000 if a run starts hitting the Developer API's per-minute limit.
const PAUSE_MS = Math.max(0, Number(process.env.BENCH_PAUSE_MS ?? '0'));

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
    cost: TurnCost; // NEW — the turn's summed token counts + list/effective $ (eval-benchmark.md §4.2)
    elapsedMs: number; // NEW — wall-clock latency of the whole run() (secondary, noisy axis)
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
        // A fresh Meter per run() — every agent's gateway writes into it, so totals are the whole-turn sum (§3).
        const meter = createMeter();
        const started = performance.now();
        const { outcome, graph, committed } = await runScenario({
            objective,
            initialGraph,
            userPermissions,
            roster,
            // Compose metering INSIDE the transcript recorder — both are pass-through observers over the one seam.
            makeGateway: (agentType: string) =>
                recordingGateway(meteringGateway(gateway!, meter), `${designId}:${agentType}`),
        });
        const elapsedMs = performance.now() - started;
        const totals = meter.totals();
        const priced = price(totals, model);
        return { outcome, graph, committed, cost: { ...totals, ...priced }, elapsedMs };
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
const nodesOfType = (g: Graph, type: string) => g.nodes.filter(n => n.type === type);
const countType = (g: Graph, type: string) => nodesOfType(g, type).length;
/** The defined ids of every node of a type — narrows away NodeData.id's optional so {@link reaches} can use them. */
const idsOfType = (g: Graph, type: string): string[] =>
    nodesOfType(g, type)
        .map(n => n.id)
        .filter((id): id is string => !!id);
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

    // ── Complex scenarios (tier 6+): branching / converging builds, coordinated multi-node edits, and
    // multi-splice refactors — the cases most likely to make the two designs actually DIVERGE. ──────────
    {
        // Branching build: one input fans out to TWO generators, each with its own preview (5 nodes, 4 edges).
        id: 'T6.branch-fanout',
        tier: 6,
        objective:
            'build a flow where one text input feeds two separate generators, and each generator has its own preview',
        initial: EMPTY,
        expect: 'applied',
        oracle: r => {
            const g = r.graph;
            const inputs = idsOfType(g, 'input-text');
            const gens = idsOfType(g, 'single-output-generator');
            const prevs = idsOfType(g, 'output-preview');
            if (!inputs.length) return { pass: false, note: 'no input-text node' };
            if (gens.length < 2) return { pass: false, note: `fewer than 2 generators (=${gens.length})` };
            if (prevs.length < 2) return { pass: false, note: `fewer than 2 previews (=${prevs.length})` };
            // an input reaches ≥2 distinct generators…
            const fed = gens.filter(gen => inputs.some(inp => reaches(g, inp, gen)));
            if (fed.length < 2) return { pass: false, note: `input feeds fewer than 2 generators (=${fed.length})` };
            // …and ≥2 of those generators each reach a preview (two complete branches)
            const branches = fed.filter(gen => prevs.some(p => reaches(g, gen, p)));
            if (branches.length < 2) {
                return { pass: false, note: `fewer than 2 generator→preview branches (=${branches.length})` };
            }
            return { pass: r.committed };
        },
    },
    {
        // Coordinated multi-node edit: two config changes on the generator PLUS a rename on the preview, in
        // one request — the orchestrator must fan out to multiple specialists; the builder does it in one turn.
        id: 'T7.multi-edit',
        tier: 7,
        objective:
            "set the generator's model to Gemini 2.5 Pro and its temperature to 0.9, and rename the preview to 'Final Output'",
        initial: makeInitialGraph,
        expect: 'applied',
        oracle: r => {
            const gen = findNode(r.graph, IDS.gen);
            const prev = findNode(r.graph, IDS.prev);
            if (!gen) return { pass: false, note: 'generator missing' };
            if (gen.config?.model !== 'gemini-2.5-pro') return { pass: false, note: `model=${gen.config?.model}` };
            if (gen.config?.temperature !== '0.9') {
                return { pass: false, note: `temperature=${gen.config?.temperature}` };
            }
            if (!prev) return { pass: false, note: 'preview missing' };
            if (prev.customLabel !== 'Final Output') return { pass: false, note: `preview label=${prev.customLabel}` };
            return { pass: r.committed };
        },
    },
    {
        // Two simultaneous splices: insert a buffer BEFORE the generator and a second AFTER it, on the
        // input→generator→preview chain — both direct edges must be gone.
        id: 'T7.double-insert',
        tier: 7,
        objective:
            'insert one buffer between the input and the generator, and a second buffer between the generator and the preview',
        initial: makeNoBufferGraph,
        expect: 'applied',
        oracle: r => {
            const g = r.graph;
            const buffers = nodesOfType(g, 'buffer');
            if (buffers.length < 2) return { pass: false, note: `fewer than 2 buffers (=${buffers.length})` };
            if (!embedsTypedPath(g, ['input-text', 'buffer', 'single-output-generator'])) {
                return { pass: false, note: 'no input→buffer→generator path' };
            }
            if (!embedsTypedPath(g, ['single-output-generator', 'buffer', 'output-preview'])) {
                return { pass: false, note: 'no generator→buffer→preview path' };
            }
            if (edgeExists(g, IDS.txt, IDS.gen)) return { pass: false, note: 'direct input→generator edge remains' };
            if (edgeExists(g, IDS.gen, IDS.prev)) return { pass: false, note: 'direct generator→preview edge remains' };
            return { pass: r.committed };
        },
    },
    {
        // Two disjoint structures at once: build two independent input→generator→preview pipelines.
        id: 'T8.two-pipelines',
        tier: 8,
        objective: 'build two independent pipelines, each one a text input feeding a generator feeding a preview',
        initial: EMPTY,
        expect: 'applied',
        oracle: r => {
            const g = r.graph;
            if (countType(g, 'input-text') < 2) {
                return { pass: false, note: `fewer than 2 inputs (=${countType(g, 'input-text')})` };
            }
            if (countType(g, 'single-output-generator') < 2) return { pass: false, note: 'fewer than 2 generators' };
            if (countType(g, 'output-preview') < 2) return { pass: false, note: 'fewer than 2 previews' };
            const inputs = idsOfType(g, 'input-text');
            const gens = idsOfType(g, 'single-output-generator');
            const prevs = idsOfType(g, 'output-preview');
            // ≥2 generators each sitting on a complete input→generator→preview chain
            const complete = gens.filter(
                gen => inputs.some(inp => reaches(g, inp, gen)) && prevs.some(p => reaches(g, gen, p))
            );
            if (complete.length < 2) {
                return { pass: false, note: `fewer than 2 complete pipelines (=${complete.length})` };
            }
            return { pass: r.committed };
        },
    },
];

// ── the scorecard ──────────────────────────────────────────────────────────────────────────────────
// Efficiency (eval-benchmark.md §4.1) rides BESIDE correctness, never replaces it: raw tokens and
// round-trips are the trusted axes; wall-clock + $ are reported but not ranked on. Each axis is summed over one
// turn, aggregated ONLY over PASSING runs (a wrong answer's cost is meaningless), then the co-passing scenarios
// are summed per design for the head-to-head. ONE key list drives zero/add/scale so no column is re-inlined.
const EFF_KEYS = [
    'inputTokens',
    'cachedTokens',
    'outputTokens',
    'totalTokens',
    'roundTrips',
    'usdList',
    'usdEffective',
    'elapsedMs',
] as const;
/** The efficiency axes carried per cell/design: TurnCost's priced token counts + the timed wall-clock. */
type Efficiency = Record<(typeof EFF_KEYS)[number], number>;
const zeroEff = (): Efficiency => Object.fromEntries(EFF_KEYS.map(k => [k, 0] as const)) as Efficiency;
/** Fold b into a in place — the ONE adder for both sum-over-runs (per cell) and sum-over-cells (per design). */
const addEff = (a: Efficiency, b: Efficiency): void => {
    for (const k of EFF_KEYS) a[k] += b[k];
};
/** Element-wise scale — a cell's mean over its k passing runs is scaleEff(sum, 1 / k). */
const scaleEff = (a: Efficiency, f: number): Efficiency =>
    Object.fromEntries(EFF_KEYS.map(k => [k, a[k] * f] as const)) as Efficiency;
/** One run's efficiency = its priced token counts (TurnCost) plus the wall-clock the harness timed. */
const runEff = (r: BenchmarkResult): Efficiency => ({ ...r.cost, elapsedMs: r.elapsedMs });

// Compact log formatters (tokens as 18.4k, seconds, $ to 4dp; round-trips drop a whole-number's decimal).
const fmtTok = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`);
const fmtSec = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;
const fmtUsd = (n: number): string => n.toFixed(4);
const fmtNum = (n: number): string => (Number.isInteger(n) ? `${n}` : n.toFixed(1));
/** Signed percent of `a` relative to `b` (the doc's −34% form; − is U+2212 to match). */
const pctDelta = (a: number, b: number): string => {
    if (b === 0) return a === 0 ? '±0%' : '+∞%';
    const d = ((a - b) / b) * 100;
    return `${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d).toFixed(0)}%`;
};
/**
 * The efficiency winner between two co-correct designs, ranked on tokens THEN round-trips — never cost (§4).
 * Returns the winning id and both designs' axes so the caller can render the tok / round-trip deltas.
 */
const effWinner = (
    ids: [string, string],
    ea: Efficiency,
    eb: Efficiency
): { id: string; win: Efficiency; lose: Efficiency } => {
    const aWins = ea.totalTokens !== eb.totalTokens ? ea.totalTokens < eb.totalTokens : ea.roundTrips <= eb.roundTrips;
    return aWins ? { id: ids[0], win: ea, lose: eb } : { id: ids[1], win: eb, lose: ea };
};
/** "<design> (−X% tok, −Y% round-trips)", or "tie" when both stable axes match (§4 two-part verdict). */
const effVerdict = (ids: [string, string], ea: Efficiency, eb: Efficiency): string => {
    if (ea.totalTokens === eb.totalTokens && ea.roundTrips === eb.roundTrips) return 'tie';
    const w = effWinner(ids, ea, eb);
    return `${w.id} (${pctDelta(w.win.totalTokens, w.lose.totalTokens)} tok, ${pctDelta(w.win.roundTrips, w.lose.roundTrips)} round-trips)`;
};

interface Cell {
    scenarioId: string;
    tier: number;
    designId: string;
    passRate: string; // 'k/N'
    passes: number;
    expected: TurnOutcome['status'];
    notes: string[]; // one line per missed run (why)
    meanCost: Efficiency | null; // NEW — mean efficiency over PASSING runs (null if none passed; §4)
}
const cells: Cell[] = [];

describe.skipIf(SKIP_LIVE)(
    `Eval benchmark — correctness A/B (provider=${liveProvider()}, model=${model}, N=${N})`,
    () => {
        // Space cells out to relieve shared-quota pressure (429s). afterEach gets its own timeout > the pause.
        afterEach(async () => {
            if (PAUSE_MS > 0) await new Promise(resolve => setTimeout(resolve, PAUSE_MS));
        }, PAUSE_MS + 30_000);

        for (const s of SMOKE) {
            for (const d of DESIGNS) {
                it(
                    `${s.id} · ${d.designId}`,
                    async () => {
                        let passes = 0;
                        const notes: string[] = [];
                        // Efficiency accumulates over PASSING runs only — a wrong answer's cost is meaningless (§4).
                        const effSum = zeroEff();
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
                            if (v.pass) {
                                passes += 1;
                                addEff(effSum, runEff(r));
                            }
                            const statusTag =
                                r.outcome.status === s.expect ? '' : ` [outcome=${r.outcome.status}≠${s.expect}]`;
                            const line = `run${i + 1}: ${v.pass ? 'PASS' : `MISS — ${v.note ?? 'oracle failed'}`}${statusTag}`;
                            rec(
                                `── result: outcome=${r.outcome.status} committed=${r.committed} · ${fmtTok(r.cost.totalTokens)} tok · ${r.cost.roundTrips} rt · ${fmtSec(r.elapsedMs)} → ${v.pass ? 'PASS' : `MISS (${v.note ?? 'oracle failed'})`} ──`
                            );
                            if (!v.pass || statusTag) {
                                notes.push(`${line} · "${outcomeText(r.outcome).replace(/\s+/g, ' ').slice(0, 100)}"`);
                            }
                        }
                        // The oracle verdicts live in the scorecard, not in an assertion here — a design missing a
                        // scenario is signal, not a harness failure. This only guards the loop bookkeeping.
                        expect(passes).toBeLessThanOrEqual(N);
                        // Mean efficiency over this cell's passing runs (null if none passed → nothing to average).
                        const meanCost = passes > 0 ? scaleEff(effSum, 1 / passes) : null;
                        cells.push({
                            scenarioId: s.id,
                            tier: s.tier,
                            designId: d.designId,
                            passRate: `${passes}/${N}`,
                            passes,
                            expected: s.expect,
                            notes,
                            meanCost,
                        });
                        const effTag = meanCost
                            ? ` · ${fmtTok(meanCost.totalTokens)} tok · ${fmtNum(meanCost.roundTrips)} rt · ${fmtSec(meanCost.elapsedMs)}`
                            : '';
                        console.log(
                            `  [${s.id} · ${d.designId}] ${passes}/${N}${effTag}${notes.length ? ` — ${notes[0]}` : ' ✓'}`
                        );
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
            lines.push(`\n━━━━━━━━━━ EVAL BENCHMARK · provider=${liveProvider()} · model=${model} · N=${N} ━━━━━━━━━━`);
            // Per (scenario × design): correctness (pass) BESIDE the mean efficiency over PASSING runs (§4). Raw
            // tokens/round-trips are the trusted axes; ms + $ are shown but not ranked on.
            lines.push(
                `  ${'scenario'.padEnd(20)}${'design'.padEnd(22)}${'pass'.padEnd(6)}${'tok'.padEnd(8)}${'rt'.padEnd(6)}${'ms'.padEnd(8)}${'$list'.padEnd(9)}${'$eff'.padEnd(9)}notes`
            );
            const pair: [string, string] = [designIds[0], designIds[1]];
            const totals: Record<string, number> = Object.fromEntries(designIds.map(d => [d, 0]));
            // Per-design efficiency summed over the scenarios BOTH designs pass — the §4 head-to-head block.
            const coPass: Record<string, Efficiency> = Object.fromEntries(designIds.map(d => [d, zeroEff()]));
            let coPassScenarios = 0;
            for (const s of SMOKE) {
                const row = byScenario.get(s.id) ?? [];
                const cellOf = (d: string) => row.find(c => c.designId === d);
                for (const d of designIds) totals[d] += cellOf(d)?.passes ?? 0;
                for (const d of designIds) {
                    const c = cellOf(d);
                    const mc = c?.meanCost ?? null;
                    const effCols = mc
                        ? `${fmtTok(mc.totalTokens).padEnd(8)}${fmtNum(mc.roundTrips).padEnd(6)}${fmtSec(mc.elapsedMs).padEnd(8)}${fmtUsd(mc.usdList).padEnd(9)}${fmtUsd(mc.usdEffective).padEnd(9)}`
                        : `${'—'.padEnd(8)}${'—'.padEnd(6)}${'—'.padEnd(8)}${'—'.padEnd(9)}${'—'.padEnd(9)}`;
                    const note = c && c.notes.length ? `${c.notes.length} miss${c.notes.length > 1 ? 'es' : ''}` : '—';
                    lines.push(`  ${s.id.padEnd(20)}${d.padEnd(22)}${(c?.passRate ?? '—').padEnd(6)}${effCols}${note}`);
                }
                // Two-part verdict: correctness winner (pass-rate) THEN efficiency winner among co-correct (tok/rt).
                const a = cellOf(pair[0]);
                const b = cellOf(pair[1]);
                const pa = a?.passes ?? 0;
                const pb = b?.passes ?? 0;
                const correctness = pa === pb ? 'tie' : pa > pb ? pair[0] : pair[1];
                let efficiency: string;
                if (a?.meanCost && b?.meanCost) {
                    // Both designs produced ≥1 correct result here → their cost is comparable; fold into the summary.
                    addEff(coPass[pair[0]], a.meanCost);
                    addEff(coPass[pair[1]], b.meanCost);
                    coPassScenarios += 1;
                    efficiency = effVerdict(pair, a.meanCost, b.meanCost);
                } else {
                    efficiency = 'n/a (needs both designs to pass)';
                }
                lines.push(`  ${''.padEnd(20)}▶ correctness: ${correctness} · efficiency: ${efficiency}`);
            }
            lines.push(`  ${''.padEnd(20)}${'─'.repeat(68)}`);
            lines.push(
                `  ${'TOTAL correctness'.padEnd(20)}${pair.map(d => `${d}=${totals[d]}/${SMOKE.length * N}`).join('   ')}`
            );
            // ── EFFICIENCY (scenarios BOTH designs pass) — per-design Σ of the co-passing cells + % deltas (§4) ──
            lines.push(`\n  ━━━ EFFICIENCY (scenarios BOTH designs pass: ${coPassScenarios}/${SMOKE.length}) ━━━`);
            if (!coPassScenarios) {
                lines.push(`   (no scenario was passed by both designs — no efficiency comparison)`);
            } else {
                const w = effWinner(pair, coPass[pair[0]], coPass[pair[1]]);
                for (const d of pair) {
                    const e = coPass[d];
                    const delta =
                        d === w.id
                            ? `   →  ${pctDelta(w.win.totalTokens, w.lose.totalTokens)} tok, ${pctDelta(w.win.roundTrips, w.lose.roundTrips)} round-trips`
                            : '';
                    lines.push(
                        `   ${d.padEnd(22)}Σ ${fmtTok(e.totalTokens)} tok · ${fmtNum(e.roundTrips)} rt · ${fmtSec(e.elapsedMs)}  ·  $list ${fmtUsd(e.usdList)} / $eff ${fmtUsd(e.usdEffective)}${delta}`
                    );
                }
            }
            // The misses, so a failure is localized to which invariant broke.
            const misses = cells.filter(c => c.notes.length);
            if (misses.length) {
                lines.push(`\n  misses:`);
                for (const c of misses) {
                    for (const n of c.notes) lines.push(`   · ${c.scenarioId} · ${c.designId}: ${n}`);
                }
            }
            const scorecard = lines.join('\n');
            console.log(scorecard);
            // Persist every run to the gitignored bench-runs/ dir (repo root) so runs are diggable + diffable over
            // time: a timestamped {json,txt} pair per run, plus latest.{json,txt}. Override the dir with BENCH_OUT.
            try {
                const dir = process.env.BENCH_OUT ?? join(process.cwd(), 'bench-runs');
                mkdirSync(dir, { recursive: true });
                const stamp = new Date().toISOString().replace(/[:.]/g, '-');
                const base = `eval-benchmark_${liveProvider()}_${model}_N${N}_${stamp}`;
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
    }
);
