import { LLM_ERROR, LLM_REQUEST, LLM_RESPONSE } from '../trace/events';

import type { Chunk, LlmGateway } from './llmGateway';
import type { Tracer } from '../trace';

/**
 * A per-agent {@link LlmGateway} decorator: emits `llm.request` before a chat() and `llm.response` after,
 * re-yielding every chunk unchanged (a pure pass-through observer). `getTracer` is an accessor, not a fixed
 * tracer, so per-turn context advances without re-wrapping — mirroring the `() => signalHolder.current`
 * idiom already used for the abort signal. `now` is injected for deterministic duration in tests.
 */
export const tracingGateway = (
    inner: LlmGateway,
    getTracer: () => Tracer,
    now: () => number = Date.now
): LlmGateway => ({
    capabilities: inner.capabilities,
    async *chat(req, opts): AsyncIterable<Chunk> {
        const t = getTracer();
        t.emit({ name: LLM_REQUEST, fields: { messageCount: req.messages.length, toolCount: req.tools.length } });

        const startedAt = now();
        let usage: Chunk['usage'];
        const toolCallIds = new Set<string>();

        try {
            for await (const chunk of inner.chat(req, opts)) {
                if (chunk.usage) usage = chunk.usage;
                if (chunk.toolCall) toolCallIds.add(chunk.toolCall.id);
                yield chunk;
            }
        } catch (err) {
            t.emit({
                name: LLM_ERROR,
                level: 'error',
                fields: { durationMs: now() - startedAt, reason: err instanceof Error ? err.name : 'unknown' },
            });
            throw err;
        }

        t.emit({
            name: LLM_RESPONSE,
            fields: { durationMs: now() - startedAt, usage, toolCallCount: toolCallIds.size },
        });
    },
});
