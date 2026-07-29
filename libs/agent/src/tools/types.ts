import type { AgentConfig } from '../agent';
import type { ToolDef } from '../llm/llmGateway';

/** One tool invocation; `args` is already parsed from the model's raw JSON. */
export interface ToolCall {
    id: string;
    name: string;
    args: unknown;
}

/** The result of a tool call: `data` (fed back to the model) or an `error`. */
export type ToolResult =
    | { toolCallId: string; ok: true; data?: unknown }
    | { toolCallId: string; ok: false; error: string };

/** One source of tools: it lists them and runs them (maps 1:1 to an MCP server). */
export interface ToolProvider {
    listTools(): ToolDef[] | Promise<ToolDef[]>;
    dispatch(call: ToolCall): ToolResult | Promise<ToolResult>;
}

/** The single tool engine for a session; the acting agent (tools + grant) is passed per call. */
export interface ToolExecutor {
    /** The agent's providers' tools, unioned into the model's tool defs. */
    listTools(agent: AgentConfig): Promise<ToolDef[]>;
    /** Validate args, check the grant, route by name, run. Never throws; errors become a ToolResult. */
    dispatch(agent: AgentConfig, call: ToolCall): Promise<ToolResult>;
}
