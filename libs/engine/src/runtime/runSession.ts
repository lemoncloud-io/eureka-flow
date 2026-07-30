import {
    emptyExecutionState,
    reduceNodeEvent,
    reducePortEvent,
    reduceProgressEvent,
    shouldUpdateState,
    statePatch,
} from './executionReducer';
import { parseSocketFrame } from './parseSocketFrame';
import { isNodeState } from '../types';

import type { ExecutionEffect, ExecutionState } from './executionReducer';
import type { SocketFrame } from './parseSocketFrame';
import type { FlowEngine } from '../engine';
import type { SocketPort, SocketStatus } from '../ports/socket';
import type { NodeState } from '../types';
import type { NodeData } from '@lemoncloud/eureka-flows-api';

/** A node reaching the end of a run, either way. */
export interface NodeOutcome {
    nodeId: string;
    state: 'COMPLETED' | 'ERROR';
    runId?: string;
    error?: string;
}

export interface RunSessionOptions {
    engine: FlowEngine;
    socket: SocketPort;
    /** Frames for another flow are dropped before the reducer ever sees them. */
    currentFlowId?: string | null;
    /**
     * Effects the engine decided but cannot carry out: a toast, a follow-up fetch, running
     * a frontend block. Whoever has a browser handles them; the CLI ignores them.
     */
    onEffect?: (effect: ExecutionEffect) => void;
    /** Frames the engine recognises but has no state for — traces, logs, flow reloads. */
    onFrame?: (frame: SocketFrame) => void;
    onStatus?: (status: SocketStatus) => void;
}

export interface RunSession {
    /** Feed one raw frame by hand — the same path the socket takes. */
    handleFrame: (raw: unknown) => void;
    /** Wait for a node to finish. Resolves on the first terminal state after the call. */
    waitForNode: (nodeId: string, options?: { timeoutMs?: number }) => Promise<NodeOutcome>;
    /** Forget every cursor. Call when the flow changes; a new flow's sequences start over. */
    reset: (flowId?: string | null) => void;
    /**
     * The connection a run must be asked for with, straight from the socket.
     *
     * Forwarded rather than left to the caller because the caller has a session, not a
     * port: `waitForNode` only means something if the run was told where to stream.
     */
    connectionId: () => string | null;
    state: () => ExecutionState;
    close: () => void;
}

/** Terminal states, as the reducer reports them through a `run-end` effect. */
const isTerminal = (state?: NodeState): state is 'COMPLETED' | 'ERROR' => state === 'COMPLETED' || state === 'ERROR';

/**
 * A live run, wired end to end.
 *
 * Phase 3 gave the engine a reducer but left the wiring in React: the browser parsed
 * frames, called the reducer and pushed patches into a canvas. Everything in that chain
 * except the last step is the engine's, and this is where it lives — so a CLI can watch a
 * run with the same rules the editor uses, rather than a second implementation of them.
 */
