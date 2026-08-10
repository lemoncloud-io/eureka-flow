/**
 * LIVE evaluation of the shipped design against a REAL Gemini key — the orchestrator + its specialists + the
 * builder, driven end-to-end with **no browser and no backend**. A tiered scenario ladder (config edits, a
 * structural edit + rewire, a build-from-scratch, splice/reroute refactors, and a bad-value refusal) is run
 * against the ONE shipped hybrid roster; each run is metered (tokens · round-trips · cost) so correctness
 * rides beside efficiency.
 *
 * How it differs from integration.spec.ts:
 *   - integration.spec.ts is DETERMINISTIC — it scripts every tool call via the fake gateway and asserts the
 *     exact oracle. It always runs.
 *   - THIS file is an EVAL — it hands the orchestrator + specialists a real function-calling Gemini gateway
 *     (capabilities.toolCalls === true) and only checks the OUTCOME + a graph oracle. The MODEL chooses the
 *     tool calls, so a case can legitimately miss when the model misbehaves — that is the SIGNAL, recorded in
 *     the scorecard, NOT a red test. The scorecard (afterAll) is the deliverable; the per-`it` ✓ is only
 *     harness sanity that the turn ran.
 *
 * OPT-IN: this eval hits the real Gemini API, so it runs ONLY when RUN_LIVE is set — a key in .env.local is not
 * enough. `nx test` and CI leave RUN_LIVE unset, so the whole suite stays offline and deterministic.
 *
 * Key: put GEMINI_API_KEY (and optionally GEMINI_MODEL) in the repo-root .env.local — this spec loads it on
 * import (../../loadEnvLocal), so no command prefix is needed. Inline `GEMINI_API_KEY=... ` still works too.
 *
 * LOGS: every run auto-saves to the gitignored `bench-runs/` dir (repo root), NO flags needed:
 *   - <base>.transcript.log — the FULL run: every agent's system prompt, the user/tool-result messages it
 *     received, and the assistant text + tool CALLS + tool RESULTS it produced, verbatim & untruncated,
 *     delimited per (scenario · run). The "examine everything" log.
 *   - <base>.txt — the scorecard.   <base>.json — the raw cells[].   (base = integration-live_<provider>_<model>_N<n>_<ts>)
 *   - latest.{transcript.log,txt,json} — the most recent run, for quick diffing.
 * Override the dir with BENCH_OUT=/path. LIVE_VERBOSE=1 additionally streams the same transcript to the console.
 *
 * Run all:       RUN_LIVE=1 npx vitest run libs/agent/src/__tests__/harness/scenarios/integration.live.spec.ts
 * One case:      RUN_LIVE=1 npx vitest run .../integration.live.spec.ts -t T4.build-pipeline
 * More runs:     RUN_LIVE=1 BENCH_N=5 npx vitest run .../integration.live.spec.ts
 * Bigger model:  RUN_LIVE=1 GEMINI_MODEL=gemini-2.5-pro npx vitest run .../integration.live.spec.ts
 * Full chat log: LIVE_VERBOSE=1 RUN_LIVE=1 npx vitest run .../integration.live.spec.ts -t T4 > bench-runs/mylog.txt 2>&1
 *
 * Headless: the in-memory canvas binding + a direct call to generativelanguage.googleapis.com. No DOM, no flow
 * socket, no block API.
 */
import '../../loadEnvLocal'; // FIRST: load repo-root .env.local so GEMINI_API_KEY is set before the gate below

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { GENERATOR_MODELS, IDS, makeInitialGraph } from '../fixtures';
import { liveProvider, resolveLiveGateway } from '../liveGateway';
import { createMeter, meteringGateway, price } from '../metering';
import { runScenario } from '../runScenario';
import { outcomeText } from '../turnOutcome';

