import { describe, expect, it } from 'vitest';

import {
    emptyExecutionState,
    reduceNodeEvent,
    reducePortEvent,
    reduceProgressEvent,
    rollbackPortCursor,
    shouldUpdateState,
} from '../runtime/executionReducer';

import type { ExecutionEffect, ExecutionState, NodeEvent } from '../runtime/executionReducer';

const at = (ms: number) => () => ms;

/** Feed a run of events through the reducer, returning the final state and every effect. */
const play = (
    events: NodeEvent[],
    ctx: { currentFlowId?: string } = {}
): { state: ExecutionState; effects: ExecutionEffect[] } =>
    events.reduce(
        (acc, event) => {
            const { state, effects } = reduceNodeEvent(acc.state, event, { ...ctx, now: at(1000) });
            return { state, effects: [...acc.effects, ...effects] };
        },
        { state: emptyExecutionState(), effects: [] as ExecutionEffect[] }
    );

const applied = (effects: ExecutionEffect[]) => effects.filter(e => e.type === 'apply');

describe('rule 1 — a late frame does not walk the state backwards', () => {
    it('drops a sequence at or behind the high-water mark', () => {
        const { effects } = play([
            { nodeId: 'n1', no: 5, state: 'RUNNING' },
            { nodeId: 'n1', no: 3, state: 'IDLE' },
            { nodeId: 'n1', no: 5, state: 'IDLE' },
        ]);

        expect(applied(effects)).toHaveLength(1);
    });

    it('accepts the next sequence up', () => {
        const { effects } = play([
            { nodeId: 'n1', no: 1, state: 'RUNNING' },
            { nodeId: 'n1', no: 2, state: 'COMPLETED' },
        ]);

        expect(applied(effects)).toHaveLength(2);
    });

    it('tracks each node separately', () => {
        const { effects } = play([
            { nodeId: 'n1', no: 9, state: 'RUNNING' },
            { nodeId: 'n2', no: 1, state: 'RUNNING' },
        ]);

        expect(applied(effects)).toHaveLength(2);
    });

    it('leaves the state untouched when it drops a frame', () => {
        const first = reduceNodeEvent(emptyExecutionState(), { nodeId: 'n1', no: 5, state: 'RUNNING' });
        const second = reduceNodeEvent(first.state, { nodeId: 'n1', no: 2, state: 'IDLE' });

        expect(second.state).toBe(first.state);
    });

    it('applies an event with no sequence at all', () => {
        const { effects } = play([{ nodeId: 'n1', state: 'RUNNING' }]);

        expect(applied(effects)).toHaveLength(1);
    });
});

describe('rule 2 — a new run resets the node', () => {
    it('forces the node back to IDLE when the runId changes', () => {
        const { effects } = play([
            { nodeId: 'n1', runId: 'run-1', no: 4, state: 'COMPLETED' },
            { nodeId: 'n1', runId: 'run-2', no: 1, state: 'RUNNING' },
        ]);

        expect(effects.filter(e => e.type === 'reset-node')).toEqual([{ type: 'reset-node', nodeId: 'n1' }]);
    });

    it('lets the new run start from a low sequence again', () => {
        // Without the reset, run-2's `no: 1` reads as a stale frame behind run-1's `no: 4`
        // and every update of the new run is dropped.
        const { effects } = play([
            { nodeId: 'n1', runId: 'run-1', no: 4, state: 'COMPLETED' },
            { nodeId: 'n1', runId: 'run-2', no: 1, state: 'RUNNING' },
            { nodeId: 'n1', runId: 'run-2', no: 2, state: 'COMPLETED' },
        ]);

        expect(applied(effects)).toHaveLength(3);
    });

    it('does not reset while the run is the same', () => {
        const { effects } = play([
            { nodeId: 'n1', runId: 'run-1', no: 1, state: 'RUNNING' },
            { nodeId: 'n1', runId: 'run-1', no: 2, state: 'COMPLETED' },
        ]);

        expect(effects.filter(e => e.type === 'reset-node')).toHaveLength(0);
    });

    it('does not reset on the first run it has ever seen', () => {
        const { effects } = play([{ nodeId: 'n1', runId: 'run-1', no: 1, state: 'RUNNING' }]);

        expect(effects.filter(e => e.type === 'reset-node')).toHaveLength(0);
    });
});

