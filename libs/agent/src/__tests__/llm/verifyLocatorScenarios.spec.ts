import { describe, expect, it } from 'vitest';

import { createInMemoryCanvasBinding } from '../../canvas/inMemoryCanvasBinding';
import { createCatalogLookup } from '../../catalog';
import {
    LOCATOR_SCENARIOS,
    __getScenarioCheckForTesting,
    __toolResultToMessageContentForTesting,
    collectToolCallChunks,
    dispatchAllToolCalls,
    runAllLocatorScenarios,
    runLocatorScenario,
    runMultiTurnLocatorScenario,
} from '../../llm/verifyLocatorScenarios';
import { LIST_NODES, MOVE_NODE } from '../../tools/nodeTools';
import { createToolExecutor } from '../../tools/toolExecutor';
import { toolset } from '../../tools/toolset';

import type { AgentConfig } from '../../agent';
import type { ChatRequest, Chunk, LlmGateway } from '../../llm/llmGateway';
import type { LocatorScenarioResult } from '../../llm/verifyLocatorScenarios';
import type { AgentGrant } from '../../permissions';
import type { ToolResult } from '../../tools/types';

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

describe('LOCATOR_SCENARIOS knownVariance predicates', () => {
    it('list-nodes-read-only: matches only "no tool call, non-empty text" — not a bare no-tool-call', () => {
        const scenario = LOCATOR_SCENARIOS.find(s => s.id === 'list-nodes-read-only');
        expect(scenario?.knownVariance).toBeDefined();
        expect(scenario!.knownVariance!.matches({ ...baseResult, toolCallName: null, textPresent: true })).toBe(true);
        expect(scenario!.knownVariance!.matches({ ...baseResult, toolCallName: null, textPresent: false })).toBe(false);
        expect(scenario!.knownVariance!.matches({ ...baseResult, toolCallName: 'move_node', textPresent: true })).toBe(
            false
        );
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
                const scenario = LOCATOR_SCENARIOS.find(s => s.id === scenarioId);
                expect(scenario?.knownVariance).toBeDefined();
                expect(scenario!.knownVariance!.matches({ ...baseResult, toolCallName: 'list_nodes' })).toBe(true);
                expect(scenario!.knownVariance!.matches({ ...baseResult, toolCallName: null })).toBe(false);
                expect(scenario!.knownVariance!.matches({ ...baseResult, toolCallName: 'some_other_tool' })).toBe(
                    false
                );
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
        expect(result.error!.length).toBeLessThanOrEqual(200);
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

describe('collectToolCallChunks: merging argsDelta fragments that share an id', () => {
    it('merges a second chunk for the same id into the first, concatenating argsDelta', () => {
        // No existing test ever sends two Chunks for the SAME tool-call id — every other test's
        // batched-call cases use distinct ids. Real providers can stream one call's arguments
        // across multiple chunks, so the accumulator's merge path (as opposed to its far more
        // common "first chunk for this id" path) needs its own direct coverage.
        const chunks: Chunk[] = [
            { toolCall: { id: 'c1', name: 'move_node', argsDelta: '{"nodeId":"text-1",' } },
            { toolCall: { id: 'c1', name: 'move_node', argsDelta: '"by":{"dx":10,"dy":0}}' } },
        ];
        const collected = collectToolCallChunks(chunks);
        expect(collected).toEqual([
            { id: 'c1', name: 'move_node', argsDelta: '{"nodeId":"text-1","by":{"dx":10,"dy":0}}' },
        ]);
    });

    it("keeps the first chunk's thoughtSignature when a later fragment for the same id omits it", () => {
        const chunks: Chunk[] = [
            { toolCall: { id: 'c1', name: 'move_node', argsDelta: '{"a":1', thoughtSignature: 'sig-1' } },
            { toolCall: { id: 'c1', name: 'move_node', argsDelta: '}' } },
        ];
        const collected = collectToolCallChunks(chunks);
        expect(collected).toEqual([{ id: 'c1', name: 'move_node', argsDelta: '{"a":1}', thoughtSignature: 'sig-1' }]);
    });
});

describe('dispatchAllToolCalls: thoughtSignature survives an invalid-JSON call', () => {
    it('preserves thoughtSignature on the synthetic dispatchResult when argsDelta fails to parse', async () => {
        // Every existing invalid-JSON test (in this file and multiTurnLocatorScenarios.spec.ts)
        // scripts a call with no thoughtSignature. Gemini's "thinking" models attach one to every
        // call, including a malformed one, and it must still ride along on the dispatched record —
        // a later multi-turn replay needs it verbatim even for a call that never reached the
        // executor (see the comment on `DispatchedToolCall.argsDelta`).
        const binding = createInMemoryCanvasBinding({ nodes: [], edges: [] });
        const executor = createToolExecutor();
        const config: AgentConfig = {
            id: 'test-config',
            description: 'test',
            systemPrompt: 'test',
            grant: { canModifyCanvas: true },
            tools: [toolset({ binding, catalog: createCatalogLookup([]) }, [LIST_NODES, MOVE_NODE])],
        };
        const userPermissions: AgentGrant = { canModifyCanvas: true };
        const chunks: Chunk[] = [
            { toolCall: { id: 'c1', name: 'move_node', argsDelta: 'not valid json', thoughtSignature: 'sig-1' } },
        ];

        const dispatched = await dispatchAllToolCalls(chunks, executor, config, userPermissions);

        expect(dispatched).toEqual([
            {
                id: 'c1',
                name: 'move_node',
                args: undefined,
                argsDelta: 'not valid json',
                argsValid: false,
                dispatchResult: { toolCallId: 'c1', ok: false, error: 'tool call arguments were not valid JSON' },
                thoughtSignature: 'sig-1',
            },
        ]);
    });
});

describe('runLocatorScenario: selective-multi-node — note distractor via a real batched turn', () => {
    it('fails when a second move_node call moves the note node, using the real dispatch path (no bypass)', async () => {
        // The existing "fails when a second move_node call also mutates an untargeted node" test
        // (above) covers the TEXT-INPUT distractor via the same batched-call mechanism. The NOTE
        // distractor is only reached once the text-input check has already passed, so it needs its
        // own batched-call script rather than reusing that one.
        const gateway = fakeGateway([
            { toolCall: { id: 'c1', name: 'move_node', argsDelta: '{"nodeId":"http-1","by":{"dx":0,"dy":50}}' } },
            { toolCall: { id: 'c2', name: 'move_node', argsDelta: '{"nodeId":"note-1","by":{"dx":5,"dy":5}}' } },
            { done: true },
        ]);
        const result = await runLocatorScenario(gateway, 'selective-multi-node');
        expect(result.pass).toBe(false);
        expect(result.error).toBe('the untargeted note node was also moved');
        expect(result.positionsAfter['http-1']).toEqual({ x: 300, y: 150 });
        expect(result.positionsAfter['text-1']).toEqual(result.positionsBefore['text-1']);
        expect(result.positionsAfter['note-1']).not.toEqual(result.positionsBefore['note-1']);
    });
});

describe('runMultiTurnLocatorScenario: move-named-node-without-id — distractor via a real batched turn', () => {
    it('fails when a second move_node call in the same turn moves a distractor, using the real dispatch path', async () => {
        // Mirrors the selective-multi-node batched-call regression test above, for the multi-turn
        // runner: the model correctly moves the named target AND, in the SAME turn, also moves a
        // distractor — dispatchAllToolCalls dispatches both, so this is a real, reachable failure
        // through the actual runner, not a synthetic outcome.
        const gateway = fakeGateway([
            { toolCall: { id: 'c1', name: 'move_node', argsDelta: '{"nodeId":"node-a17","by":{"dx":100,"dy":0}}' } },
            { toolCall: { id: 'c2', name: 'move_node', argsDelta: '{"nodeId":"node-b42","by":{"dx":1,"dy":1}}' } },
            { done: true },
        ]);
        const result = await runMultiTurnLocatorScenario(gateway, 'move-named-node-without-id');
        expect(result.taskOutcome).toBe('failure');
        expect(result.error).toBe('distractor node node-b42 was also moved');
        expect(result.positionsAfter['node-a17']).toEqual({ x: 300, y: 300 });
        expect(result.positionsAfter['node-b42']).not.toEqual(result.positionsBefore['node-b42']);
        expect(result.positionsAfter['node-c88']).toEqual(result.positionsBefore['node-c88']);
    });
});

/**
 * Defensive `check()` branches that `runLocatorScenario`/`runMultiTurnLocatorScenario` cannot produce
 * through any scripted gateway response — see `__getScenarioCheckForTesting`'s doc comment in
 * verifyLocatorScenarios.ts for the exact invariant each group defends against. These call `check()`
 * directly with a hand-built outcome rather than driving a real scenario run; every other test in this
 * file goes through the real runners.
 */
describe('scenario.check(): defensive branches the real runners can never produce', () => {
    describe('dispatchResult missing (a tool call happened, but no dispatch result was recorded)', () => {
        // This state cannot be produced by the normal scenario runner because a toolCall always
        // causes dispatch (dispatchAllToolCalls dispatches every collected call unconditionally,
        // and dispatchResult = primary?.dispatchResult is only ever undefined when there was no
        // primary call at all — in which case toolCall is also null) — but the defensive check is
        // tested directly to ensure the scenario contract remains robust if that invariant ever
        // changes.
        it.each([
            ['list-nodes-read-only', 'list_nodes', 'list_nodes dispatch failed'],
            ['move-node-right', 'move_node', 'no dispatch result'], // shared factory body — covers move-node-{left,up,down} too
            ['move-node-absolute', 'move_node', 'no dispatch result'],
            ['selective-multi-node', 'move_node', 'no dispatch result'],
            ['unknown-target', 'move_node', 'no dispatch result'],
            ['move-named-node-without-id', 'move_node', 'no dispatch result'],
        ] as const)('%s: fails with %j when dispatchResult is undefined', (scenarioId, toolName, expectedError) => {
            const check = __getScenarioCheckForTesting(scenarioId);
            const result = check({
                toolCall: { id: 'c1', name: toolName, args: {} },
                dispatchResult: undefined,
                toolCalls: [],
                positionsBefore: {},
                positionsAfter: {},
                textPresent: false,
            });
            expect(result.pass).toBe(false);
            expect(result.error).toBe(expectedError);
        });
    });

    describe('canvas mutated when the scenario contract says it must not be', () => {
        // Normal runners cannot create a canvas mutation without a dispatch: no tool call means no
        // dispatch at all (ambiguous-instruction/no-tool-refusal/no-op-instruction all require
        // toolCall === null to reach this check), and a successful list_nodes dispatch never
        // mutates the binding (list-nodes-read-only). This directly validates the defensive
        // scenario checker for a mutation that, by construction, should never happen.
        it.each([
            [
                'ambiguous-instruction',
                { toolCall: null, textPresent: true },
                'canvas was mutated despite the target being ambiguous',
            ],
            [
                'no-tool-refusal',
                { toolCall: null, textPresent: true },
                'canvas was mutated despite no tool call being recorded',
            ],
            [
                'no-op-instruction',
                { toolCall: null, textPresent: true },
                'canvas was mutated despite an explicit no-op instruction',
            ],
        ] as const)(
            '%s: fails with %j when positions differ despite no dispatch',
            (scenarioId, base, expectedError) => {
                const check = __getScenarioCheckForTesting(scenarioId);
                const result = check({
                    ...base,
                    toolCalls: [],
                    positionsBefore: { n1: { x: 0, y: 0 } },
                    positionsAfter: { n1: { x: 1, y: 0 } },
                });
                expect(result.pass).toBe(false);
                expect(result.error).toBe(expectedError);
            }
        );

        it('list-nodes-read-only: fails when positions differ despite a successful (read-only) list_nodes dispatch', () => {
            // Different shape from the group above: this scenario's mutation guard sits AFTER a
            // successful dispatch, not after "no tool call" — list_nodes itself never mutates the
            // binding, so this state is unreachable through the real ToolExecutor.
            const check = __getScenarioCheckForTesting('list-nodes-read-only');
            const result = check({
                toolCall: { id: 'c1', name: 'list_nodes', args: {} },
                dispatchResult: { toolCallId: 'c1', ok: true, data: { nodes: [] } },
                toolCalls: [],
                positionsBefore: { n1: { x: 0, y: 0 } },
                positionsAfter: { n1: { x: 1, y: 0 } },
                textPresent: false,
            });
            expect(result.pass).toBe(false);
            expect(result.error).toBe('canvas was mutated by a read-only scenario');
        });
    });
});

describe('toolResultToMessageContent: the data-omitted-on-success fallback', () => {
    it('falls back to { ok: true } when a successful ToolResult omits data', () => {
        // Both tools this file's scenarios ever dispatch (move_node, list_nodes) always populate
        // `data` on success, so no scripted scenario response reaches this fallback through the
        // real runner — see __toolResultToMessageContentForTesting's doc comment.
        const okNoData: ToolResult = { toolCallId: 'c1', ok: true, data: undefined };
        expect(__toolResultToMessageContentForTesting(okNoData)).toBe(JSON.stringify({ ok: true }));
    });

    it('still serializes real success data unchanged (data present is the common, already-covered case)', () => {
        const okWithData: ToolResult = { toolCallId: 'c1', ok: true, data: { nodeId: 'n1' } };
        expect(__toolResultToMessageContentForTesting(okWithData)).toBe(JSON.stringify({ nodeId: 'n1' }));
    });
});