import type { Graph } from '../../../canvas/canvasBinding';
import type { ChatMessage, ChatRequest, Chunk, LlmGateway } from '../../../llm/llmGateway';
import type { AgentGrant } from '../../../permissions';
import type { AgentTrace, EdgeChange, GraphDiff, NodeChange, TraceNode, TraceProjections } from '../../../trace';
import type { TurnCost } from '../metering';
import type { TurnOutcome } from '../turnOutcome';

// ── live gate + gateway ──────────────────────────────────────────────────────────────────────────
const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
// One seam for the whole live suite: the Gemini Developer API when GEMINI_API_KEY is set, else undefined.
// temperature 0 → the most repeatable real output; bound thinking but leave ample output room so a turn
// never spends its whole budget on thoughts and returns an empty candidate.
const gateway = resolveLiveGateway({
    model,
    generation: { temperature: 0, thinkingBudget: 1024, maxOutputTokens: 8192 },
});
// Opt-in gate: a key in .env.local is not enough (else `nx test` would run these) — RUN_LIVE must be set too.
const SKIP_LIVE = !gateway || !process.env.RUN_LIVE;
const N = Math.max(1, Number(process.env.BENCH_N ?? '1')); // runs per scenario; smoke default 1
const VERBOSE = !!process.env.LIVE_VERBOSE; // ALSO echo the transcript to the console (it is ALWAYS saved to file)
const TRACE = !!process.env.AGENT_TRACE; // ALSO capture the structured trace and render the 3 projections per run
const TIMEOUT_MS = 240_000 * N; // a live multi-agent turn (+ the outcome re-ask) is several round-trips
// Ease rate-limit (429) pressure: pause after each scenario. Off by default (0); set e.g. BENCH_PAUSE_MS=3000
// if a run starts hitting the Developer API's per-minute limit.
const PAUSE_MS = Math.max(0, Number(process.env.BENCH_PAUSE_MS ?? '0'));

// ── full-transcript recorder ───────────────────────────────────────────────────────────────────────
// Every LLM round-trip of every agent (orchestrator + each spawned specialist/builder) flows through the
// makeGateway seam, so wrapping it captures the WHOLE run VERBATIM: each agent's system prompt, the user /
// tool-result messages it receives, and the assistant text + tool CALLS it emits. Tool RESULTS reappear as
// role:'tool' messages on the next call, so they are captured too. It ALWAYS appends to a durable sink,
// untruncated — the run's examinable record. Written to a per-run *.transcript.log by afterAll; LIVE_VERBOSE
// additionally echoes it to the console.
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

// ── the three trace projections (rendered per run ONLY when AGENT_TRACE is set) ─────────────────────
// Nothing here truncates: a trace is for reading the WHOLE conversation, so every message/arg prints verbatim.
const asText = (v: unknown): string => (typeof v === 'string' ? v : JSON.stringify(v));
/** Prefix every physical line of a (possibly multi-line) block, so a long untrimmed message stays visually inside its turn. */
const gutter = (text: string, prefix: string): string[] => text.split('\n').map(line => `${prefix}${line}`);

// 1/3 · one chat per agent instance. A continuous `┃` gutter groups each agent's block; numbered `[n] ROLE`
// headers with a blank gutter line between them make each user/assistant/tool turn its own visible unit.
const renderTranscripts = (p: TraceProjections, out: string[]): void => {
    out.push('', '════════════ trace · 1/3 · TRANSCRIPTS (chat per agent instance) ════════════');
    if (!p.transcripts.length) {
        out.push('  (no records)');
        return;
    }
    for (const t of p.transcripts) {
        out.push('', `┏━ agent: ${t.agentType || '(root)'} · ${t.agentId}`);
        t.chat.forEach((e, i) => {
            out.push('┃'); // blank gutter line separates one turn from the next
            const label = e.role === 'tool' ? `TOOL ◂ (result of ${e.toolCallId ?? '?'})` : `${e.role.toUpperCase()} ▸`;
            out.push(`┃ [${i + 1}] ${label}`);
            if (e.text) out.push(...gutter(e.text, '┃     '));
            for (const c of e.toolCalls ?? []) out.push(...gutter(`→ calls ${c.name}(${asText(c.args)})`, '┃     '));
        });
        out.push(`┗━ end: ${t.agentType || '(root)'} · ${t.agentId}`);
    }
};