describe('rule 3 — other flows are not this canvas business', () => {
    it('drops an event stamped with a different flow', () => {
        const { effects } = play([{ nodeId: 'n1', flowId: 'other', state: 'RUNNING' }], { currentFlowId: 'mine' });

        expect(effects).toHaveLength(0);
    });

    it('accepts an event with no flow stamp — the channel already filtered it', () => {
        const { effects } = play([{ nodeId: 'n1', state: 'RUNNING' }], { currentFlowId: 'mine' });

        expect(applied(effects)).toHaveLength(1);
    });

    it('accepts a matching flow', () => {
        const { effects } = play([{ nodeId: 'n1', flowId: 'mine', state: 'RUNNING' }], { currentFlowId: 'mine' });

        expect(applied(effects)).toHaveLength(1);
    });
});

describe('rule 4 — state priority', () => {
    it('lets a more final state through and holds a less final one back', () => {
        expect(shouldUpdateState('RUNNING', 'COMPLETED')).toBe(true);
        expect(shouldUpdateState('COMPLETED', 'RUNNING')).toBe(false);
    });

    it('keeps ERROR above COMPLETED, so a late success cannot bury a failure', () => {
        expect(shouldUpdateState('COMPLETED', 'ERROR')).toBe(true);
        expect(shouldUpdateState('ERROR', 'COMPLETED')).toBe(false);
    });

    it('treats an equal state as writable, for progress updates within RUNNING', () => {
        expect(shouldUpdateState('RUNNING', 'RUNNING')).toBe(true);
    });
});

describe('rule 5 — a port-shaped event describes its parent', () => {
    it('applies the state to the parent and stops there', () => {
        const { effects } = play([{ nodeId: 'n1:in', isPort: true, parentNodeId: 'n1', state: 'RUNNING', no: 1 }]);

        expect(applied(effects)).toEqual([
            { type: 'apply', nodeId: 'n1', patch: { state: 'RUNNING', status: 'RUNNING' } },
        ]);
        expect(effects.filter(e => e.type === 'maybe-autorun')).toHaveLength(0);
    });

    it('does nothing when the port event carries no state', () => {
        const { effects } = play([{ nodeId: 'n1:in', isPort: true, parentNodeId: 'n1', no: 1 }]);

        expect(applied(effects)).toHaveLength(0);
    });
});

describe('errors', () => {
    it('asks for the detailed message when the error is not the final frame', () => {
        const { effects } = play([{ nodeId: 'n1', state: 'ERROR', error: 'boom', no: 2 }]);

        expect(effects.filter(e => e.type === 'fetch-error-detail')).toHaveLength(1);
    });

    it('trusts the final frame and does not fetch', () => {
        const { effects } = play([{ nodeId: 'n1', state: 'ERROR', stage: 'final', error: 'boom', no: 2 }]);

        expect(effects.filter(e => e.type === 'fetch-error-detail')).toHaveLength(0);
    });

    it('writes the message to both the new and the deprecated field', () => {
        const { effects } = play([{ nodeId: 'n1', state: 'ERROR', stage: 'final', error: 'boom' }]);

        expect(applied(effects)[0]).toEqual({
            type: 'apply',
            nodeId: 'n1',
            patch: { state: 'ERROR', status: 'ERROR', error: 'boom', errorMessage: 'boom' },
        });
    });
});

describe('run lifecycle and traces', () => {
    it('opens a run on the first RUNNING frame', () => {
        const { effects } = play([{ nodeId: 'n1', runId: 'r1', state: 'RUNNING', no: 1 }]);

        expect(effects).toContainEqual({ type: 'run-begin', runId: 'r1', nodeId: 'n1' });
    });

    it('opens a run on an explicit enter stage', () => {
        const { effects } = play([{ nodeId: 'n1', runId: 'r1', stage: 'enter', no: 1 }]);

        expect(effects).toContainEqual({ type: 'run-begin', runId: 'r1', nodeId: 'n1' });
    });

    it('closes the run on a terminal state', () => {
        const { effects } = play([{ nodeId: 'n1', runId: 'r1', state: 'COMPLETED', no: 2 }]);

        expect(effects).toContainEqual({ type: 'run-end', runId: 'r1', nodeId: 'n1', state: 'COMPLETED' });
    });

    it('clears the previous run traces on the first frame', () => {
        const { effects } = play([{ nodeId: 'n1', state: 'RUNNING', no: 1 }]);

        expect(effects).toContainEqual({ type: 'clear-traces', nodeId: 'n1' });
    });

    it('does not clear traces mid-run', () => {
        const { effects } = play([{ nodeId: 'n1', state: 'RUNNING', no: 7 }]);

        expect(effects.filter(e => e.type === 'clear-traces')).toHaveLength(0);
    });
});

