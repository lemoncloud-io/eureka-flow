import { describe, expect, it } from 'vitest';

import { GENERATOR_MODELS } from '../fixtures';
import { IDS, makeInitialGraph, nodeById } from '../fixtures';
import { runScenario } from '../runScenario';

import type { FakeScript, TurnResult } from '../runScenario';

// ── Script builders (fake-gateway steps) ─────────────────────────────────────────────────────────
// There is NO `finish` tool. The orchestrator does its work, then ENDS turn 1 with a plain-text message.
// `runScenario` then re-asks (turn 2) for the outcome as JSON and parses it — so each orchestrator script
// ends with a `text(...)` turn-1 reply followed by `report({...})` (the turn-2 JSON the eval parses).
const step = (toolCalls: { name: string; args: unknown }[]) => ({ toolCalls });
const spawn = (children: { task: string; agentType: string }[]) => step([{ name: 'spawn', args: { children } }]);
const describeNode = (nodeId: string) => step([{ name: 'describe_node', args: { nodeId } }]);
const text = (t: string) => ({ text: t });
/** The turn-2 (eval re-ask) reply: the outcome as a JSON object `runScenario` parses (`parseOutcome`). */
const report = (outcome: Record<string, unknown>) => text(JSON.stringify(outcome));

const moveBy = (nodeId: string, dx: number, dy: number) => ({ name: 'move_node', args: { nodeId, by: { dx, dy } } });
const moveTo = (nodeId: string, x: number, y: number) => ({ name: 'move_node', args: { nodeId, to: { x, y } } });
const setProps = (nodeId: string, config: Record<string, string>) => ({
    name: 'set_properties',
    args: { nodeId, config },
});
const rename = (nodeId: string, label: string) => ({ name: 'rename', args: { nodeId, label } });
const addNode = (type: string, x: number, y: number) => ({ name: 'add_node', args: { type, position: { x, y } } });
const deleteNode = (nodeId: string) => ({ name: 'delete_node', args: { nodeId } });
const connect = (sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string) => ({
    name: 'connect_nodes',
    args: { sourceNodeId, sourcePortId, targetNodeId, targetPortId },
});

/** A no-edit outcome: the graph deep-equals the snapshot and nothing committed. */
const expectUnchanged = (result: TurnResult): void => {
    expect(result.committed).toBe(false);
    expect(result.graph).toEqual(makeInitialGraph());
};

