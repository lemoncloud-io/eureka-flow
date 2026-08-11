import { describe, expect, it } from 'vitest';

import { LOCATOR_SCENARIOS, runAllLocatorScenarios, runLocatorScenario } from '../../llm/verifyLocatorScenarios';

import type { ChatRequest, Chunk, LlmGateway } from '../../llm/llmGateway';
import type { LocatorScenarioKnownVariance, LocatorScenarioResult } from '../../llm/verifyLocatorScenarios';

/** A minimal fake gateway that ignores the request and streams a scripted response. */
const fakeGateway = (chunks: Chunk[]): LlmGateway => ({
    capabilities: { toolCalls: true },
    async *chat(_req: ChatRequest): AsyncIterable<Chunk> {
        for (const chunk of chunks) yield chunk;
    },
});

const baseResult: LocatorScenarioResult = {
    scenarioId: 'list-nodes-read-only',
    pass: false,
    toolCallName: null,
    textPresent: false,
    positionsBefore: {},
    positionsAfter: {},
};

/**
 * The documented variance allowance of one scenario (throws if the scenario or its allowance is absent — a
 * test-only convenience). Throwing carries the presence assertion these specs used to make separately, and
 * narrows away both `undefined`s, so the predicate reads without non-null assertions.
 */
const varianceOf = (scenarioId: string): LocatorScenarioKnownVariance => {
    const scenario = LOCATOR_SCENARIOS.find(s => s.id === scenarioId);
    if (!scenario) {
        throw new Error(
            `spec: no scenario "${scenarioId}" — registered: ${LOCATOR_SCENARIOS.map(s => s.id).join(', ')}`
        );
    }
    if (!scenario.knownVariance) {
        throw new Error(`spec: scenario "${scenarioId}" documents no knownVariance`);
    }
    return scenario.knownVariance;
};

describe('LOCATOR_SCENARIOS knownVariance predicates', () => {
    it('list-nodes-read-only: matches only "no tool call, non-empty text" — not a bare no-tool-call', () => {
        const variance = varianceOf('list-nodes-read-only');
        expect(variance.matches({ ...baseResult, toolCallName: null, textPresent: true })).toBe(true);
        expect(variance.matches({ ...baseResult, toolCallName: null, textPresent: false })).toBe(false);
        expect(variance.matches({ ...baseResult, toolCallName: 'move_node', textPresent: true })).toBe(false);
    });

    const TARGET_RESOLUTION_SCENARIO_IDS = [
        'move-node-right',
        'move-node-left',
        'move-node-up',
        'move-node-down',
        'move-node-absolute',
        'selective-multi-node',
        'ambiguous-instruction',
        'unknown-target',
    ] as const;

    describe.each(TARGET_RESOLUTION_SCENARIO_IDS)(
        '%s: shares the Gemini lookup-first target-resolution variance',
        scenarioId => {
            it('matches only "called list_nodes instead" — not any other wrong tool', () => {
                const variance = varianceOf(scenarioId);
                expect(variance.matches({ ...baseResult, toolCallName: 'list_nodes' })).toBe(true);
                expect(variance.matches({ ...baseResult, toolCallName: null })).toBe(false);
                expect(variance.matches({ ...baseResult, toolCallName: 'some_other_tool' })).toBe(false);
            });
        }
    );

    it('all eight target-resolution scenarios share the exact same variance object (one general allowance, not per-scenario copies)', () => {
        const variances = TARGET_RESOLUTION_SCENARIO_IDS.map(
            id => LOCATOR_SCENARIOS.find(s => s.id === id)?.knownVariance
        );
        expect(variances.every(v => v === variances[0])).toBe(true);
    });

    it('list-nodes-read-only keeps its own distinct variance object, not the shared target-resolution one', () => {
        const listNodes = LOCATOR_SCENARIOS.find(s => s.id === 'list-nodes-read-only');
        const moveRight = LOCATOR_SCENARIOS.find(s => s.id === 'move-node-right');
        expect(listNodes?.knownVariance).toBeDefined();
        expect(listNodes?.knownVariance).not.toBe(moveRight?.knownVariance);
    });

    it('the only scenarios with no knownVariance allowance are no-tool-refusal and no-op-instruction (no target to resolve)', () => {
        const withoutVariance = LOCATOR_SCENARIOS.filter(s => !s.knownVariance);
        expect(withoutVariance.map(s => s.id)).toEqual(['no-tool-refusal', 'no-op-instruction']);
    });
});