describe('execution stats', () => {
    it('stamps a start time when the node begins running', () => {
        const { effects } = play([{ nodeId: 'n1', state: 'RUNNING', progress: 0, no: 1 }]);

        expect(applied(effects)[0].patch.executionStats).toEqual({ startTime: 1000, duration: 0, progress: 0 });
    });

    it('finishes at 100 when the server did not say', () => {
        const { effects } = play([{ nodeId: 'n1', state: 'COMPLETED', no: 2 }]);

        expect(applied(effects)[0].patch.executionStats).toEqual({ progress: 100 });
    });

    it('carries a bare progress update on its own', () => {
        const { effects } = play([{ nodeId: 'n1', progress: 42, no: 1 }]);

        expect(applied(effects)[0].patch.executionStats).toEqual({ progress: 42 });
    });

    it('leaves stats alone when there is no progress to report', () => {
        const { effects } = play([{ nodeId: 'n1', state: 'READY', no: 1 }]);

        expect(applied(effects)[0].patch.executionStats).toBeUndefined();
    });
});

describe('autorun', () => {
    it('offers a READY node to the caller', () => {
        const { effects } = play([{ nodeId: 'n1', state: 'READY', no: 1 }]);

        expect(effects).toContainEqual({ type: 'maybe-autorun', nodeId: 'n1' });
    });

    it('offers nothing for any other state', () => {
        const { effects } = play([{ nodeId: 'n1', state: 'RUNNING', no: 1 }]);

        expect(effects.filter(e => e.type === 'maybe-autorun')).toHaveLength(0);
    });
});

describe('port events', () => {
    it('reports an update', () => {
        const { effects } = reducePortEvent(emptyExecutionState(), {
            portId: 'n1:out@out',
            nodeId: 'n1',
            portName: 'out',
            no: 1,
        });

        expect(effects).toEqual([
            { type: 'port-updated', portId: 'n1:out@out', nodeId: 'n1', portName: 'out', runId: undefined, no: 1 },
        ]);
    });

    it('drops a stale port frame', () => {
        const first = reducePortEvent(emptyExecutionState(), { portId: 'p', nodeId: 'n1', no: 4 });
        const second = reducePortEvent(first.state, { portId: 'p', nodeId: 'n1', no: 2 });

        expect(second.effects).toHaveLength(0);
    });

    it('keeps a port sequence out of its node keyspace', () => {
        const first = reducePortEvent(emptyExecutionState(), { portId: 'p', nodeId: 'n1', no: 9 });
        const node = reduceNodeEvent(first.state, { nodeId: 'n1', no: 1, state: 'RUNNING' });

        expect(applied(node.effects)).toHaveLength(1);
    });

    it('lets a new run restart the port sequence', () => {
        const first = reducePortEvent(emptyExecutionState(), { portId: 'p', nodeId: 'n1', runId: 'r1', no: 7 });
        const second = reducePortEvent(first.state, { portId: 'p', nodeId: 'n1', runId: 'r2', no: 1 });

        expect(second.effects).toHaveLength(1);
    });

    it('drops a port event from another flow', () => {
        const { effects } = reducePortEvent(
            emptyExecutionState(),
            { portId: 'p', nodeId: 'n1', flowId: 'other', no: 1 },
            { currentFlowId: 'mine' }
        );

        expect(effects).toHaveLength(0);
    });
});

describe('port freshness override', () => {
    it('accepts a stale sequence when the server stamped it fresh', () => {
        // `ts` is the server vouching for the frame; dropping it loses data it deliberately resent.
        const first = reducePortEvent(emptyExecutionState(), { portId: 'p', nodeId: 'n1', no: 5 });
        const second = reducePortEvent(first.state, { portId: 'p', nodeId: 'n1', no: 2, ts: 1771810838212 });

        expect(second.effects).toHaveLength(1);
    });

    it('still drops a stale sequence without a stamp', () => {
        const first = reducePortEvent(emptyExecutionState(), { portId: 'p', nodeId: 'n1', no: 5 });
        const second = reducePortEvent(first.state, { portId: 'p', nodeId: 'n1', no: 2 });

        expect(second.effects).toHaveLength(0);
    });
});

describe('rollbackPortCursor', () => {
    it('gives the sequence back so a resend can land', () => {
        const accepted = reducePortEvent(emptyExecutionState(), { portId: 'p', nodeId: 'n1', no: 4 });

        const rolled = rollbackPortCursor(accepted.state, 'p', 4);
        const retry = reducePortEvent(rolled, { portId: 'p', nodeId: 'n1', no: 4 });

        expect(retry.effects).toHaveLength(1);
    });

    it('leaves a cursor that has already moved on alone', () => {
        const first = reducePortEvent(emptyExecutionState(), { portId: 'p', nodeId: 'n1', no: 4 });
        const second = reducePortEvent(first.state, { portId: 'p', nodeId: 'n1', no: 5 });

        expect(rollbackPortCursor(second.state, 'p', 4)).toBe(second.state);
    });
});

