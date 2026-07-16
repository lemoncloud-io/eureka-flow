import { describe, expect, it } from 'vitest';

import { createCanvasToolProvider } from '../../canvas/canvasTools';
import { createInMemoryCanvasBinding } from '../../canvas/inMemoryCanvasBinding';
import { createFakeGateway } from '../../llm/fakeGateway';
import { createToolExecutor } from '../../tools/toolExecutor';

import type { AgentConfig } from '../../agent';
import type { Chunk } from '../../llm/llmGateway';
import type { ToolCall } from '../../tools/toolTypes';
import type { NodeData } from '@lemoncloud/eureka-flows-api';

/**
 * W04 contract verification (07.14 meeting): a scripted LLM response containing a tool
 * call flows through the shared LlmGateway contract into the ToolExecutor and mutates the
 * canvas — no real provider involved. The scenario is the meeting's verification case:
 * move the text-input node 10px to the right (the current canvas tool set is
 * list_nodes + move_node; property/color tools come with later providers).
 */

const textInputNode: NodeData = { id: 'text-1', type: 'text-input', position: { x: 100, y: 200 } };

const drain = async (stream: AsyncIterable<Chunk>): Promise<Chunk[]> => {
    const chunks: Chunk[] = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return chunks;
};

const createAgentConfig = (tools: AgentConfig['tools'], grant: AgentConfig['grant']): AgentConfig => ({
    id: 'locator-test',
    description: 'moves canvas nodes in tests',
    systemPrompt: 'You move nodes on the canvas.',
    tools,
    grant,
});

describe('fake gateway → tool executor', () => {
    it('a scripted tool call moves the text-input node 10px right through the executor', async () => {
        const binding = createInMemoryCanvasBinding({ nodes: [textInputNode], edges: [] });
        const agent = createAgentConfig([createCanvasToolProvider(binding)], { canModifyCanvas: true });
        const executor = createToolExecutor();
        const gateway = createFakeGateway([
            {
                text: 'Moving the text input 10px to the right.',
                toolCalls: [{ name: 'move_node', args: { nodeId: 'text-1', by: { dx: 10, dy: 0 } } }],
            },
        ]);

        expect(gateway.capabilities.toolCalls).toBe(true);

        const chunks = await drain(
            gateway.chat({
                messages: [{ role: 'user', content: 'move the text input 10px right' }],
                tools: await executor.listTools(agent),
            })
        );

        const toolChunk = chunks.find(chunk => chunk.toolCall)?.toolCall;
        expect(toolChunk?.name).toBe('move_node');

        const call: ToolCall = {
            id: toolChunk?.id ?? '',
            name: toolChunk?.name ?? '',
            args: JSON.parse(toolChunk?.argsDelta ?? '{}'),
        };
        const result = await executor.dispatch(agent, call);

        expect(result).toEqual({
            toolCallId: call.id,
            ok: true,
            data: { nodeId: 'text-1', label: undefined, from: { x: 100, y: 200 }, to: { x: 110, y: 200 } },
        });
        expect(binding.readGraph().nodes[0].position).toEqual({ x: 110, y: 200 });
    });

    it('the same call is denied without the canvas grant and the node stays put', async () => {
        const binding = createInMemoryCanvasBinding({ nodes: [textInputNode], edges: [] });
        const agent = createAgentConfig([createCanvasToolProvider(binding)], {});
        const executor = createToolExecutor();
        const gateway = createFakeGateway([
            { toolCalls: [{ name: 'move_node', args: { nodeId: 'text-1', by: { dx: 10, dy: 0 } } }] },
        ]);

        const chunks = await drain(gateway.chat({ messages: [{ role: 'user', content: 'move it' }], tools: [] }));
        const toolChunk = chunks.find(chunk => chunk.toolCall)?.toolCall;

        const result = await executor.dispatch(agent, {
            id: toolChunk?.id ?? '',
            name: toolChunk?.name ?? '',
            args: JSON.parse(toolChunk?.argsDelta ?? '{}'),
        });

        expect(result.ok).toBe(false);
        expect(result.ok === false && result.error).toMatch(/permission denied.*canModifyCanvas/);
        expect(binding.readGraph().nodes[0].position).toEqual({ x: 100, y: 200 });
    });
});
