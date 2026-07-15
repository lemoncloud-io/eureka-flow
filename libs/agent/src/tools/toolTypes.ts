import type { AgentConfig } from '../agent';
import type { ToolDef } from '../llm/llmGateway';

/** One tool invocation. `args` is already parsed from the model's raw JSON. */
export interface ToolCall {
    id: string;
    name: string;
    args: unknown;
}

/** The result of a tool call: `data` (fed back to the model) or an `error`. */
export type ToolResult =
    | { toolCallId: string; ok: true; data?: unknown }
    | { toolCallId: string; ok: false; error: string };

/**
 * One source of tools — it lists them and runs them. Maps 1:1 to MCP
 * (`listTools` ↔ `tools/list`, `dispatch` ↔ `tools/call`). The locator agent has a
 * single built-in provider (list_nodes + move_node).
 */
export interface ToolProvider {
    listTools(): ToolDef[] | Promise<ToolDef[]>;
    dispatch(call: ToolCall): ToolResult | Promise<ToolResult>;
}

/**
 * One executor for the session — a single engine, not reimplemented per agent. The
 * acting agent (its tools + grant) is passed in on every call; `dispatch` is the single
 * choke-point: validate args → check the agent's permission → route by name → provider.
 */
export interface ToolExecutor {
    /** The agent's providers' tools, unioned → the model's tool defs. */
    listTools(agent: AgentConfig): Promise<ToolDef[]>;
    /** Validate → check grant → route by name → provider. Never throws; errors → ToolResult. */
    dispatch(agent: AgentConfig, call: ToolCall): Promise<ToolResult>;
}
