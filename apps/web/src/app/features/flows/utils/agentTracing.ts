import type { AgentTraceReporterSupportable, ChatRequest, Chunk, LlmGateway } from '@flows/agent';

/**
 * Gateway trace decorator for the real agent run (environment wiring). The gateway is an injected seam,
 * so lifecycle tracing is layered on at wiring time — payloads are never traced (only counts, names, and
 * flags), and the reporters additionally redact secret-looking fields on their side.
 */

/** Wrap a gateway so every chat turn emits llm.chat.start / llm.chat.done|error. */
export const withGatewayTracing = (gateway: LlmGateway, trace: AgentTraceReporterSupportable): LlmGateway => ({
    ...(gateway.capabilities ? { capabilities: gateway.capabilities } : {}),
    chat: (req: ChatRequest, opts?: { signal?: AbortSignal }): AsyncIterable<Chunk> => {
        async function* traced(): AsyncIterable<Chunk> {
            trace.info('llm.chat.start', { messageCount: req.messages.length, toolCount: req.tools.length });
            let chunkCount = 0;
            try {
                for await (const chunk of gateway.chat(req, opts)) {
                    chunkCount += 1;
                    yield chunk;
                }
                trace.info('llm.chat.done', { chunkCount });
            } catch (error) {
                trace.error('llm.chat.error', {
                    chunkCount,
                    reason: error instanceof Error ? error.name : 'unknown',
                });
                throw error;
            }
        }
        return traced();
    },
});