describe('progress snapshots', () => {
    it('takes a newer sequence', () => {
        const first = reduceProgressEvent(emptyExecutionState(), { nodeId: 'n1', seq: 10, percent: 30 });
        const second = reduceProgressEvent(first.state, { nodeId: 'n1', seq: 11, percent: 60 });

        expect(applied(second.effects)[0].patch.executionStats).toEqual({ progress: 60 });
    });

    it('drops an older or repeated sequence', () => {
        const first = reduceProgressEvent(emptyExecutionState(), { nodeId: 'n1', seq: 10, percent: 30 });

        expect(reduceProgressEvent(first.state, { nodeId: 'n1', seq: 9 }).effects).toHaveLength(0);
        expect(reduceProgressEvent(first.state, { nodeId: 'n1', seq: 10 }).effects).toHaveLength(0);
    });

    it('derives a percentage from step counts when none was given', () => {
        const { effects } = reduceProgressEvent(emptyExecutionState(), {
            nodeId: 'n1',
            seq: 1,
            step: 1,
            totalSteps: 4,
        });

        expect(applied(effects)[0].patch.executionStats).toEqual({ progress: 25 });
    });

    it('maps status onto a node state', () => {
        const done = reduceProgressEvent(emptyExecutionState(), { nodeId: 'n1', seq: 1, status: 'done' });
        const failed = reduceProgressEvent(emptyExecutionState(), { nodeId: 'n1', seq: 1, status: 'error' });
        const going = reduceProgressEvent(emptyExecutionState(), { nodeId: 'n1', seq: 1, status: 'step' });

        expect(applied(done.effects)[0].patch.state).toBe('COMPLETED');
        expect(applied(failed.effects)[0].patch.state).toBe('ERROR');
        expect(applied(going.effects)[0].patch.state).toBe('RUNNING');
    });

    it('restarts the progress clock when a new run begins', () => {
        // The reporter restarts at a low seq; without the reset the previous run's high
        // watermark swallows every snapshot of the new one.
        let state = reduceProgressEvent(emptyExecutionState(), { nodeId: 'n1', seq: 900, percent: 90 }).state;
        state = reduceNodeEvent(state, { nodeId: 'n1', runId: 'r1', no: 1, state: 'RUNNING' }).state;
        state = reduceNodeEvent(state, { nodeId: 'n1', runId: 'r2', no: 1, state: 'RUNNING' }).state;

        expect(reduceProgressEvent(state, { nodeId: 'n1', seq: 5, percent: 5 }).effects).toHaveLength(1);
    });
});

describe('a run belongs to the node, not the port', () => {
    /**
     * `run-begin`/`run-end` used to carry the raw `nodeId`, so a port-shaped terminal frame
     * reported the run under `n1:out`. `runSession` settles waiters on that id, so
     * `waitForNode('n1')` never matched and hung to its timeout while the graph already
     * said COMPLETED. `reset-node` next to it already used the parent.
     */
    it('reports run-begin against the parent for a port-shaped frame', () => {
        const { effects } = play([
            { nodeId: 'n1:out', isPort: true, parentNodeId: 'n1', runId: 'r1', state: 'RUNNING', no: 1 },
        ]);

        expect(effects.filter(e => e.type === 'run-begin')).toEqual([{ type: 'run-begin', runId: 'r1', nodeId: 'n1' }]);
    });

    it('reports run-end against the parent for a port-shaped frame', () => {
        const { effects } = play([
            { nodeId: 'n1:out', isPort: true, parentNodeId: 'n1', runId: 'r1', state: 'COMPLETED', no: 2 },
        ]);

        expect(effects.filter(e => e.type === 'run-end')).toEqual([
            { type: 'run-end', runId: 'r1', nodeId: 'n1', state: 'COMPLETED', error: undefined },
        ]);
    });

    it('still uses the node id when the frame is not port-shaped', () => {
        const { effects } = play([{ nodeId: 'n1', runId: 'r1', state: 'COMPLETED', no: 2 }]);

        expect(effects.filter(e => e.type === 'run-end')).toEqual([
            { type: 'run-end', runId: 'r1', nodeId: 'n1', state: 'COMPLETED', error: undefined },
        ]);
    });
});