describe('LOCATOR_SCENARIOS catalog', () => {
    it('lists exactly the eleven single-turn scenarios', () => {
        expect(LOCATOR_SCENARIOS.map(s => s.id)).toEqual([
            'list-nodes-read-only',
            'move-node-right',
            'move-node-left',
            'move-node-up',
            'move-node-down',
            'move-node-absolute',
            'selective-multi-node',
            'ambiguous-instruction',
            'no-tool-refusal',
            'no-op-instruction',
            'unknown-target',
        ]);
    });
});

describe('runLocatorScenario: list-nodes-read-only', () => {
    it('passes when the model calls list_nodes and nothing mutates', async () => {
        const gateway = fakeGateway([{ toolCall: { id: 'c1', name: 'list_nodes', argsDelta: '{}' } }, { done: true }]);
        const result = await runLocatorScenario(gateway, 'list-nodes-read-only');
        expect(result.pass).toBe(true);
        expect(result.toolCallName).toBe('list_nodes');
        expect(result.positionsBefore).toEqual(result.positionsAfter);
    });

    it('fails when the model answers from context instead of calling the tool', async () => {
        const gateway = fakeGateway([{ text: 'There are 2 nodes: text-1 and note-1.' }, { done: true }]);
        const result = await runLocatorScenario(gateway, 'list-nodes-read-only');
        expect(result.pass).toBe(false);
        expect(result.toolCallName).toBeNull();
        expect(result.error).toMatch(/did not call list_nodes/);
    });

    it('fails when the model calls move_node instead (wrong tool, and it mutates)', async () => {
        const gateway = fakeGateway([
            { toolCall: { id: 'c1', name: 'move_node', argsDelta: '{"nodeId":"text-1","by":{"dx":10,"dy":0}}' } },
            { done: true },
        ]);
        const result = await runLocatorScenario(gateway, 'list-nodes-read-only');
        expect(result.pass).toBe(false);
        expect(result.toolCallName).toBe('move_node');
        expect(result.error).toMatch(/unexpected tool call: move_node/);
    });

    it('fails when list_nodes is called but ToolExecutor.dispatch itself fails (invalid args)', async () => {
        // `list_nodes`'s schema requires an object (possibly empty) — `null` fails schema
        // validation at the executor level before the handler ever runs, giving a genuine
        // `dispatchResult.ok === false` for a tool the model otherwise named correctly.
        const gateway = fakeGateway([
            { toolCall: { id: 'c1', name: 'list_nodes', argsDelta: 'null' } },
            { done: true },
        ]);
        const result = await runLocatorScenario(gateway, 'list-nodes-read-only');
        expect(result.pass).toBe(false);
        expect(result.toolCallName).toBe('list_nodes');
        expect(result.dispatchOk).toBe(false);
        expect(result.error).toMatch(/invalid args/);
    });
});