describe('Harness scenarios — outcome coverage', () => {
    // ── applied ──────────────────────────────────────────────────────────────────────────────────
    it('A1 — nudge the input right a bit (relational: x↑, y=)', async () => {
        const script: FakeScript = {
            orchestrator: [
                spawn([{ agentType: 'locator', task: `move node ${IDS.txt} right by 20px` }]),
                text('Moved the input right.'),
                report({ status: 'applied', summary: 'moved the input right' }),
            ],
            locator: [step([moveBy(IDS.txt, 20, 0)]), text(`moved ${IDS.txt}`)],
        };
        const before = nodeById(makeInitialGraph(), IDS.txt).position;
        const result = await runScenario({
            objective: 'nudge the input right a bit',
            initialGraph: makeInitialGraph(),
            script,
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
    });

    it('A2 — set the generator’s model to Gemini 2.5 Pro (merge keeps temperature, no extra keys)', async () => {
        const script: FakeScript = {
            orchestrator: [
                spawn([{ agentType: 'single-output-generator', task: `set model to gemini-2.5-pro on ${IDS.gen}` }]),
                text('Set the generator’s model to gemini-2.5-pro.'),
                report({ status: 'applied', summary: 'set the model' }),
            ],
            'single-output-generator': [
                describeNode(IDS.gen),
                step([setProps(IDS.gen, { model: 'gemini-2.5-pro' })]),
                text('set model'),
            ],
        };
        const result = await runScenario({
            objective: "set the generator's model to Gemini 2.5 Pro",
            initialGraph: makeInitialGraph(),
            script,
        });

        expect(result.outcome.status).toBe('applied');
        expect(nodeById(result.graph, IDS.gen).config).toEqual({ model: 'gemini-2.5-pro', temperature: '0.7' });
    });

    it("A3 — rename the preview to 'Result' (generic block agent by type)", async () => {
        // The preview has no named specialist, so the orchestrator addresses it by its block type
        // (`output-preview`) → a generic BlockAgent resolved via the runner's catalog fallback.
        const script: FakeScript = {
            orchestrator: [
                spawn([{ agentType: 'output-preview', task: `rename ${IDS.prev} to "Result"` }]),
                text('Renamed the preview to Result.'),
                report({ status: 'applied', summary: 'renamed the preview' }),
            ],
            'output-preview': [step([rename(IDS.prev, 'Result')]), text('renamed')],
        };
        const result = await runScenario({
            objective: "rename the preview to 'Result'",
            initialGraph: makeInitialGraph(),
            script,
        });

        expect(result.outcome.status).toBe('applied');
        expect(nodeById(result.graph, IDS.prev).customLabel).toBe('Result');
    });

    it('A4 — line the four up on one column (four locators, one per node; x equal, y kept)', async () => {
        // Each locator moves ONE node; the orchestrator picks the shared column (x=300) and hands each
        // child a complete task. All four locator children share the one `locator` script — a
        // task-parsing step — so each moves the node named in ITS briefing.
        const script: FakeScript = {
            orchestrator: [
                spawn([
                    { agentType: 'locator', task: `move ${IDS.txt} to (300, 100)` },
                    { agentType: 'locator', task: `move ${IDS.buf} to (300, 200)` },
                    { agentType: 'locator', task: `move ${IDS.gen} to (300, 300)` },
                    { agentType: 'locator', task: `move ${IDS.prev} to (300, 400)` },
                ]),
                text('Aligned all four to one column.'),
                report({ status: 'applied', summary: 'aligned all four to one column' }),
            ],
            locator: [
                req => {
                    const task = req.messages.find(m => m.role === 'user')?.content ?? '';
                    const m = /move (\S+) to \((\d+),\s*(\d+)\)/.exec(task);
                    return m ? { toolCalls: [moveTo(m[1], Number(m[2]), Number(m[3]))] } : { text: 'no target' };
                },
                text('moved'),
            ],
        };
        const result = await runScenario({
            objective:
                'line the four nodes up in one column (same x), keeping each node’s current vertical (y) position',
            initialGraph: makeInitialGraph(),
            script,
        });

        expect(result.outcome.status).toBe('applied');
        // all four share one column (relational — never assert a specific value)
        const xs = [IDS.txt, IDS.buf, IDS.gen, IDS.prev].map(id => nodeById(result.graph, id).position.x);
        expect(new Set(xs).size).toBe(1);
        // each y preserved
        expect(nodeById(result.graph, IDS.txt).position.y).toBe(100);
        expect(nodeById(result.graph, IDS.buf).position.y).toBe(200);
        expect(nodeById(result.graph, IDS.gen).position.y).toBe(300);
        expect(nodeById(result.graph, IDS.prev).position.y).toBe(400);
        expect(result.committed).toBe(true);
    });

    // ── applied (structural: block + edge composition) ──────────────────────────────────────────────
    it('A5 — delete the buffer AND rewire input→generator (block + edge composition → applied)', async () => {
        // A compound structural turn: the BUFFER block agent deletes the buffer (its edges cascade, freeing the
        // generator's input), then the edge agent connects the input straight to the generator. Ordered, not
        // concurrent: connect_nodes now REJECTS an occupied input, so the delete must free gen.in BEFORE the
        // rewire lands — the orchestrator sequences the two spawns (delete → connect).
        const script: FakeScript = {
            orchestrator: [
                spawn([{ agentType: 'buffer', task: `delete node ${IDS.buf}` }]),
                spawn([{ agentType: 'edge', task: `connect ${IDS.txt} out to ${IDS.gen} in` }]),
                text('Deleted the buffer and reconnected the input straight into the generator.'),
                report({ status: 'applied', summary: 'deleted the buffer; rewired input→generator' }),
            ],
            buffer: [step([deleteNode(IDS.buf)]), text('deleted the buffer')],
            edge: [step([connect(IDS.txt, 'out', IDS.gen, 'in')]), text('connected input to generator')],
        };
        const result = await runScenario({
            objective: 'delete the buffer and connect the input directly to the generator',
            initialGraph: makeInitialGraph(),
            script,
        });

        expect(result.outcome.status).toBe('applied');
        expect(result.committed).toBe(true);
        // the buffer is gone and no edge references it
        expect(result.graph.nodes.some(n => n.id === IDS.buf)).toBe(false);
        expect(result.graph.edges.some(e => e.sourceNodeId === IDS.buf || e.targetNodeId === IDS.buf)).toBe(false);
        // the input now feeds the generator directly, and gen→prev survives
        expect(result.graph.edges.some(e => e.sourceNodeId === IDS.txt && e.targetNodeId === IDS.gen)).toBe(true);
        expect(result.graph.edges.some(e => e.sourceNodeId === IDS.gen && e.targetNodeId === IDS.prev)).toBe(true);
    });

    it('A6 — add a generator (add + set model in ONE block sub-turn), then wire it (block→edge → applied)', async () => {
        // The block-ownership payoff: the single-output-generator block agent ADDS and CONFIGURES the new node
        // in ONE sub-turn (no node+property split), then the orchestrator threads the new id into the edge
        // spawn. The in-memory binding mints `n_1` for the first add (fixture ids are non-numeric), so the
        // briefings reference it; the ASSERTIONS find the new node by exclusion, so they don't couple to the id.
        const NEW = 'n_1';
        const script: FakeScript = {
            orchestrator: [
                spawn([
                    {
                        agentType: 'single-output-generator',
                        task: 'add a single-output-generator at (900, 300) and set its model to gemini-2.5-pro',
                    },
                ]),
                spawn([{ agentType: 'edge', task: `connect ${IDS.gen} out to ${NEW} in` }]),
                text('Added a generator, set its model, and wired it after the existing generator.'),
                report({ status: 'applied', summary: 'added + configured a new generator; wired it' }),
            ],
            'single-output-generator': [
                step([addNode('single-output-generator', 900, 300)]),
                step([setProps(NEW, { model: 'gemini-2.5-pro' })]),
                text(`added generator ${NEW} and set its model`),
            ],
            edge: [step([connect(IDS.gen, 'out', NEW, 'in')]), text('connected')],
        };
        const result = await runScenario({
            objective: 'add a generator after the existing generator and set its model to gemini-2.5-pro',
            initialGraph: makeInitialGraph(),
            mode: 'serial', // the block agent must add+configure before the edge can reference the new id
            script,
        });

        expect(result.outcome.status).toBe('applied');
        expect(result.committed).toBe(true);
        const added = result.graph.nodes.find(n => n.type === 'single-output-generator' && n.id !== IDS.gen);
        expect(added).toBeDefined();
        // the new node is wired after the existing generator AND carries the configured model
        expect(result.graph.edges.some(e => e.sourceNodeId === IDS.gen && e.targetNodeId === added?.id)).toBe(true);
        expect(added?.config?.model).toBe('gemini-2.5-pro');
    });

    // ── applied (composition: a whole build delegated to the builder) ────────────────────────────────
    it('A7 — build a pipeline (orchestrator plans → ONE builder spawn → builds it)', async () => {
        // The orchestrator plans a multi-block build and hands the WHOLE thing to the composition builder as
        // ONE spawn (not a per-block fan-out). The builder adds the three stages, configures the generator
        // inline, and wires the chain. Empty canvas → the in-memory binding mints n_1, n_2, n_3 for the adds;
        // the assertions find nodes by TYPE, so they never couple to the id scheme.
        const [TXT, GEN, PREV] = ['n_1', 'n_2', 'n_3'];
        const script: FakeScript = {
            orchestrator: [
                spawn([
                    {
                        agentType: 'builder',
                        task: 'Build input-text → single-output-generator (model gemini-2.5-pro) → output-preview, wired in order.',
                    },
                ]),
                text('Built a text → generator → preview pipeline.'),
                report({ status: 'applied', summary: 'built a text → generator → preview pipeline' }),
            ],
            builder: [
                step([addNode('input-text', 100, 100)]),
                step([
                    {
                        name: 'add_node',
                        args: {
                            type: 'single-output-generator',
                            position: { x: 300, y: 100 },
                            config: { model: 'gemini-2.5-pro' },
                        },
                    },
                ]),
                step([addNode('output-preview', 500, 100)]),
                step([connect(TXT, 'out', GEN, 'in'), connect(GEN, 'out', PREV, 'in')]),
                text('built input → generator → preview'),
            ],
        };
        const result = await runScenario({
            objective: 'build a pipeline: a text input feeding a generator feeding a preview',
            initialGraph: { nodes: [], edges: [] },
            script,
        });

        expect(result.outcome.status).toBe('applied');
        expect(result.committed).toBe(true);
        const g = result.graph;
        const typeOf = (t: string) => g.nodes.find(n => n.type === t);
        const txt = typeOf('input-text');
        const gen = typeOf('single-output-generator');
        const prev = typeOf('output-preview');
        expect(txt && gen && prev).toBeTruthy();
        expect(gen?.config?.model).toBe('gemini-2.5-pro');
        expect(g.edges.some(e => e.sourceNodeId === txt!.id && e.targetNodeId === gen!.id)).toBe(true);
        expect(g.edges.some(e => e.sourceNodeId === gen!.id && e.targetNodeId === prev!.id)).toBe(true);
    });

    // ── refused — needs a decision from the user (ambiguity / invalid input) ────────────────────────
    it('Q1 — move "the node" right (ambiguous → refused, asks which)', async () => {
        const reason = `Which node? Candidates: ${IDS.txt}, ${IDS.buf}, ${IDS.gen}, ${IDS.prev}.`;
        const script: FakeScript = {
            orchestrator: [text(reason), report({ status: 'refused', reason })],
        };
        const result = await runScenario({
            objective: 'move the node right',
            initialGraph: makeInitialGraph(),
            script,
        });

        expect(result.outcome.status).toBe('refused');
        if (result.outcome.status === 'refused') {
            expect(result.outcome.reason).toMatch(new RegExp(IDS.txt));
        }
        expectUnchanged(result);
    });

    it('Q2 — set model to gpt-4o (invalid value → block agent rejects → refused, lists valid models)', async () => {
        // The orchestrator delegates the intent high-level — it does NOT pre-check the value. The generator
        // block agent reads the schema, tries the edit, the tool rejects it (gpt-4o not in the enum), and it
        // reports the rejection; the orchestrator surfaces it as refused. Nothing lands.
        const reason = `gpt-4o isn't available. Choose one of: ${GENERATOR_MODELS.join(', ')}.`;
        const script: FakeScript = {
            orchestrator: [
                spawn([{ agentType: 'single-output-generator', task: `set ${IDS.gen} model to gpt-4o` }]),
                text(reason),
                report({ status: 'refused', reason }),
            ],
            'single-output-generator': [
                describeNode(IDS.gen),
                step([setProps(IDS.gen, { model: 'gpt-4o' })]), // rejected — not an allowed model
                text('could not set model: gpt-4o is not an allowed option'),
            ],
        };
        const result = await runScenario({
            objective: "set the generator's model to gpt-4o",
            initialGraph: makeInitialGraph(),
            script,
        });

        expect(result.outcome.status).toBe('refused');
        if (result.outcome.status === 'refused') {
            expect(result.outcome.reason).toContain('gemini-2.5-pro');
        }
        expectUnchanged(result);
    });

    it('Q3 — move the "fetch" node right (no such node → refused)', async () => {
        const reason = 'There is no node named "fetch". Which node did you mean?';
        const script: FakeScript = {
            orchestrator: [text(reason), report({ status: 'refused', reason })],
        };
        const result = await runScenario({
            objective: 'move the fetch node right',
            initialGraph: makeInitialGraph(),
            script,
        });

        expect(result.outcome.status).toBe('refused');
        expectUnchanged(result);
    });

    it("Q4 — set a config field the block doesn't have (unknown key → block agent rejects → refused)", async () => {
        // The generator's fields are model/temperature/topK — there is no `maxTokens`. The orchestrator does
        // not pre-check the field; it delegates the intent. The generator block agent reads the schema, tries
        // the edit, the tool rejects the unknown key, and it reports it — the orchestrator refuses. Nothing lands.
        const reason = 'The generator has no "max tokens" field. Available fields: model, temperature, topK.';
        const script: FakeScript = {
            orchestrator: [
                spawn([{ agentType: 'single-output-generator', task: `set ${IDS.gen} maxTokens to 500` }]),
                text(reason),
                report({ status: 'refused', reason }),
            ],
            'single-output-generator': [
                describeNode(IDS.gen),
                step([setProps(IDS.gen, { maxTokens: '500' })]), // rejected — unknown config key
                text('could not set maxTokens: unknown config key for this block'),
            ],
        };
        const result = await runScenario({
            objective: "set the generator's max tokens to 500",
            initialGraph: makeInitialGraph(),
            script,
        });

        expect(result.outcome.status).toBe('refused');
        expectUnchanged(result);
    });

    // ── refused — cannot act (capability gap / permission) ──────────────────────────────────────────
    it('R1 — run the generator (only task; no run specialist → refused)', async () => {
        // Structural edits are covered now (node/edge). This keeps the capability-gap refusal on a
        // genuinely-unsupported ask: no specialist executes nodes.
        const reason = 'no specialist can run nodes';
        const script: FakeScript = {
            orchestrator: [
                text('I can’t run nodes — no specialist can do that.'),
                report({ status: 'refused', reason }),
            ],
        };
        const result = await runScenario({ objective: 'run the generator', initialGraph: makeInitialGraph(), script });

        expect(result.outcome.status).toBe('refused');
        expectUnchanged(result);
    });

    it('R2 — rename the preview as a viewer (permission denied → refused)', async () => {
        const script: FakeScript = {
            orchestrator: [
                spawn([{ agentType: 'output-preview', task: `rename ${IDS.prev} to "Result"` }]),
                text('I couldn’t rename the preview — permission denied.'),
                report({ status: 'refused', reason: 'permission denied: viewers cannot edit nodes' }),
            ],
            'output-preview': [step([rename(IDS.prev, 'Result')]), text('could not rename: permission denied')],
        };
        // viewer ⇒ empty userPermissions ⇒ rename denied at the executor's requires-gate, even though
        // the block agent grants itself canEditConfig
        const result = await runScenario({
            objective: "rename the preview to 'Result'",
            initialGraph: makeInitialGraph(),
            userPermissions: {},
            script,
        });

        expect(result.outcome.status).toBe('refused');
        // the rename was denied by the user-permission gate — never recorded
        expectUnchanged(result);
    });
});
