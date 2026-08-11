import { describe, expect, it } from 'vitest';

import { verifyMoveNodeToolCall } from '../../llm/verifyProviderToolCall';

import type { ChatRequest, Chunk, LlmGateway } from '../../llm/llmGateway';

/** A minimal fake gateway that ignores the request and streams a scripted response. */
const fakeGateway = (chunks: Chunk[]): LlmGateway => ({
    capabilities: { toolCalls: true },
    async *chat(_req: ChatRequest): AsyncIterable<Chunk> {
        for (const chunk of chunks) yield chunk;
    },
});

describe('verifyMoveNodeToolCall', () => {
    it('passes when the gateway emits a correct move_node call', async () => {
        const gateway = fakeGateway([
            { toolCall: { id: 'c1', name: 'move_node', argsDelta: '{"nodeId":"text-1","by":{"dx":100,"dy":0}}' } },
            { done: true },
        ]);

        const result = await verifyMoveNodeToolCall(gateway);

        expect(result).toEqual({
            toolCallName: 'move_node',
            positionBefore: { x: 100, y: 200 },
            positionAfter: { x: 200, y: 200 },
            pass: true,
            toolCalls: [{ name: 'move_node', argsValid: true, dispatchOk: true }],
        });
    });

    it('fails with no error leak when the model returns plain text only (no tool call)', async () => {
        const gateway = fakeGateway([{ text: 'I cannot do that.' }, { done: true }]);

        const result = await verifyMoveNodeToolCall(gateway);

        expect(result.pass).toBe(false);
        expect(result.toolCallName).toBeNull();
        expect(result.error).toMatch(/did not emit a structured tool call/);
        expect(result.positionAfter).toEqual({ x: 100, y: 200 });
    });

    it('fails when the model calls an unexpected tool', async () => {
        const gateway = fakeGateway([{ toolCall: { id: 'c1', name: 'list_nodes', argsDelta: '{}' } }, { done: true }]);

        const result = await verifyMoveNodeToolCall(gateway);

        expect(result.pass).toBe(false);
        expect(result.toolCallName).toBe('list_nodes');
        expect(result.error).toMatch(/unexpected tool call: list_nodes/);
    });

    it('fails when the tool call args are not valid JSON', async () => {
        const gateway = fakeGateway([
            { toolCall: { id: 'c1', name: 'move_node', argsDelta: 'not json' } },
            { done: true },
        ]);

        const result = await verifyMoveNodeToolCall(gateway);

        expect(result.pass).toBe(false);
        expect(result.error).toMatch(/not valid JSON/);
    });

    it('fails when the tool call targets the wrong node / delta (no partial credit)', async () => {
        const gateway = fakeGateway([
            { toolCall: { id: 'c1', name: 'move_node', argsDelta: '{"nodeId":"text-1","by":{"dx":10,"dy":0}}' } },
            { done: true },
        ]);

        const result = await verifyMoveNodeToolCall(gateway);

        expect(result.pass).toBe(false);
        expect(result.positionAfter).toEqual({ x: 110, y: 200 });
        expect(result.error).toMatch(/expected \(200,200\)/);
    });

    it('fails when the tool call references an unknown node id (executor rejects it)', async () => {
        const gateway = fakeGateway([
            { toolCall: { id: 'c1', name: 'move_node', argsDelta: '{"nodeId":"ghost","by":{"dx":100,"dy":0}}' } },
            { done: true },
        ]);

        const result = await verifyMoveNodeToolCall(gateway);

        expect(result.pass).toBe(false);
        expect(result.error).toMatch(/no node with id/);
    });

    it('catches a thrown gateway error and returns a short, truncated message (no raw leak)', async () => {
        const gateway: LlmGateway = {
            capabilities: { toolCalls: true },
            // eslint-disable-next-line require-yield -- intentionally throws before any yield
            async *chat(): AsyncIterable<Chunk> {
                throw new Error('OpenAI request failed with status 401: invalid key [redacted]'.repeat(5));
            },
        };

        const result = await verifyMoveNodeToolCall(gateway);

        expect(result.pass).toBe(false);
        expect(result.toolCallName).toBeNull();
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

        const result = await verifyMoveNodeToolCall(gateway);

        expect(result.pass).toBe(false);
        expect(result.toolCallName).toBeNull();
        expect(result.error).toBe('plain string thrown, not an Error');
    });
});