describe.each([
    ['move-node-right', '{"nodeId":"text-1","by":{"dx":100,"dy":0}}', { x: 300, y: 200 }],
    ['move-node-left', '{"nodeId":"text-1","by":{"dx":-100,"dy":0}}', { x: 100, y: 200 }],
    ['move-node-up', '{"nodeId":"text-1","by":{"dx":0,"dy":-100}}', { x: 200, y: 100 }],
    ['move-node-down', '{"nodeId":"text-1","by":{"dx":0,"dy":100}}', { x: 200, y: 300 }],
] as const)('runLocatorScenario: %s', (scenarioId, argsDelta, expectedPosition) => {
    it(`passes with the correct relative delta -> ${JSON.stringify(expectedPosition)}`, async () => {
        const gateway = fakeGateway([{ toolCall: { id: 'c1', name: 'move_node', argsDelta } }, { done: true }]);
        const result = await runLocatorScenario(gateway, scenarioId);
        expect(result.pass).toBe(true);
        expect(result.positionsAfter['text-1']).toEqual(expectedPosition);
    });

    it('fails with no partial credit when the delta lands on the wrong position', async () => {
        const gateway = fakeGateway([
            { toolCall: { id: 'c1', name: 'move_node', argsDelta: '{"nodeId":"text-1","by":{"dx":1,"dy":1}}' } },
            { done: true },
        ]);
        const result = await runLocatorScenario(gateway, scenarioId);
        expect(result.pass).toBe(false);
        expect(result.error).toMatch(/node moved to/);
    });

    it('fails when ToolExecutor.dispatch itself fails (the named node does not exist)', async () => {
        const gateway = fakeGateway([
            {
                toolCall: {
                    id: 'c1',
                    name: 'move_node',
                    argsDelta: '{"nodeId":"does-not-exist","by":{"dx":100,"dy":0}}',
                },
            },
            { done: true },
        ]);
        const result = await runLocatorScenario(gateway, scenarioId);
        expect(result.pass).toBe(false);
        expect(result.dispatchOk).toBe(false);
        expect(result.error).toMatch(/no node with id/);
    });
});

describe('runLocatorScenario: move-node-absolute', () => {
    it('passes when the model calls move_node with the exact `to` position', async () => {
        const gateway = fakeGateway([
            { toolCall: { id: 'c1', name: 'move_node', argsDelta: '{"nodeId":"text-1","to":{"x":400,"y":350}}' } },
            { done: true },
        ]);
        const result = await runLocatorScenario(gateway, 'move-node-absolute');
        expect(result.pass).toBe(true);
        expect(result.positionsAfter['text-1']).toEqual({ x: 400, y: 350 });
    });

    it('fails with no partial credit when the position is off', async () => {
        const gateway = fakeGateway([
            { toolCall: { id: 'c1', name: 'move_node', argsDelta: '{"nodeId":"text-1","to":{"x":400,"y":300}}' } },
            { done: true },
        ]);
        const result = await runLocatorScenario(gateway, 'move-node-absolute');
        expect(result.pass).toBe(false);
        expect(result.error).toMatch(/expected \(400,350\)/);
    });

    it('fails when ToolExecutor.dispatch itself fails (the named node does not exist)', async () => {
        const gateway = fakeGateway([
            {
                toolCall: {
                    id: 'c1',
                    name: 'move_node',
                    argsDelta: '{"nodeId":"does-not-exist","to":{"x":400,"y":350}}',
                },
            },
            { done: true },
        ]);
        const result = await runLocatorScenario(gateway, 'move-node-absolute');
        expect(result.pass).toBe(false);
        expect(result.dispatchOk).toBe(false);
        expect(result.error).toMatch(/no node with id/);
    });

    it('fails when the model calls an unexpected (non-move_node) tool', async () => {
        const gateway = fakeGateway([{ toolCall: { id: 'c1', name: 'list_nodes', argsDelta: '{}' } }, { done: true }]);
        const result = await runLocatorScenario(gateway, 'move-node-absolute');
        expect(result.pass).toBe(false);
        expect(result.error).toMatch(/unexpected tool call: list_nodes/);
    });
});

describe('runLocatorScenario: selective-multi-node', () => {
    it('passes when only the named node moves and the other two stay put', async () => {
        const gateway = fakeGateway([
            { toolCall: { id: 'c1', name: 'move_node', argsDelta: '{"nodeId":"http-1","by":{"dx":0,"dy":50}}' } },
            { done: true },
        ]);
        const result = await runLocatorScenario(gateway, 'selective-multi-node');
        expect(result.pass).toBe(true);
        expect(result.positionsAfter['http-1']).toEqual({ x: 300, y: 150 });
        expect(result.positionsAfter['text-1']).toEqual(result.positionsBefore['text-1']);
        expect(result.positionsAfter['note-1']).toEqual(result.positionsBefore['note-1']);
    });

    it('fails when the model also moves an untargeted node', async () => {
        const gateway = fakeGateway([
            {
                toolCall: { id: 'c1', name: 'move_node', argsDelta: '{"nodeId":"text-1","by":{"dx":10,"dy":0}}' },
            },
            { done: true },
        ]);
        const result = await runLocatorScenario(gateway, 'selective-multi-node');
        expect(result.pass).toBe(false);
    });

    it('fails when ToolExecutor.dispatch itself fails (the named http node does not exist)', async () => {
        const gateway = fakeGateway([
            {
                toolCall: {
                    id: 'c1',
                    name: 'move_node',
                    argsDelta: '{"nodeId":"does-not-exist","by":{"dx":0,"dy":50}}',
                },
            },
            { done: true },
        ]);
        const result = await runLocatorScenario(gateway, 'selective-multi-node');
        expect(result.pass).toBe(false);
        expect(result.dispatchOk).toBe(false);
        expect(result.error).toMatch(/no node with id/);
    });
});

