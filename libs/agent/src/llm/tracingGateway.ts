import { LLM_REQUEST, LLM_RESPONSE } from '../trace/events';

import type { Chunk, LlmGateway } from './llmGateway';
import type { Tracer } from '../trace';

/**
 * A per-agent {@link LlmGateway} decorator: emits `llm.request` before a chat() and `llm.response` after,
 * re-yielding every chunk unchanged (a pure pass-through observer). `tracer` is an accessor, not a fixed
 * tracer, so per-turn context advances without re-wrapping — mirroring the `() => signalHolder.current`
 * idiom already used for the abort signal. `now` is injected for deterministic duration in tests.
 */
export const tracingGateway = (inner: LlmGateway, tracer: () => Tracer, now: () => number = Date.now): LlmGateway => ({
    capabilities: inner.capabilities,
    async *chat(req, opts): AsyncIterable<Chunk> {
        const t = tracer();
        t.emit({ name: LLM_REQUEST, fields: { messageCount: req.messages.length, toolCount: req.tools.length } });

        const startedAt = now();
        let usage: Chunk['usage'];
        const toolCallIds = new Set<string>();

        for await (const chunk of inner.chat(req, opts)) {
            if (chunk.usage) usage = chunk.usage;
            if (chunk.toolCall) toolCallIds.add(chunk.toolCall.id);
            yield chunk;
        }

        t.emit({
            name: LLM_RESPONSE,
            fields: { durationMs: now() - startedAt, usage, toolCallCount: toolCallIds.size },
        });
    },
});