// 2/3 · the agent call tree (who spawned whom), each node tagged with its per-event-type record counts.
const renderTree = (p: TraceProjections, out: string[]): void => {
    out.push('', '════════════ trace · 2/3 · TRACE TREE (who spawned whom) ════════════');
    const walk = (n: TraceNode, d: number): void => {
        const counts = new Map<string, number>();
        for (const r of n.records) counts.set(r.name, (counts.get(r.name) ?? 0) + 1);
        const summary = [...counts].map(([k, v]) => `${k}×${v}`).join(' ');
        out.push(`  ${'  '.repeat(d)}▸ ${n.agentType || '(root)'} · ${n.agentId}  [${n.records.length}: ${summary}]`);
        n.children.forEach(c => walk(c, d + 1));
    };
    if (p.tree) walk(p.tree, 0);
    else out.push('  (no records)');
};

// One graph delta — names WHICH nodes/edges were added/removed/changed (with node type + edge endpoints),
// not just how many.
const renderOneDiff = (heading: string, d: GraphDiff, out: string[]): void => {
    const nodeLine = (sign: string, n: NodeChange): string => `    ${sign} node ${n.id} (${n.type || '?'})`;
    const edgeLine = (sign: string, e: EdgeChange): string =>
        `    ${sign} edge ${e.id || '?'}: ${e.sourceNodeId}:${e.sourcePortId} → ${e.targetNodeId}:${e.targetPortId}`;
    const rows = [
        ...d.addedNodes.map(n => nodeLine('+', n)),
        ...d.removedNodes.map(n => nodeLine('-', n)),
        ...d.changedNodes.map(n => nodeLine('~', n)),
        ...d.addedEdges.map(e => edgeLine('+', e)),
        ...d.removedEdges.map(e => edgeLine('-', e)),
    ];
    out.push(
        `${heading}  totals: ${d.before.nodes.length}n/${d.before.edges.length}e → ${d.after.nodes.length}n/${d.after.edges.length}e`
    );
    out.push(...(rows.length ? rows : ['    (no structural change)']));
};

// 3/3 · the canvas delta — the cumulative whole-session delta on top, then one delta per turn.
const renderDiff = (p: TraceProjections, out: string[]): void => {
    out.push('', '════════════ trace · 3/3 · GRAPH DIFF (canvas before → after) ════════════');
    if (!p.diff.cumulative) {
        out.push('  (no diff)');
        return;
    }
    renderOneDiff('  cumulative (whole session) ·', p.diff.cumulative, out);
    for (const turn of p.diff.perTurn) renderOneDiff(`  ${turn.runId} ·`, turn, out);
};

const renderProjections = (p: TraceProjections): string => {
    const out: string[] = [];
    renderTranscripts(p, out);
    renderTree(p, out);
    renderDiff(p, out);
    return out.join('\n');
};

// ── the run adapter — the ONE shipped design (default hybrid roster), metered + recorded ────────────
interface RunInput {
    objective: string;
    initialGraph: Graph;
    userPermissions?: AgentGrant;
}
interface RunResult {
    outcome: TurnOutcome;
    graph: Graph;
    committed: boolean;
    cost: TurnCost; // the turn's summed token counts + list/effective $
    elapsedMs: number; // wall-clock latency of the whole run() (secondary, noisy axis)
    trace: AgentTrace; // structured trace capture (real records + 3 projections when AGENT_TRACE is set)
}