// Regression coverage for the batched-tool-call fix: gateways emit one Chunk per distinct tool
// call, and a single turn can legitimately contain more than one — the runner must dispatch every
// one of them, in order, not just the first (see `dispatchAllToolCalls`/`pickPrimaryToolCall`).
describe('runLocatorScenario: batched multiple tool calls in one turn', () => {
    it('two valid tool calls (list_nodes then correct move_node) still passes', async () => {
        const gateway = fakeGateway([
            { toolCall: { id: 'c1', name: 'list_nodes', argsDelta: '{}' } },
            { toolCall: { id: 'c2', name: 'move_node', argsDelta: '{"nodeId":"text-1","by":{"dx":100,"dy":0}}' } },
            { done: true },
        ]);
        const result = await runLocatorScenario(gateway, 'move-node-right');
        expect(result.pass).toBe(true);
        expect(result.toolCallName).toBe('move_node');
        expect(result.toolCalls).toEqual([
            { name: 'list_nodes', argsValid: true, dispatchOk: true },
            { name: 'move_node', argsValid: true, dispatchOk: true },
        ]);
    });

    it('a batched list_nodes + correct move_node is not incorrectly rejected on the list_nodes name', async () => {
        // Before the fix, only the FIRST chunk's tool call was ever read — list_nodes here — so this
        // exact case would have failed with "unexpected tool call: list_nodes" despite the model
        // also correctly calling move_node in the same turn.
        const gateway = fakeGateway([
            { toolCall: { id: 'c1', name: 'list_nodes', argsDelta: '{}' } },
            { toolCall: { id: 'c2', name: 'move_node', argsDelta: '{"nodeId":"http-1","by":{"dx":0,"dy":50}}' } },
            { done: true },
        ]);
        const result = await runLocatorScenario(gateway, 'selective-multi-node');
        expect(result.pass).toBe(true);
        expect(result.error).toBeUndefined();
    });

    it('selective-multi-node fails when a second move_node call also mutates an untargeted node', async () => {
        // Before the fix, only the first chunk (the correct http-1 move) was ever dispatched, so
        // the second, erroneous text-1 move never happened and never showed up in positionsAfter —
        // this exact regression could pass when it should fail.
        const gateway = fakeGateway([
            { toolCall: { id: 'c1', name: 'move_node', argsDelta: '{"nodeId":"http-1","by":{"dx":0,"dy":50}}' } },
            { toolCall: { id: 'c2', name: 'move_node', argsDelta: '{"nodeId":"text-1","by":{"dx":10,"dy":0}}' } },
            { done: true },
        ]);
        const result = await runLocatorScenario(gateway, 'selective-multi-node');
        expect(result.pass).toBe(false);
        expect(result.error).toBe('the untargeted text-input node was also moved');
        // Both calls were genuinely dispatched — the failure comes from the scenario's own final-
        // state policy, not from either individual dispatch failing.
        expect(result.toolCalls).toEqual([
            { name: 'move_node', argsValid: true, dispatchOk: true },
            { name: 'move_node', argsValid: true, dispatchOk: true },
        ]);
        expect(result.positionsAfter['http-1']).toEqual({ x: 300, y: 150 });
        expect(result.positionsAfter['text-1']).not.toEqual(result.positionsBefore['text-1']);
    });

    it('one valid + one executor-rejected call: the rejected one stays visible without blocking the valid one', async () => {
        const gateway = fakeGateway([
            { toolCall: { id: 'c1', name: 'move_node', argsDelta: '{"nodeId":"text-1","by":{"dx":100,"dy":0}}' } },
            {
                toolCall: {
                    id: 'c2',
                    name: 'move_node',
                    argsDelta: '{"nodeId":"does-not-exist","by":{"dx":1,"dy":1}}',
                },
            },
            { done: true },
        ]);
        const result = await runLocatorScenario(gateway, 'move-node-right');
        expect(result.pass).toBe(true);
        expect(result.toolCalls).toEqual([
            { name: 'move_node', argsValid: true, dispatchOk: true },
            { name: 'move_node', argsValid: true, dispatchOk: false },
        ]);
    });

    it('one valid + one malformed-JSON call: the malformed one stays visible and is never silently dropped', async () => {
        const gateway = fakeGateway([
            { toolCall: { id: 'c1', name: 'move_node', argsDelta: 'not json' } },
            { toolCall: { id: 'c2', name: 'move_node', argsDelta: '{"nodeId":"text-1","by":{"dx":100,"dy":0}}' } },
            { done: true },
        ]);
        const result = await runLocatorScenario(gateway, 'move-node-right');
        // The malformed call is picked as the primary (first non-list_nodes call), so the overall
        // scenario fails on it — a model that emits invalid JSON at all has a real defect, even if
        // a later call in the same turn would have succeeded on its own.
        expect(result.pass).toBe(false);
        expect(result.error).toBe('tool call arguments were not valid JSON');
        expect(result.toolCalls).toEqual([
            { name: 'move_node', argsValid: false },
            { name: 'move_node', argsValid: true, dispatchOk: true },
        ]);
        // The second call still genuinely ran — final-state tracking is never silently skipped just
        // because an earlier call in the same turn was malformed.
        expect(result.positionsAfter['text-1']).toEqual({ x: 300, y: 200 });
    });

    it('preserves emission order in toolCalls regardless of which call is picked as primary', async () => {
        const gateway = fakeGateway([
            { toolCall: { id: 'c1', name: 'move_node', argsDelta: '{"nodeId":"text-1","by":{"dx":100,"dy":0}}' } },
            { toolCall: { id: 'c2', name: 'list_nodes', argsDelta: '{}' } },
            { done: true },
        ]);
        const result = await runLocatorScenario(gateway, 'move-node-right');
        expect(result.pass).toBe(true);
        expect(result.toolCalls).toEqual([
            { name: 'move_node', argsValid: true, dispatchOk: true },
            { name: 'list_nodes', argsValid: true, dispatchOk: true },
        ]);
    });

    it('single-call behavior is unchanged: exactly one tool call still round-trips with no toolCalls-array surprises', async () => {
        const gateway = fakeGateway([
            { toolCall: { id: 'c1', name: 'move_node', argsDelta: '{"nodeId":"text-1","by":{"dx":100,"dy":0}}' } },
            { done: true },
        ]);
        const result = await runLocatorScenario(gateway, 'move-node-right');
        expect(result.pass).toBe(true);
        expect(result.toolCalls).toEqual([{ name: 'move_node', argsValid: true, dispatchOk: true }]);
    });
});

