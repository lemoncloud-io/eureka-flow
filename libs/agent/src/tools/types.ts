import type { AgentConfig } from '../agent';
import type { ToolDef } from '../llm/llmGateway';
import type { AgentGrant } from '../permissions';

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

/** One source of tools that lists and runs them; maps 1:1 to MCP (`listTools`↔`tools/list`, `dispatch`↔`tools/call`). An agent composes one or more via `AgentConfig.tools`. */
export interface ToolProvider {
    listTools(): ToolDef[] | Promise<ToolDef[]>;
    dispatch(call: ToolCall): ToolResult | Promise<ToolResult>;
}

/** A bound tool's body: runs one call and returns its result. The unit `dispatch` routes to. */
export type ToolHandler = (call: ToolCall) => ToolResult | Promise<ToolResult>;

/** The single tool engine for a session; the acting agent (tools + grant) is passed per call. */
export interface ToolExecutor {
    /** The agent's providers' tools, unioned into the model's tool defs. */
    listTools(agent: AgentConfig): Promise<ToolDef[]>;
    /** Validate args, gate the call, route by name, run. Never throws; errors become a ToolResult. A capability-requiring tool runs only if BOTH the agent's fixed `grant` and `userPermissions` allow it (fail-closed). */
    dispatch(agent: AgentConfig, call: ToolCall, userPermissions: AgentGrant): Promise<ToolResult>;
}

/** `ToolResult` constructors every `dispatch` returns; co-located with the type so a provider never re-inlines the envelope. `data` = success payload, `error` = human-readable reason. */
export const toolOk = (call: ToolCall, data?: unknown): ToolResult => ({ toolCallId: call.id, ok: true, data });

export const toolErr = (call: ToolCall, error: string): ToolResult => ({ toolCallId: call.id, ok: false, error });

/** The "no tool matched this name" error — a provider name-switch fall-through, or an unregistered name at the executor. */
export const toolUnknown = (call: ToolCall): ToolResult => toolErr(call, `unknown tool: ${call.name}`);
