import { describe, expect, it } from 'vitest';

import { collect } from '../../agents/baseAgent';
import { createInMemoryCanvasBinding } from '../../canvas/inMemoryCanvasBinding';
import { createNodeMoveToolProvider } from '../../tools/nodeTools';
import { createToolExecutor } from '../../tools/toolExecutor';

import type { Chunk } from '../../llm/llmGateway';

/**
 * Regression coverage for Phase 4's "safe handling of duplicate tool-call IDs" requirement.
 *
 * `collect()` accumulates streamed `toolCall.argsDelta` chunks by `id` — correct for the normal
 * case (one call's JSON growing across several chunks). If a provider ever emitted two genuinely
 * distinct tool calls sharing the same `id` (a provider bug, not something any gateway here is
 * known to do), this same merge path would concatenate both calls' argsDelta strings under one
 * call. These tests lock in that the result degrades safely — the model never gets an extra,
 * unintended tool call, and the ToolExecutor's own argument-schema validation rejects the merged
 * result rather than dispatching a mutation built from a stray concatenation.
 */
const chunksFor = (deltas: Array<{ id: string; name: string; argsDelta: string }>): AsyncIterable<Chunk> => {
    async function* gen() {
        for (const toolCall of deltas) {
            yield { toolCall };
        }
    }
    return gen();
};

describe('collect — duplicate tool-call id handling', () => {
    it('merges two chunks sharing an id into exactly one collected tool call, keeping the first name', async () => {
        const result = await collect(
            chunksFor([
                { id: 'call_1', name: 'move_node', argsDelta: '{"nodeId":"a"}' },
                { id: 'call_1', name: 'a_completely_different_tool', argsDelta: '{"nodeId":"b"}' },
            ])
        );

        expect(result.toolCalls).toHaveLength(1);
        expect(result.toolCalls[0].name).toBe('move_node');
    });

    it('produces args that fail to parse as valid JSON when two full JSON payloads collide under one id', async () => {
        const result = await collect(
            chunksFor([
                { id: 'call_1', name: 'move_node', argsDelta: '{"nodeId":"a"}' },
                { id: 'call_1', name: 'move_node', argsDelta: '{"nodeId":"b"}' },
            ])
        );

        expect(result.toolCalls).toHaveLength(1);
        // Two concatenated complete JSON objects are not valid JSON — safeJsonParse falls back to
        // the raw string rather than throwing, so `args` here is a string, not a parsed object.
        expect(typeof result.toolCalls[0].args).toBe('string');
    });

    it('the real ToolExecutor rejects (never dispatches) a merged/garbled duplicate-id call, and the canvas is never mutated', async () => {
        const binding = createInMemoryCanvasBinding({
            nodes: [{ id: 'text-1', type: 'text-input', position: { x: 100, y: 100 } }],
            edges: [],
        });
        const executor = createToolExecutor();
        const config = {
            id: 'test-agent',
            description: 'test',
            systemPrompt: 'test',
            grant: { canModifyCanvas: true },
            tools: [createNodeMoveToolProvider(binding)],
        };

        const collected = await collect(
            chunksFor([
                { id: 'call_1', name: 'move_node', argsDelta: '{"nodeId":"text-1","by":{"dx":10,"dy":0}}' },
                { id: 'call_1', name: 'move_node', argsDelta: '{"nodeId":"text-1","by":{"dx":20,"dy":0}}' },
            ])
        );
        const call = collected.toolCalls[0];

        const result = await executor.dispatch(config, { id: call.id, name: call.name, args: call.args }, {
            canModifyCanvas: true,
        });

        expect(result.ok).toBe(false);
        expect(binding.readGraph().nodes.find(n => n.id === 'text-1')?.position).toEqual({ x: 100, y: 100 });
    });
});