/** Run one objective live over the shipped roster; every agent's gateway is metered INSIDE the recorder. */
const runOnce = async ({ objective, initialGraph, userPermissions }: RunInput): Promise<RunResult> => {
    // A fresh Meter per run() — every agent's gateway writes into it, so totals are the whole-turn sum.
    const meter = createMeter();
    const started = performance.now();
    const { outcome, graph, committed, trace } = await runScenario({
        objective,
        initialGraph,
        userPermissions,
        // No roster → createOrchestratorAgent's default (shipped hybrid). Compose metering INSIDE the transcript
        // recorder — both are pure pass-through observers over the one gateway seam.
        makeGateway: (agentType: string) => recordingGateway(meteringGateway(gateway!, meter), agentType),
    });
    const elapsedMs = performance.now() - started;
    const totals = meter.totals();
    return { outcome, graph, committed, cost: { ...totals, ...price(totals, model) }, elapsedMs, trace };
};

// ── oracle helpers — pure over Graph ─────────────────────────────────────────────────────────────
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
/** No-edit oracle for the refusal cases: nothing committed AND the graph is byte-identical to the initial. */
const unchanged = (r: RunResult, initial: Graph) => r.committed === false && sameGraph(r.graph, initial);

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
/** ∃ a directed dataflow chain threading nodes of these types, in order (typed-path embedding). */
const embedsTypedPath = (g: Graph, types: string[]): boolean => {
    const first = types[0];
    if (!first) return false;
    let frontier = idsOfType(g, first);
    if (!frontier.length) return false;
    for (const t of types.slice(1)) {
        frontier = idsOfType(g, t).filter(dst => frontier.some(src => src !== dst && reaches(g, src, dst)));
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
    oracle: (r: RunResult, initial: Graph) => Verdict;
}

const EMPTY = (): Graph => ({ nodes: [], edges: [] });

/** The fixture chain with the buffer removed: input-text → generator → preview. The insert-between start. */
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

// ── the ladder: a few scenarios per tier, oracles as strict as the intent fixes ────────────────────
const SCENARIOS: Scenario[] = [
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
            return { pass: r.committed };
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
            // gpt-4o is not a valid GENERATOR_MODELS value — the agent must NOT edit; the graph must be untouched,
            // and the reason should offer a real model option.
            if (!unchanged(r, initial)) {
                return { pass: false, note: r.committed ? 'edited despite the bad value' : 'graph changed' };
            }
            const reason = r.outcome.status === 'refused' ? r.outcome.reason : '';
            const namesReal = GENERATOR_MODELS.some(m => reason.includes(m));
            return { pass: true, note: namesReal ? undefined : 'refused but reason did not name a real model' };
        },
    },
    {
        // The generator's input is already fed by the buffer, but connecting the input is COMPLETABLE: the agent
        // frees the occupied input (disconnects the buffer's edge into it) and connects. APPLIED is correct — the
        // agent doesn't need permission to change the canvas; it refuses only the genuinely impossible.
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
        // Refactor / splice: start from txt → gen → prev, insert a buffer onto the gen→prev path. Verify the
        // DELTA (a buffer now sits between gen and prev) AND that the direct edge is gone.
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
    // multi-splice refactors — the cases that stress the whole roster the hardest. ──────────────────────
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
        // Coordinated multi-node edit: two config changes on the generator PLUS a rename on the preview, in one
        // request — the shipped design fans the content out to block specialists while the builder owns the rename.
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
// Efficiency rides BESIDE correctness, never replaces it: raw tokens + round-trips are the trusted axes,
// wall-clock + $ are reported but not ranked on. Each axis is summed over one turn, then aggregated ONLY over
// PASSING runs (a wrong answer's cost is meaningless). ONE key list drives zero/add/scale so no column is re-inlined.
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
/** The efficiency axes carried per cell: TurnCost's priced token counts + the timed wall-clock. */
type Efficiency = Record<(typeof EFF_KEYS)[number], number>;
const zeroEff = (): Efficiency => Object.fromEntries(EFF_KEYS.map(k => [k, 0] as const)) as Efficiency;
/** Fold b into a in place — the ONE adder for both sum-over-runs (per cell) and sum-over-cells (grand total). */
const addEff = (a: Efficiency, b: Efficiency): void => {
    for (const k of EFF_KEYS) a[k] += b[k];
};
/** Element-wise scale — a cell's mean over its k passing runs is scaleEff(sum, 1 / k). */
const scaleEff = (a: Efficiency, f: number): Efficiency =>
    Object.fromEntries(EFF_KEYS.map(k => [k, a[k] * f] as const)) as Efficiency;
/** One run's efficiency = its priced token counts (TurnCost) plus the wall-clock the harness timed. */
const runEff = (r: RunResult): Efficiency => ({ ...r.cost, elapsedMs: r.elapsedMs });

// Compact log formatters (tokens as 18.4k, seconds, $ to 4dp; round-trips drop a whole-number's decimal).
const fmtTok = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`);
const fmtSec = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;
const fmtUsd = (n: number): string => n.toFixed(4);
const fmtNum = (n: number): string => (Number.isInteger(n) ? `${n}` : n.toFixed(1));

interface Cell {
    scenarioId: string;
    tier: number;
    passRate: string; // 'k/N'
    passes: number;
    expected: TurnOutcome['status'];
    notes: string[]; // one line per missed run (why)
    meanCost: Efficiency | null; // mean efficiency over PASSING runs (null if none passed)
}
const cells: Cell[] = [];

describe.skipIf(SKIP_LIVE)(
    `Integration live eval — orchestrator + specialists (provider=${liveProvider()}, model=${model}, N=${N})`,
    () => {
        // Space scenarios out to relieve shared-quota pressure (429s). afterEach gets its own timeout > the pause.
        afterEach(async () => {
            if (PAUSE_MS > 0) await new Promise(resolve => setTimeout(resolve, PAUSE_MS));
        }, PAUSE_MS + 30_000);

        for (const s of SCENARIOS) {
            it(
                s.id,
                async () => {
                    let passes = 0;
                    const notes: string[] = [];
                    // Efficiency accumulates over PASSING runs only — a wrong answer's cost is meaningless.
                    const effSum = zeroEff();
                    for (let i = 0; i < N; i += 1) {
                        // Delimit this scenario's run in the shared transcript so the saved log is navigable.
                        rec(`\n══════════ ${s.id} · run ${i + 1}/${N} ══════════`);
                        rec(`objective: ${s.objective}\n`);
                        const initial = s.initial();
                        // A turn can ERROR (a live-model malformed call, or an agent that exceeds its iteration
                        // budget) and runScenario rethrows it. That is a failure to complete the task, so record it
                        // as a MISS and keep going — it must not crash the case and lose the other N-1 runs.
                        let r: RunResult;
                        try {
                            r = await runOnce({
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
                        // AGENT_TRACE: append the 3 structured projections for this run to the saved transcript.
                        if (TRACE) rec(renderProjections(r.trace.project()));
                        if (!v.pass || statusTag) {
                            notes.push(`${line} · "${outcomeText(r.outcome).replace(/\s+/g, ' ').slice(0, 100)}"`);
                        }
                    }
                    // The oracle verdicts live in the scorecard, not in an assertion here — a live miss is a data
                    // point (model non-determinism), not a harness failure. This only guards the loop bookkeeping.
                    expect(passes).toBeLessThanOrEqual(N);
                    // Mean efficiency over this scenario's passing runs (null if none passed → nothing to average).
                    const meanCost = passes > 0 ? scaleEff(effSum, 1 / passes) : null;
                    cells.push({
                        scenarioId: s.id,
                        tier: s.tier,
                        passRate: `${passes}/${N}`,
                        passes,
                        expected: s.expect,
                        notes,
                        meanCost,
                    });
                    const effTag = meanCost
                        ? ` · ${fmtTok(meanCost.totalTokens)} tok · ${fmtNum(meanCost.roundTrips)} rt · ${fmtSec(meanCost.elapsedMs)}`
                        : '';
                    console.log(`  [${s.id}] ${passes}/${N}${effTag}${notes.length ? ` — ${notes[0]}` : ' ✓'}`);
                },
                TIMEOUT_MS
            );
        }

        afterAll(() => {
            if (!cells.length) return;
            const byScenario = new Map<string, Cell>(cells.map(c => [c.scenarioId, c]));
            const lines: string[] = [];
            lines.push(
                `\n━━━━━━━━━━ INTEGRATION LIVE EVAL · provider=${liveProvider()} · model=${model} · N=${N} ━━━━━━━━━━`
            );
            // Per scenario: correctness (pass-rate) BESIDE the mean efficiency over PASSING runs. Raw tokens /
            // round-trips are the trusted axes; ms + $ are shown but not ranked on.
            lines.push(
                `  ${'scenario'.padEnd(22)}${'tier'.padEnd(6)}${'pass'.padEnd(6)}${'tok'.padEnd(8)}${'rt'.padEnd(6)}${'ms'.padEnd(8)}${'$list'.padEnd(9)}${'$eff'.padEnd(9)}notes`
            );
            let totalPasses = 0;
            // Grand total efficiency: each scenario that passed ≥1 run contributes its mean cost once — the cost
            // of one full ladder pass.
            const ladderCost = zeroEff();
            let costedScenarios = 0;
            for (const s of SCENARIOS) {
                const c = byScenario.get(s.id);
                totalPasses += c?.passes ?? 0;
                const mc = c?.meanCost ?? null;
                const effCols = mc
                    ? `${fmtTok(mc.totalTokens).padEnd(8)}${fmtNum(mc.roundTrips).padEnd(6)}${fmtSec(mc.elapsedMs).padEnd(8)}${fmtUsd(mc.usdList).padEnd(9)}${fmtUsd(mc.usdEffective).padEnd(9)}`
                    : `${'—'.padEnd(8)}${'—'.padEnd(6)}${'—'.padEnd(8)}${'—'.padEnd(9)}${'—'.padEnd(9)}`;
                const note = c && c.notes.length ? `${c.notes.length} miss${c.notes.length > 1 ? 'es' : ''}` : '—';
                lines.push(
                    `  ${s.id.padEnd(22)}${String(s.tier).padEnd(6)}${(c?.passRate ?? '—').padEnd(6)}${effCols}${note}`
                );
                if (mc) {
                    addEff(ladderCost, mc);
                    costedScenarios += 1;
                }
            }
            lines.push(`  ${''.padEnd(22)}${'─'.repeat(66)}`);
            lines.push(`  ${'TOTAL correctness'.padEnd(22)}${totalPasses}/${SCENARIOS.length * N}`);
            lines.push(
                `  ${`Σ cost (${costedScenarios} passing scenarios)`.padEnd(22)}${fmtTok(ladderCost.totalTokens)} tok · ${fmtNum(ladderCost.roundTrips)} rt · ${fmtSec(ladderCost.elapsedMs)}  ·  $list ${fmtUsd(ladderCost.usdList)} / $eff ${fmtUsd(ladderCost.usdEffective)}`
            );
            // The misses, so a failure is localized to which invariant broke.
            const misses = cells.filter(c => c.notes.length);
            if (misses.length) {
                lines.push(`\n  misses:`);
                for (const c of misses) {
                    for (const n of c.notes) lines.push(`   · ${c.scenarioId}: ${n}`);
                }
            }
            const scorecard = lines.join('\n');
            console.log(scorecard);
            // Persist every run to the gitignored bench-runs/ dir (repo root) so runs are diggable + diffable over
            // time: a timestamped {json,txt,transcript.log} triple per run, plus latest.*. Override with BENCH_OUT.
            try {
                const dir = process.env.BENCH_OUT ?? join(process.cwd(), 'bench-runs');
                mkdirSync(dir, { recursive: true });
                const stamp = new Date().toISOString().replace(/[:.]/g, '-');
                const base = `integration-live_${liveProvider()}_${model}_N${N}_${stamp}`;
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
