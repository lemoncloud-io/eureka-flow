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

/** A node that entered/left/changed across the request — id plus the block `type`, so "which node" reads without a snapshot lookup. */
export interface NodeChange {
    id: string;
    type: string;
}

/** An edge that entered/left across the request — id plus its four endpoints, so "which edge" reads as `source → target`, not an opaque id. */
export interface EdgeChange {
    id: string;
    sourceNodeId: string;
    sourcePortId: string;
    targetNodeId: string;
    targetPortId: string;
}

/** The before/after delta of one user request (or the whole session). Each change self-describes (node type, edge endpoints) — not just a count. */
export interface GraphDiff {
    /** The turn this delta covers, or `'session'` for the cumulative whole-session delta. */
    runId: string;
    /**
     * Whether a closing boundary (`turn.done`/`turn.error`) was captured. `false` means the turn is still in
     * flight or was aborted: `after` mirrors `before` and the delta is empty because it is UNKNOWN, not because
     * nothing changed.
     */
    settled: boolean;
    before: GraphSnapshot;
    after: GraphSnapshot;
    addedNodes: NodeChange[];
    removedNodes: NodeChange[];
    changedNodes: NodeChange[];
    addedEdges: EdgeChange[];
    removedEdges: EdgeChange[];
}

/** The graph delta viewed two ways: the whole session as one delta, plus one delta per turn. */
export interface GraphDiffProjection {
    /** First turn's `before` → last turn's `after` — the net change across the whole session. Null when nothing was captured. */
    cumulative: GraphDiff | null;
    /** One delta per turn (runId), in turn order. */
    perTurn: GraphDiff[];
}