export const createRunSession = ({
    engine,
    socket,
    currentFlowId,
    onEffect,
    onFrame,
    onStatus,
}: RunSessionOptions): RunSession => {
    let execution = emptyExecutionState();
    let flowId = currentFlowId;

    /**
     * Everyone waiting on a node, by node id. A node may have more than one watcher.
     *
     * A waiter owns its timeout timer, so closing the session can cancel it. Dropping the
     * entry alone would leave the timer armed to reject a promise nobody is holding.
     */
    interface Waiter {
        settle: (outcome: NodeOutcome) => void;
        abandon: (reason: Error) => void;
    }
    const waiters = new Map<string, Waiter[]>();

    const settle = (outcome: NodeOutcome): void => {
        const pending = waiters.get(outcome.nodeId);
        if (!pending) return;
        waiters.delete(outcome.nodeId);
        pending.forEach(waiter => waiter.settle(outcome));
    };

    /**
     * What this session has written to each node.
     *
     * The reducer's sequence check (Rule 1) keys its high-water mark on the frame's own id,
     * but a port-shaped frame writes its state to the **parent** node — so `n1:out` and
     * `n1` are two streams with two cursors and one target, and neither cursor can order
     * them against the other. State priority is the second defence, and the browser has
     * always had it at `updateNodeFromServer`; the engine's own session did not, which is
     * how a late port frame walked a COMPLETED node back for every CLI and npm consumer.
     *
     * Not read off the graph: a `reset` means the previous run's states are no longer
     * authoritative, and the graph still holds them. The flip side is that this map has to
     * be told when the graph is replaced under it — see the `graph:loaded` subscription.
     */
    const written = new Map<string, NodeState>();

    /** The patch's own state, if it is one this engine models. */
    const stateOf = (patch: Partial<NodeData>): NodeState | undefined => {
        const value: unknown = patch.state;
        return typeof value === 'string' && isNodeState(value) ? value : undefined;
    };

    const accepts = (nodeId: string, patch: Partial<NodeData>): boolean => {
        // No state in the patch is nothing to order — stats and error text still land.
        const incoming = stateOf(patch);
        return incoming === undefined || shouldUpdateState(written.get(nodeId), incoming);
    };

    const write = (nodeId: string, patch: Partial<NodeData>): void => {
        engine.applyRuntime(nodeId, patch);
        const state = stateOf(patch);
        if (state !== undefined) written.set(nodeId, state);
    };

    /**
     * A load replaces every node's state with whatever the server says, so what this session
     * wrote before it stops describing the graph. Keeping the old values would let a finished
     * run refuse the next one's first frame — the node would sit at the loaded state forever.
     */
    const unwatchGraph = engine.subscribe(event => {
        if (event.type === 'graph:loaded') written.clear();
    });

    const dispatch = (effects: ExecutionEffect[]): void => {
        for (const effect of effects) {
            // The two effects the engine can carry out itself: the graph is right here.
            if (effect.type === 'apply' && accepts(effect.nodeId, effect.patch)) {
                write(effect.nodeId, effect.patch);
            }
            // A re-run has to put the node back to IDLE before the new run's frames land.
            // The browser has always done this; leaving it to `onEffect` meant a CLI watched
            // a second run without the node ever leaving the first run's COMPLETED.
            // Deliberately unguarded — walking the state back is the whole point.
            if (effect.type === 'reset-node') write(effect.nodeId, statePatch('IDLE'));
            if (effect.type === 'run-end' && isTerminal(effect.state)) {
                settle({ nodeId: effect.nodeId, state: effect.state, runId: effect.runId, error: effect.error });
            }
            onEffect?.(effect);
        }
    };

    const handleFrame = (raw: unknown): void => {
        const frame = parseSocketFrame(raw);
        if (!frame) return;

        if (frame.kind === 'node') {
            const { state, effects } = reduceNodeEvent(execution, frame.event, { currentFlowId: flowId });
            execution = state;
            dispatch(effects);
            // A node can finish without a runId, and then no `run-end` effect is emitted —
            // the waiter still has to be released or a CLI hangs on a completed run.
            if (!frame.event.runId && isTerminal(frame.event.state) && effects.length > 0) {
                settle({ nodeId: frame.event.nodeId, state: frame.event.state, error: frame.event.error });
            }
            return;
        }

        if (frame.kind === 'port') {
            const { state, effects } = reducePortEvent(execution, frame.event, { currentFlowId: flowId });
            execution = state;
            dispatch(effects);
            onFrame?.(frame);
            return;
        }

        if (frame.kind === 'progress') {
            const { state, effects } = reduceProgressEvent(execution, frame.event);
            execution = state;
            dispatch(effects);
            return;
        }

        onFrame?.(frame);
    };

    const unsubscribe = socket.subscribe((type, payload) => {
        if (type === 'status') onStatus?.(payload as SocketStatus);
        if (type === 'message') handleFrame(payload);
    });

    return {
        handleFrame,

        waitForNode: (nodeId, { timeoutMs } = {}) =>
            new Promise<NodeOutcome>((resolve, reject) => {
                // Held indirectly so the resolver can cancel a timer that is armed after it.
                const armed: { timer?: ReturnType<typeof setTimeout> } = {};
                const disarm = (): void => {
                    if (armed.timer !== undefined) clearTimeout(armed.timer);
                };

                const waiter: Waiter = {
                    settle: outcome => {
                        disarm();
                        resolve(outcome);
                    },
                    abandon: reason => {
                        disarm();
                        reject(reason);
                    },
                };
                waiters.set(nodeId, [...(waiters.get(nodeId) ?? []), waiter]);

                if (timeoutMs === undefined) return;
                armed.timer = setTimeout(() => {
                    waiters.set(
                        nodeId,
                        (waiters.get(nodeId) ?? []).filter(entry => entry !== waiter)
                    );
                    reject(new Error(`timed out after ${timeoutMs}ms waiting for node ${nodeId}`));
                }, timeoutMs);
            }),

        reset: nextFlowId => {
            execution = emptyExecutionState();
            written.clear();
            if (nextFlowId !== undefined) flowId = nextFlowId;
        },

        connectionId: () => socket.connectionId(),

        state: () => execution,

        close: () => {
            unsubscribe();
            unwatchGraph();
            // Rejected, not dropped. Clearing the map alone leaves every pending
            // `waitForNode` unsettled, and a caller awaiting one waits for a session that
            // will never speak again — a CLI that closes on a signal hangs instead of exiting.
            const abandoned = [...waiters.values()].flat();
            waiters.clear();
            abandoned.forEach(waiter => waiter.abandon(new Error('run session closed')));
        },
    };
};
