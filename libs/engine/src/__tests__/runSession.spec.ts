import { describe, expect, it } from 'vitest';

import { createStubSocketPort } from '../cli/stubSocketPort';
import { createFlowEngine } from '../engine';
import { createRunSession } from '../runtime/runSession';

import type { ExecutionEffect } from '../runtime/executionReducer';
import type { SocketFrame } from '../runtime/parseSocketFrame';
import type { NodeData, WorkflowState } from '@lemoncloud/eureka-flows-api';

const GRAPH = {
    nodes: [
        { id: 'n1', type: 'input-text', position: { x: 0, y: 0 }, config: {} },
        { id: 'n2', type: 'process-llm', position: { x: 300, y: 0 }, config: {} },
    ] as unknown as NodeData[],
    edges: [],
} as unknown as WorkflowState;

const harness = (currentFlowId: string | null = 'f1') => {
    const engine = createFlowEngine();
    engine.loadGraph(GRAPH);

    const socket = createStubSocketPort();
    const effects: ExecutionEffect[] = [];
    const frames: SocketFrame[] = [];

    const session = createRunSession({
        engine,
        socket,
        currentFlowId,
        onEffect: effect => effects.push(effect),
        onFrame: frame => frames.push(frame),
    });
    socket.connect();

    const stateOf = (nodeId: string): string | undefined =>
        (engine.getGraph().nodes.find(n => n.id === nodeId) as { state?: string } | undefined)?.state;

    return { engine, socket, session, effects, frames, stateOf };
};

describe('applying a run to the graph', () => {
    it('writes the node state the server reports', () => {
        const { socket, stateOf } = harness();

        socket.emit({ type: 'node', id: 'n1', flowId: 'f1', no: 1, state: 'RUNNING' });

        expect(stateOf('n1')).toBe('RUNNING');
    });

    it('does not put a run on the undo stack', () => {
        const { engine, socket } = harness();

        socket.emit({ type: 'node', id: 'n1', flowId: 'f1', no: 1, state: 'RUNNING' });

        // A run is the server's doing, not the user's. Undo must not reach into it.
        expect(engine.canUndo()).toBe(false);
    });

    it('ignores a frame for a node this graph does not have', () => {
        const { socket, engine } = harness();

        socket.emit({ type: 'node', id: 'ghost', flowId: 'f1', no: 1, state: 'RUNNING' });

        expect(engine.getGraph().nodes).toHaveLength(2);
    });

    it('drops a frame belonging to another flow', () => {
        const { socket, stateOf } = harness();

        socket.emit({ type: 'node', id: 'n1', flowId: 'other', no: 1, state: 'RUNNING' });

        expect(stateOf('n1')).toBeUndefined();
    });

    it('refuses a stale frame, so a finished node does not walk backwards', () => {
        const { socket, stateOf } = harness();

        socket.emit({ type: 'node', id: 'n1', flowId: 'f1', no: 2, state: 'COMPLETED' });
        socket.emit({ type: 'node', id: 'n1', flowId: 'f1', no: 1, state: 'RUNNING' });

        expect(stateOf('n1')).toBe('COMPLETED');
    });

    it('follows a progress envelope', () => {
        const { socket, stateOf } = harness();

        socket.emit({ type: 'progress:deploy', id: 'n2', data: { seq: 5, percent: 40 } });

        expect(stateOf('n2')).toBe('RUNNING');
    });
});

describe('effects the engine cannot carry out', () => {
    it('hands a toast to the caller', () => {
        const { socket, effects } = harness();

        socket.emit({ type: 'node', id: 'n1', flowId: 'f1', no: 1, state: 'COMPLETED' });

        expect(effects.filter(e => e.type === 'notify')).toHaveLength(1);
    });

    it('hands over a port frame, whose data still needs fetching', () => {
        const { socket, effects, frames } = harness();

        socket.emit({ type: 'node/port', id: 'n1:out@out', flowId: 'f1', no: 1 });

        expect(effects.filter(e => e.type === 'port-updated')).toHaveLength(1);
        expect(frames).toHaveLength(1);
    });

    it('hands over traces and flow reloads without touching the graph', () => {
        const { socket, frames, engine } = harness();

        socket.emit({ id: 'n1', seq: 1, message: 'step' });
        socket.emit({ type: 'flow', id: 'f1' });

        expect(frames.map(f => f.kind)).toEqual(['trace', 'flow']);
        expect(engine.canUndo()).toBe(false);
    });
});