describe('runLocatorScenario: ambiguous-instruction', () => {
    it('passes when the model asks for clarification with no tool call', async () => {
        const gateway = fakeGateway([
            { text: 'There are two text input nodes — which one did you mean?' },
            { done: true },
        ]);
        const result = await runLocatorScenario(gateway, 'ambiguous-instruction');
        expect(result.pass).toBe(true);
        expect(result.toolCallName).toBeNull();
    });

    it('fails when the model guesses and moves one of the ambiguous nodes', async () => {
        const gateway = fakeGateway([
            { toolCall: { id: 'c1', name: 'move_node', argsDelta: '{"nodeId":"text-a","by":{"dx":50,"dy":0}}' } },
            { done: true },
        ]);
        const result = await runLocatorScenario(gateway, 'ambiguous-instruction');
        expect(result.pass).toBe(false);
        expect(result.error).toMatch(/unexpected tool call: move_node/);
    });

    it('fails when the model produces neither a tool call nor any text', async () => {
        const gateway = fakeGateway([{ done: true }]);
        const result = await runLocatorScenario(gateway, 'ambiguous-instruction');
        expect(result.pass).toBe(false);
        expect(result.error).toMatch(/neither a tool call nor a text response/);
    });
});

describe('runLocatorScenario: no-op-instruction', () => {
    it('passes when the model confirms in text with no tool call', async () => {
        const gateway = fakeGateway([{ text: 'Sure, nothing moved.' }, { done: true }]);
        const result = await runLocatorScenario(gateway, 'no-op-instruction');
        expect(result.pass).toBe(true);
        expect(result.positionsBefore).toEqual(result.positionsAfter);
    });

    it('fails when the model moves the node anyway', async () => {
        const gateway = fakeGateway([
            { toolCall: { id: 'c1', name: 'move_node', argsDelta: '{"nodeId":"text-1","by":{"dx":10,"dy":0}}' } },
            { done: true },
        ]);
        const result = await runLocatorScenario(gateway, 'no-op-instruction');
        expect(result.pass).toBe(false);
        expect(result.error).toMatch(/unexpected tool call: move_node/);
    });

    it('fails when the model produces neither a tool call nor any text', async () => {
        const gateway = fakeGateway([{ done: true }]);
        const result = await runLocatorScenario(gateway, 'no-op-instruction');
        expect(result.pass).toBe(false);
        expect(result.error).toMatch(/neither a tool call nor any text response/);
    });
});

