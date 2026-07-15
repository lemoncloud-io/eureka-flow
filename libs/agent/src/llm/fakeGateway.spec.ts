import { describe, expect, it } from 'vitest';

import { createFakeGateway } from './fakeGateway';

import type { Chunk } from './llmGateway';

const drain = async (stream: AsyncIterable<Chunk>): Promise<Chunk[]> => {
    const out: Chunk[] = [];
    for await (const chunk of stream) {
        out.push(chunk);
    }
    return out;
};

describe('createFakeGateway', () => {
    it('streams text then a done chunk', async () => {
        const gw = createFakeGateway([{ text: 'hello' }]);
        const chunks = await drain(gw.chat({ messages: [], tools: [] }));
        expect(chunks).toEqual([{ text: 'hello' }, { done: true }]);
    });

    it('streams tool calls with JSON-stringified argsDelta', async () => {
        const gw = createFakeGateway([{ toolCalls: [{ name: 'move_node', args: { nodeId: 'a' } }] }]);
        const chunks = await drain(gw.chat({ messages: [], tools: [] }));
        expect(chunks[0].toolCall?.name).toBe('move_node');
        expect(chunks[0].toolCall?.argsDelta).toBe('{"nodeId":"a"}');
    });

    it('consumes one step per chat() call and records requests', async () => {
        const gw = createFakeGateway([{ text: 'one' }, { text: 'two' }]);
        await drain(gw.chat({ messages: [], tools: [] }));
        expect(gw.isExhausted()).toBe(false);
        await drain(gw.chat({ messages: [], tools: [] }));
        expect(gw.isExhausted()).toBe(true);
        expect(gw.calls).toHaveLength(2);
    });

    it('supports a function step that reacts to the request', async () => {
        const gw = createFakeGateway([req => ({ text: `saw ${req.messages.length} messages` })]);
        const chunks = await drain(gw.chat({ messages: [{ role: 'user', content: 'hi' }], tools: [] }));
        expect(chunks[0].text).toBe('saw 1 messages');
    });

    it('throws AbortError when the signal is already aborted', async () => {
        const gw = createFakeGateway([{ text: 'x' }]);
        const ac = new AbortController();
        ac.abort();
        await expect(drain(gw.chat({ messages: [], tools: [] }, { signal: ac.signal }))).rejects.toMatchObject({
            name: 'AbortError',
        });
    });
});