describe('waiting for a node', () => {
    it('resolves when the run ends', async () => {
        const { socket, session } = harness();

        const settled = session.waitForNode('n1');
        socket.emit({ type: 'node', id: 'n1', flowId: 'f1', runId: 'r1', no: 1, state: 'COMPLETED' });

        await expect(settled).resolves.toMatchObject({ nodeId: 'n1', state: 'COMPLETED', runId: 'r1' });
    });

    it('resolves on failure too, carrying the message', async () => {
        const { socket, session } = harness();

        const settled = session.waitForNode('n1');
        socket.emit({ type: 'node', id: 'n1', flowId: 'f1', runId: 'r1', no: 1, state: 'ERROR', error: 'boom' });

        await expect(settled).resolves.toMatchObject({ state: 'ERROR', error: 'boom' });
    });

    it('resolves for a run that never announced a runId', async () => {
        // No runId means no `run-end` effect. A caller that waited on that alone would
        // hang on a run that finished.
        const { socket, session } = harness();

        const settled = session.waitForNode('n1');
        socket.emit({ type: 'node', id: 'n1', flowId: 'f1', no: 1, state: 'COMPLETED' });

        await expect(settled).resolves.toMatchObject({ state: 'COMPLETED' });
    });

    it('stays pending while the node is only running', async () => {
        const { socket, session } = harness();
        let settled = false;

        void session.waitForNode('n1').then(() => (settled = true));
        socket.emit({ type: 'node', id: 'n1', flowId: 'f1', runId: 'r1', no: 1, state: 'RUNNING' });
        await Promise.resolve();

        expect(settled).toBe(false);
    });

    it('wakes every waiter on the same node', async () => {
        const { socket, session } = harness();

        const both = Promise.all([session.waitForNode('n1'), session.waitForNode('n1')]);
        socket.emit({ type: 'node', id: 'n1', flowId: 'f1', runId: 'r1', no: 1, state: 'COMPLETED' });

        await expect(both).resolves.toHaveLength(2);
    });

    it('rejects once the timeout passes', async () => {
        const { session } = harness();

        await expect(session.waitForNode('n1', { timeoutMs: 5 })).rejects.toThrow(/timed out/);
    });

    it('does not fire a timeout for a node that already finished', async () => {
        const { socket, session } = harness();

        const settled = session.waitForNode('n1', { timeoutMs: 20 });
        socket.emit({ type: 'node', id: 'n1', flowId: 'f1', runId: 'r1', no: 1, state: 'COMPLETED' });

        await expect(settled).resolves.toMatchObject({ state: 'COMPLETED' });
    });
});

describe('lifecycle', () => {
    it('forgets cursors on reset, so the next flow starts at zero', () => {
        const { socket, session, stateOf } = harness();

        socket.emit({ type: 'node', id: 'n1', flowId: 'f1', no: 5, state: 'COMPLETED' });
        session.reset();
        socket.emit({ type: 'node', id: 'n1', flowId: 'f1', no: 1, state: 'RUNNING' });

        // Same sequence number would have been stale a moment ago; after a reset it is not.
        expect(stateOf('n1')).toBe('RUNNING');
        expect(session.state().nodes['n1']).toMatchObject({ no: 1 });
    });

    it('takes a new flow id on reset', () => {
        const { socket, session, stateOf } = harness();

        session.reset('f2');
        socket.emit({ type: 'node', id: 'n1', flowId: 'f1', no: 1, state: 'RUNNING' });

        expect(stateOf('n1')).toBeUndefined();
    });

    it('stops listening once closed', () => {
        const { socket, session, stateOf } = harness();

        session.close();
        socket.emit({ type: 'node', id: 'n1', flowId: 'f1', no: 1, state: 'RUNNING' });

        expect(stateOf('n1')).toBeUndefined();
    });

    it('accepts a frame handed to it directly, the same as one off the wire', () => {
        const { session, stateOf } = harness();

        session.handleFrame('{"type":"node","id":"n1","flowId":"f1","no":1,"state":"READY"}');

        expect(stateOf('n1')).toBe('READY');
    });
});
