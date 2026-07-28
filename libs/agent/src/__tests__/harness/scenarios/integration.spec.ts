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
const describeBlock = (type: string) => step([{ name: 'describe_block', args: { type } }]);
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
                spawn([{ agentType: 'property', task: `set model to gemini-2.5-pro on ${IDS.gen}` }]),
                text('Set the generator’s model to gemini-2.5-pro.'),
                report({ status: 'applied', summary: 'set the model' }),
            ],
            property: [
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

    it("A3 — rename the preview to 'Result'", async () => {
        const script: FakeScript = {
            orchestrator: [
                spawn([{ agentType: 'property', task: `rename ${IDS.prev} to "Result"` }]),
                text('Renamed the preview to Result.'),
                report({ status: 'applied', summary: 'renamed the preview' }),
            ],
            property: [step([rename(IDS.prev, 'Result')]), text('renamed')],
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

    // ── partial ──────────────────────────────────────────────────────────────────────────────────
    it('P1 — move the input right AND delete the preview (delete unsupported → partial)', async () => {
        const script: FakeScript = {
            orchestrator: [
                spawn([{ agentType: 'locator', task: `move ${IDS.txt} right by 20px` }]),
                text('Moved the input right; I can’t delete the preview (no specialist can delete nodes).'),
                report({
                    status: 'partial',
                    summary: 'moved the input; cannot delete',
                    applied: [`move ${IDS.txt}`],
                    failed: [{ task: `delete ${IDS.prev}`, reason: 'no specialist can delete nodes' }],
                }),
            ],
            locator: [step([moveBy(IDS.txt, 20, 0)]), text('moved')],
        };
        const result = await runScenario({
            objective: 'move the input right and delete the preview',
            initialGraph: makeInitialGraph(),
            script,
        });

        expect(result.outcome.status).toBe('partial');
        expect(result.committed).toBe(true);
        // only the move landed (relational, like A1 — never assert an exact x)
        const after = nodeById(result.graph, IDS.txt).position;
        expect(after.x).toBeGreaterThan(100);
        expect(after.y).toBe(100);
        // the other nodes are untouched (the preview is still present at its original spot)
        for (const id of [IDS.buf, IDS.gen, IDS.prev]) {
            expect(nodeById(result.graph, id).position).toEqual(nodeById(makeInitialGraph(), id).position);
        }
        if (result.outcome.status === 'partial') {
            expect(result.outcome.failed).toHaveLength(1);
            expect(result.outcome.failed[0].task).toContain(IDS.prev);
        }
    });

    it('P2 — set model + bad topK (wrong type → partial)', async () => {
        const script: FakeScript = {
            orchestrator: [
                spawn([{ agentType: 'property', task: `set model=gemini-2.5-pro AND topK=abc on ${IDS.gen}` }]),
                text('Set the model to gemini-2.5-pro; topK "abc" was rejected (not a number).'),
                report({
                    status: 'partial',
                    summary: 'set the model; topK rejected',
                    applied: ['set model'],
                    failed: [{ task: 'set topK', reason: 'topK "abc" is not a number' }],
                }),
            ],
            property: [
                step([setProps(IDS.gen, { model: 'gemini-2.5-pro' })]),
                step([setProps(IDS.gen, { topK: 'abc' })]), // rejected — not a number
                text('set model=gemini-2.5-pro; topK=abc rejected (not a number)'),
            ],
        };
        const result = await runScenario({
            objective: "set the generator's model to Gemini 2.5 Pro and its topK to abc",
            initialGraph: makeInitialGraph(),
            script,
        });

        expect(result.outcome.status).toBe('partial');
        expect(nodeById(result.graph, IDS.gen).config?.model).toBe('gemini-2.5-pro');
        expect(nodeById(result.graph, IDS.gen).config?.topK).toBeUndefined(); // unchanged (never applied)
        if (result.outcome.status === 'partial') {
            expect(result.outcome.failed[0].task.toLowerCase()).toContain('topk');
        }
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

    it('Q2 — set model to gpt-4o (invalid value → refused, lists valid models)', async () => {
        const reason = `gpt-4o isn't available. Choose one of: ${GENERATOR_MODELS.join(', ')}.`;
        const script: FakeScript = {
            orchestrator: [
                describeBlock('single-output-generator'),
                text(reason),
                report({ status: 'refused', reason }),
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

    it("Q4 — set a config field the block doesn't have (unknown key → refused)", async () => {
        // The generator's fields are model/temperature/topK — there is no `maxTokens`. The orchestrator
        // checks the block, sees the field does not exist, invents nothing, and refuses.
        const reason = 'The generator has no "max tokens" field. Available fields: model, temperature, topK.';
        const script: FakeScript = {
            orchestrator: [
                describeBlock('single-output-generator'),
                text(reason),
                report({ status: 'refused', reason }),
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
    it('R1 — delete the preview (only task; unsupported → refused)', async () => {
        const reason = 'no specialist can delete nodes';
        const script: FakeScript = {
            orchestrator: [
                text('I can’t delete nodes yet — no specialist can do that.'),
                report({ status: 'refused', reason }),
            ],
        };
        const result = await runScenario({ objective: 'delete the preview', initialGraph: makeInitialGraph(), script });

        expect(result.outcome.status).toBe('refused');
        expectUnchanged(result);
    });

    it('R2 — rename the preview as a viewer (permission denied → refused)', async () => {
        const script: FakeScript = {
            orchestrator: [
                spawn([{ agentType: 'property', task: `rename ${IDS.prev} to "Result"` }]),
                text('I couldn’t rename the preview — permission denied.'),
                report({ status: 'refused', reason: 'permission denied: viewers cannot edit nodes' }),
            ],
            property: [step([rename(IDS.prev, 'Result')]), text('could not rename: permission denied')],
        };
        // viewer ⇒ empty userPermissions ⇒ rename denied at the executor's requires-gate, even though
        // the property agent grants itself canEditConfig
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