describe('runLocatorScenario: no-tool-refusal', () => {
    it('passes when the model refuses in text with no tool call', async () => {
        const gateway = fakeGateway([{ text: 'I can only move nodes, not delete them.' }, { done: true }]);
        const result = await runLocatorScenario(gateway, 'no-tool-refusal');
        expect(result.pass).toBe(true);
        expect(result.toolCallName).toBeNull();
    });

    it('fails when the model calls a tool anyway', async () => {
        const gateway = fakeGateway([
            { toolCall: { id: 'c1', name: 'move_node', argsDelta: '{"nodeId":"text-1","by":{"dx":0,"dy":0}}' } },
            { done: true },
        ]);
        const result = await runLocatorScenario(gateway, 'no-tool-refusal');
        expect(result.pass).toBe(false);
        expect(result.error).toMatch(/unexpected tool call: move_node/);
    });

    it('fails when the model produces neither a tool call nor any text', async () => {
        const gateway = fakeGateway([{ done: true }]);
        const result = await runLocatorScenario(gateway, 'no-tool-refusal');
        expect(result.pass).toBe(false);
        expect(result.error).toMatch(/neither a tool call nor any text/);
    });
});

describe('runLocatorScenario: unknown-target', () => {
    it('passes via the refusal path when the model declines in text', async () => {
        const gateway = fakeGateway([{ text: "I couldn't find a node called Header." }, { done: true }]);
        const result = await runLocatorScenario(gateway, 'unknown-target');
        expect(result.pass).toBe(true);
        expect(result.path).toBe('refusal');
    });

    it('passes via the executor-error path when ToolExecutor rejects the unknown id', async () => {
        const gateway = fakeGateway([
            { toolCall: { id: 'c1', name: 'move_node', argsDelta: '{"nodeId":"header-1","by":{"dx":100,"dy":0}}' } },
            { done: true },
        ]);
        const result = await runLocatorScenario(gateway, 'unknown-target');
        expect(result.pass).toBe(true);
        expect(result.path).toBe('executor-error');
    });

    it('fails, and is distinguishable from a pass, when the model moves an unrelated real node', async () => {
        const gateway = fakeGateway([
            { toolCall: { id: 'c1', name: 'move_node', argsDelta: '{"nodeId":"text-1","by":{"dx":100,"dy":0}}' } },
            { done: true },
        ]);
        const result = await runLocatorScenario(gateway, 'unknown-target');
        expect(result.pass).toBe(false);
        expect(result.path).toBeUndefined();
        expect(result.error).toMatch(/moved a real node/);
    });

    it('fails silently (no tool call, no text) rather than defaulting to a pass', async () => {
        const gateway = fakeGateway([{ done: true }]);
        const result = await runLocatorScenario(gateway, 'unknown-target');
        expect(result.pass).toBe(false);
        expect(result.path).toBeUndefined();
        expect(result.error).toMatch(/neither a tool call nor a text response/);
    });

    it('fails when the model calls an unexpected (non-move_node) tool', async () => {
        const gateway = fakeGateway([{ toolCall: { id: 'c1', name: 'list_nodes', argsDelta: '{}' } }, { done: true }]);
        const result = await runLocatorScenario(gateway, 'unknown-target');
        expect(result.pass).toBe(false);
        expect(result.path).toBeUndefined();
        expect(result.error).toMatch(/unexpected tool call: list_nodes/);
    });

    it('fails on a dispatch error that is NOT the expected "no node with id" pattern', async () => {
        // A real, existing node id, but neither `by` nor `to` — ToolExecutor rejects this with a
        // different error than the unknown-node one this scenario's executor-error path expects.
        const gateway = fakeGateway([
            { toolCall: { id: 'c1', name: 'move_node', argsDelta: '{"nodeId":"text-1"}' } },
            { done: true },
        ]);
        const result = await runLocatorScenario(gateway, 'unknown-target');
        expect(result.pass).toBe(false);
        expect(result.path).toBeUndefined();
        expect(result.dispatchOk).toBe(false);
        expect(result.error).toMatch(/unexpected executor error/);
        expect(result.error).not.toMatch(/no node with id/);
    });
});

