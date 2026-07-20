import type {
    AgentConfig,
    AgentTraceReporterSupportable,
    ChatRequest,
    Chunk,
    LlmGateway,
    ToolCall,
    ToolExecutor,
} from '@flows/agent';

/**
 * Trace decorators for the real agent run (W05 environment wiring). The agent core stays
 * untouched: the gateway and executor are already injected seams, so lifecycle tracing is
 * layered on at wiring time. Payloads are never traced — only counts, names, and flags —
 * and the reporters additionally redact secret-looking fields on their side.
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

/** Wrap an executor so every tool call emits tool.dispatch and tool.result (with ok/error). */
export const withExecutorTracing = (executor: ToolExecutor, trace: AgentTraceReporterSupportable): ToolExecutor => ({
    listTools: (agent: AgentConfig) => executor.listTools(agent),
    dispatch: async (agent: AgentConfig, call: ToolCall) => {
        trace.info('tool.dispatch', { name: call.name });
        const result = await executor.dispatch(agent, call);
        trace.info('tool.result', { name: call.name, ok: result.ok });
        return result;
    },
});
