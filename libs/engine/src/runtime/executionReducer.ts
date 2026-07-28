import type { NodeState } from '../types';
import type { NodeData } from '@lemoncloud/eureka-flows-api';

/** Node state priority. Higher is more final; ERROR outranks COMPLETED because a terminal
 *  failure must not be overwritten by a late success message. */
const STATE_PRIORITY: Record<string, number> = { IDLE: 0, READY: 1, RUNNING: 2, COMPLETED: 3, ERROR: 4 };

const priority = (state?: string): number => STATE_PRIORITY[state ?? ''] ?? -1;

/** Whether a server state is final enough to replace what is on screen. */
export const shouldUpdateState = (current?: string, server?: string): boolean => priority(server) >= priority(current);

/** What the client has seen for one node or port, so a late frame can be recognised. */
export interface StreamCursor {
    /** Highest message sequence accepted. */
    no?: number;
    /** The run that sequence belongs to. */
    runId?: string;
}

export interface ExecutionState {
    nodes: Record<string, StreamCursor>;
    ports: Record<string, StreamCursor>;
    /** Progress runs on its own epoch-based clock, unrelated to node sequences. */
    progress: Record<string, number>;
}

export const emptyExecutionState = (): ExecutionState => ({ nodes: {}, ports: {}, progress: {} });

/** A node update as it arrives off the socket. */
export interface NodeEvent {
    nodeId: string;
    flowId?: string;
    runId?: string;
    /** Message sequence within the run. */
    no?: number;
    state?: NodeState;
    stage?: string;
    progress?: number;
    error?: string;
    /** Port-shaped events carry the parent whose state they really describe. */
    isPort?: boolean;
    parentNodeId?: string;
}

export interface PortEvent {
    portId: string;
    nodeId: string;
    portName?: string;
    flowId?: string;
    runId?: string;
    no?: number;
    /**
     * Server-stamped freshness. When present the server is asserting this frame carries new
     * data, so it overrides the sequence check — the alternative is silently dropping data
     * the server went out of its way to say was current.
     */
    ts?: number;
}

/** A streamed progress snapshot, sequenced on its own epoch-based clock. */
export interface ProgressEvent {
    nodeId: string;
    seq: number;
    status?: 'done' | 'error' | string;
    percent?: number;
    step?: number;
    totalSteps?: number;
}

/**
 * What the caller should do about an event.
 *
 * The reducer decides what a message means; it does not toast, fetch or execute. Those
 * need a browser, an API client and a canvas — none of which the engine has, and all of
 * which would stop this from being testable.
 */
export type ExecutionEffect =
    | { type: 'apply'; nodeId: string; patch: Partial<NodeData> }
    /** A new run for a node that already ran: force it back to IDLE first (see rule 2). */
    | { type: 'reset-node'; nodeId: string }
    | { type: 'run-begin'; runId: string; nodeId: string }
    | { type: 'run-end'; runId: string; nodeId: string; state: 'COMPLETED' | 'ERROR'; error?: string }
    | { type: 'clear-traces'; nodeId: string }
    /** ERROR arrived before the final frame — the detailed message needs a fetch. */
    | { type: 'fetch-error-detail'; nodeId: string }
    | { type: 'notify'; level: 'success' | 'error'; nodeId: string; message?: string }
    /** The node is ready and may be a frontend block the caller should run. */
    | { type: 'maybe-autorun'; nodeId: string }
    | { type: 'port-updated'; portId: string; nodeId: string; portName?: string; runId?: string; no?: number };

export interface ExecutionResult {
    state: ExecutionState;
    effects: ExecutionEffect[];
}

export interface ExecutionContext {
    /** Messages for any other flow are not this canvas's business. */
    currentFlowId?: string | null;
    /** Injected so a spec can assert on timestamps instead of racing them. */
    now?: () => number;
}

const ignored = (state: ExecutionState): ExecutionResult => ({ state, effects: [] });

