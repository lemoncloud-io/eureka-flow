import { describe, expect, it } from 'vitest';

import { tracingGateway } from '../../llm/tracingGateway';
import { createTracer, memorySink } from '../../trace';

import type { Chunk, LlmGateway } from '../../llm/llmGateway';

const fakeGateway = (chunks: Chunk[]): LlmGateway => ({
    capabilities: { toolCalls: true },
     
    async *chat(): AsyncIterable<Chunk> {
        for (const chunk of chunks) {
            yield chunk;
        }
    },
});

describe('tracingGateway', () => {
    it('emits llm.request before and llm.response after, and re-yields every chunk unchanged', async () => {
        const sink = memorySink();
        let clock = 0;
        const gateway = tracingGateway(
            fakeGateway([
                { text: 'hi' },
                { toolCall: { id: 'tc1', name: 'add_node', argsDelta: '{}' } },
                { done: true, usage: { totalTokens: 42 } },
            ]),
            () => createTracer(sink, () => 100),
            () => (clock += 5) // startedAt=5, end=10 → durationMs=5
        );

        const seen: Chunk[] = [];
        for await (const chunk of gateway.chat({ messages: [{ role: 'user', content: 'x' }], tools: [] })) {
            seen.push(chunk);
        }

        expect(seen).toHaveLength(3); // pure pass-through
        expect(sink.records.map(r => r.name)).toEqual(['llm.request', 'llm.response']);
        expect(sink.records[0].fields).toMatchObject({ messageCount: 1, toolCount: 0 });
        expect(sink.records[1].fields).toMatchObject({ durationMs: 5, usage: { totalTokens: 42 }, toolCallCount: 1 });
    });

    it('preserves the inner gateway capabilities', () => {
        const gateway = tracingGateway(fakeGateway([]), () => createTracer(memorySink()));
        expect(gateway.capabilities).toEqual({ toolCalls: true });
    });
});