describe('runLocatorScenario: error handling', () => {
    it('catches a thrown gateway error and returns a short, truncated message', async () => {
        const gateway: LlmGateway = {
            capabilities: { toolCalls: true },
            // eslint-disable-next-line require-yield -- intentionally throws before any yield
            async *chat(): AsyncIterable<Chunk> {
                throw new Error('OpenAI request failed with status 401: invalid key [redacted]'.repeat(5));
            },
        };
        const result = await runLocatorScenario(gateway, 'move-node-right');
        expect(result.pass).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error?.length).toBeLessThanOrEqual(200);
    });

    it('stringifies a thrown non-Error value from the gateway (e.g. a plain string)', async () => {
        const gateway: LlmGateway = {
            capabilities: { toolCalls: true },
            // eslint-disable-next-line require-yield -- intentionally throws before any yield
            async *chat(): AsyncIterable<Chunk> {
                throw 'plain string thrown, not an Error';
            },
        };
        const result = await runLocatorScenario(gateway, 'move-node-right');
        expect(result.pass).toBe(false);
        expect(result.providerError).toBe(true);
        expect(result.error).toBe('plain string thrown, not an Error');
    });

    it('fails to parse a tool call whose argsDelta is not valid JSON, without ever dispatching', async () => {
        const gateway = fakeGateway([
            { toolCall: { id: 'c1', name: 'move_node', argsDelta: '{not valid json' } },
            { done: true },
        ]);
        const result = await runLocatorScenario(gateway, 'move-node-right');
        expect(result.pass).toBe(false);
        expect(result.argsValid).toBe(false);
        expect(result.dispatchOk).toBeUndefined();
        expect(result.error).toBe('tool call arguments were not valid JSON');
    });

    it('throws for an unknown scenario id', async () => {
        const gateway = fakeGateway([{ done: true }]);
        await expect(
            runLocatorScenario(gateway, 'not-a-real-scenario' as unknown as Parameters<typeof runLocatorScenario>[1])
        ).rejects.toThrow(/unknown locator scenario id/);
    });
});

describe('runAllLocatorScenarios', () => {
    it('runs every catalog scenario, in order', async () => {
        const gateway = fakeGateway([{ text: 'ok' }, { done: true }]);
        const results = await runAllLocatorScenarios(gateway);
        expect(results.map(r => r.scenarioId)).toEqual(LOCATOR_SCENARIOS.map(s => s.id));
    });
});