const withCursor = (
    state: ExecutionState,
    bucket: 'nodes' | 'ports',
    key: string,
    cursor: StreamCursor
): ExecutionState => ({ ...state, [bucket]: { ...state[bucket], [key]: cursor } });

/**
 * Fold one node update into what the client believes.
 *
 * All the ordering rules live here rather than in five refs scattered through a React
 * hook, which is what they were — and why none of them had a test.
 */
export const reduceNodeEvent = (
    state: ExecutionState,
    event: NodeEvent,
    { currentFlowId, now = () => Date.now() }: ExecutionContext = {}
): ExecutionResult => {
    const { nodeId, flowId, runId, no, stage, error, isPort, parentNodeId } = event;

    // Rule 3. Node messages may omit flowId — the channel subscription already filters by
    // flow, so only a stated mismatch is a reason to drop.
    if (flowId && currentFlowId && flowId !== currentFlowId) return ignored(state);

    const effects: ExecutionEffect[] = [];
    const cursor = state.nodes[nodeId] ?? {};
    let next = state;

    // Rule 2. A new run reuses the same node, and the previous run left it COMPLETED.
    // Without this reset, state priority refuses every update of the new run.
    if (runId) {
        if (cursor.runId && cursor.runId !== runId) {
            // The parent, not the port. Cursors are tracked per stream — `n1:out` has its
            // own — but the thing whose state resets is the node, and `n1:out` is not one:
            // every consumer looks the id up in the graph and quietly finds nothing.
            effects.push({ type: 'reset-node', nodeId: parentNodeId ?? nodeId });
            // The progress clock restarts with the run's reporter, so a high seq from the
            // previous run would swallow the new one's first snapshots.
            const { [nodeId]: _dropped, ...progress } = next.progress;
            next = withCursor({ ...next, progress }, 'nodes', nodeId, { runId });
        } else {
            next = withCursor(next, 'nodes', nodeId, { ...cursor, runId });
        }
    }

    // Rule 1. The socket does not promise order. A frame at or behind the high-water mark
    // is either a duplicate or an overtaken one, and applying it walks the state backwards.
    if (no !== undefined) {
        const seen = next.nodes[nodeId]?.no;
        if (seen !== undefined && seen >= no) return ignored(state);
        next = withCursor(next, 'nodes', nodeId, { ...next.nodes[nodeId], no });
    }

    // A run's first frame: whatever the previous run logged is not this one's.
    if (event.state === 'RUNNING' && no !== undefined && no <= 1) {
        effects.push({ type: 'clear-traces', nodeId });
    }

    if (runId) {
        if (stage === 'enter' || (event.state === 'RUNNING' && !stage)) {
            effects.push({ type: 'run-begin', runId, nodeId });
        }
        if (event.state === 'COMPLETED' || event.state === 'ERROR') {
            effects.push({ type: 'run-end', runId, nodeId, state: event.state, error });
        }
    }

    // Rule 5. A port-shaped event describes its parent's state, and nothing else.
    if (isPort && parentNodeId) {
        if (event.state) {
            effects.push({ type: 'apply', nodeId: parentNodeId, patch: statePatch(event.state) });
        }
        return { state: next, effects };
    }

    if (event.state === 'ERROR') {
        // Before the final frame the error text is not settled; the caller fetches it.
        if (stage !== 'final') effects.push({ type: 'fetch-error-detail', nodeId });
        effects.push({
            type: 'apply',
            nodeId,
            patch: { ...statePatch('ERROR'), error, errorMessage: error } as Partial<NodeData>,
        });
        effects.push({ type: 'notify', level: 'error', nodeId, message: error });
        return { state: next, effects };
    }

    effects.push({
        type: 'apply',
        nodeId,
        patch: { ...statePatch(event.state), executionStats: executionStats(event, now) } as Partial<NodeData>,
    });

    if (event.state === 'COMPLETED') effects.push({ type: 'notify', level: 'success', nodeId });
    if (event.state === 'READY') effects.push({ type: 'maybe-autorun', nodeId });

    return { state: next, effects };
};

