import type { TraceRecord } from '../sink';

/** A node in the agent call tree — one per instance (flowPath), nested by flowPath prefix. */
export interface TraceNode {
    agentType: string;
    agentId: string;
    flowPath: string;
    records: TraceRecord[];
    children: TraceNode[];
}

/** One line of a rendered conversation — role-labelled, tool calls inline; ids stay behind as keys. */
export interface ChatEntry {
    role: 'user' | 'assistant' | 'tool';
    text: string;
    toolCalls?: Array<{ name: string; args: unknown }>;
    toolCallId?: string;
}

/** One agent instance's chat, in emission order. */
export interface AgentTranscript {
    agentType: string;
    agentId: string;
    flowPath: string;
    chat: ChatEntry[];
}

/** A canvas graph snapshot as carried on turn.start/turn.done — treated structurally (no canvas coupling). */
export interface GraphSnapshot {
    nodes: Array<{ id: string } & Record<string, unknown>>;
    edges: Array<{ id?: string } & Record<string, unknown>>;
}

/** The before/after delta of one user request. */
export interface GraphDiff {
    runId: string;
    before: GraphSnapshot;
    after: GraphSnapshot;
    addedNodes: string[];
    removedNodes: string[];
    changedNodes: string[];
    addedEdges: string[];
    removedEdges: string[];
}