/**
 * `status` is the deprecated twin of `state`; both are written until it is retired.
 *
 * Exported so a caller carrying out a `reset-node` writes the pair the same way the
 * reducer does. Two spellings of "this node is IDLE" is how the twin outlives its retirement.
 */
export const statePatch = (state?: NodeState): Partial<NodeData> =>
    ({ state, status: state }) as unknown as Partial<NodeData>;

const executionStats = (event: NodeEvent, now: () => number): NodeData['executionStats'] => {
    const { state, progress } = event;
    if (state === 'RUNNING') return { startTime: now(), duration: 0, progress: progress ?? 0 };
    if (state === 'COMPLETED' || state === 'ERROR') return { progress: progress ?? 100 };
    return progress === undefined ? undefined : { progress };
};

/**
 * Fold one port update.
 *
 * Ports carry the same ordering hazards as nodes and are tracked in their own keyspace: a
 * port's sequence has nothing to do with its node's.
 */
export const reducePortEvent = (
    state: ExecutionState,
    event: PortEvent,
    { currentFlowId }: ExecutionContext = {}
): ExecutionResult => {
    const { portId, nodeId, portName, flowId, runId, no } = event;

    if (flowId && currentFlowId && flowId !== currentFlowId) return ignored(state);

    const cursor = state.ports[portId] ?? {};
    let next = state;

    if (runId && cursor.runId && cursor.runId !== runId) {
        next = withCursor(next, 'ports', portId, { runId });
    } else if (runId) {
        next = withCursor(next, 'ports', portId, { ...cursor, runId });
    }

    // `ts` means the server is vouching for this frame, which beats the sequence check.
    if (no !== undefined && !event.ts) {
        const seen = next.ports[portId]?.no;
        if (seen !== undefined && seen >= no) return ignored(state);
    }
    if (no !== undefined) next = withCursor(next, 'ports', portId, { ...next.ports[portId], no });

    return { state: next, effects: [{ type: 'port-updated', portId, nodeId, portName, runId, no }] };
};

/**
 * Give a port's sequence back after a failed fetch.
 *
 * The cursor moved when the frame was accepted, so without this the retry that the server
 * will send looks stale and the port never fills in.
 */
export const rollbackPortCursor = (state: ExecutionState, portId: string, no: number): ExecutionState => {
    if (state.ports[portId]?.no !== no) return state;
    return withCursor(state, 'ports', portId, { ...state.ports[portId], no: undefined });
};

/** The same, for a node whose error detail could not be fetched. */
export const rollbackNodeCursor = (state: ExecutionState, nodeId: string, no: number): ExecutionState => {
    if (state.nodes[nodeId]?.no !== no) return state;
    return withCursor(state, 'nodes', nodeId, { ...state.nodes[nodeId], no: undefined });
};

/**
 * Fold a streamed progress snapshot.
 *
 * Last-write-wins on `seq`, which is epoch-based and therefore comparable across server
 * invocations in a way the per-run `no` is not.
 */
export const reduceProgressEvent = (state: ExecutionState, event: ProgressEvent): ExecutionResult => {
    const { nodeId, seq, status, percent, step, totalSteps } = event;

    const seen = state.progress[nodeId];
    if (seen !== undefined && seq <= seen) return ignored(state);

    const next: ExecutionState = { ...state, progress: { ...state.progress, [nodeId]: seq } };
    const nodeState: NodeState = status === 'done' ? 'COMPLETED' : status === 'error' ? 'ERROR' : 'RUNNING';
    const progress = percent ?? (step && totalSteps ? Math.round((step / totalSteps) * 100) : undefined);

    return {
        state: next,
        effects: [
            {
                type: 'apply',
                nodeId,
                patch: {
                    ...statePatch(nodeState),
                    ...(progress === undefined ? {} : { executionStats: { progress } }),
                } as Partial<NodeData>,
            },
        ],
    };
};
