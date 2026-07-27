import { beforeEach, describe, expect, it, vi } from 'vitest';

import { unwrapSocketEnvelope } from '@flows/engine';

import { SELF_ECHO_MS, dispatchSocketFrame } from '../hooks/dispatchSocketFrame';

import type { DispatchContext } from '../hooks/dispatchSocketFrame';
import type { WebSocketMessage } from '../types';

/**
 * The live path between the wire and the canvas.
 *
 * These drive raw frames through the same routing the worker does, then assert which
 * subscriber heard about it — the part `parseSocketFrame`'s own specs cannot cover,
 * because knowing what a frame *is* says nothing about who is told.
 */

/** Route a raw frame the way the worker's message parser does. */
const route = (raw: Record<string, unknown>): WebSocketMessage => {
    const { payload, action } = unwrapSocketEnvelope(raw);
    return { id: (payload['id'] as string) || (payload['nodeId'] as string), data: payload, action };
};

const NOW = 1_700_000_000_000;

const heard = () => ({
    onFlowUpdate: vi.fn(),
    onNodeReload: vi.fn(),
    onPortUpdate: vi.fn(),
    onTraceUpdate: vi.fn(),
    onProgressUpdate: vi.fn(),
    onLogTrace: vi.fn(),
    onProductProgress: vi.fn(),
});

let subscribers: ReturnType<typeof heard>;

const send = (raw: Record<string, unknown>, over: Partial<DispatchContext> = {}): void =>
    dispatchSocketFrame(route(raw), { currentFlowId: 'f1', now: () => NOW, ...subscribers, ...over });

beforeEach(() => {
    subscribers = heard();
});

describe('node frames', () => {
    it('reaches the node subscriber', () => {
        send({ type: 'node', id: 'n1', flowId: 'f1', no: 2, state: 'RUNNING', runId: 'r1' });

        expect(subscribers.onNodeReload).toHaveBeenCalledWith(
            expect.objectContaining({ nodeId: 'n1', state: 'RUNNING', no: 2, runId: 'r1', isPort: false })
        );
    });

    it('marks a colon-bearing id as a port and names the parent', () => {
        send({ type: 'node', id: 'n1:5', flowId: 'f1', state: 'COMPLETED' });

        expect(subscribers.onNodeReload).toHaveBeenCalledWith(
            expect.objectContaining({ isPort: true, parentNodeId: 'n1' })
        );
    });

    it('drops a frame belonging to another flow', () => {
        send({ type: 'node', id: 'n1', flowId: 'other', state: 'RUNNING' });

        expect(subscribers.onNodeReload).not.toHaveBeenCalled();
    });

    it('keeps a frame that states no flow — the channel already filtered', () => {
        send({ type: 'node', id: 'n1', state: 'RUNNING' });

        expect(subscribers.onNodeReload).toHaveBeenCalled();
    });

    it('drops a history snapshot', () => {
        send({ type: 'node', id: 'ywb8c99z3@2', flowId: 'f1', state: 'COMPLETED' });

        expect(subscribers.onNodeReload).not.toHaveBeenCalled();
    });

    it('drops a frame that names a nodeId, which describes a node rather than being one', () => {
        // A port row or data response carries both; treating it as node state would toast
        // an id that is not on the canvas.
        send({ type: 'node', id: 'n1:out', nodeId: 'n1', flowId: 'f1', state: 'COMPLETED' });

        expect(subscribers.onNodeReload).not.toHaveBeenCalled();
    });

    it('ignores the self-echo window, since run frames arrive right after a save', () => {
        send({ type: 'node', id: 'n1', flowId: 'f1', state: 'RUNNING' }, { getLastLocalUpdateTimestamp: () => NOW });

        expect(subscribers.onNodeReload).toHaveBeenCalled();
    });
});

describe('flow reload notices', () => {
    it('reaches the flow subscriber', () => {
        send({ type: 'flow', id: 'f1' });

        expect(subscribers.onFlowUpdate).toHaveBeenCalledWith('f1');
    });

    it('is swallowed inside the self-echo window', () => {
        // The notice is this client's own save coming back; reloading would discard
        // whatever has been typed since.
        send({ type: 'flow', id: 'f1' }, { getLastLocalUpdateTimestamp: () => NOW - (SELF_ECHO_MS - 1) });

        expect(subscribers.onFlowUpdate).not.toHaveBeenCalled();
    });

    it('is honoured once the window has passed', () => {
        send({ type: 'flow', id: 'f1' }, { getLastLocalUpdateTimestamp: () => NOW - (SELF_ECHO_MS + 1) });

        expect(subscribers.onFlowUpdate).toHaveBeenCalledWith('f1');
    });

    it('ignores a notice for a different flow', () => {
        send({ type: 'flow', id: 'f2' });

        expect(subscribers.onFlowUpdate).not.toHaveBeenCalled();
    });
});

describe('port frames', () => {
    it('hands over the parts the follow-up fetch needs', () => {
        send({ type: 'node/port', id: 'n1:out@out', flowId: 'f1', no: 4, ts: 99 });

        expect(subscribers.onPortUpdate).toHaveBeenCalledWith({
            portId: 'n1:out',
            nodeId: 'n1',
            portName: 'out',
            direction: 'out',
            flowId: 'f1',
            runId: undefined,
            no: 4,
            ts: 99,
        });
    });

    it('drops a port frame from another flow', () => {
        send({ type: 'node/port', id: 'n1:out@out', flowId: 'other' });

        expect(subscribers.onPortUpdate).not.toHaveBeenCalled();
    });
});

describe('traces', () => {
    it('routes a merged trace to the trace subscriber, not the node one', () => {
        // The merge copies the nested payload's `type: 'node'` up. Matching on type first
        // would file every agent trace as a node state change.
        send({
            action: 'trace',
            seq: 4,
            ts: 1700,
            stage: 'step',
            message: 'thinking',
            data: { id: 'n1', type: 'node', flowId: 'f1', runId: 'r1' },
        });

        expect(subscribers.onTraceUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ nodeId: 'n1', seq: 4, stage: 'step', message: 'thinking', runId: 'r1' })
        );
        expect(subscribers.onNodeReload).not.toHaveBeenCalled();
    });

    it('stamps a trace that arrived without a timestamp', () => {
        send({ action: 'trace', seq: 1, stage: 'run', message: 'started', data: { id: 'n1' } });

        expect(subscribers.onTraceUpdate).toHaveBeenCalledWith(expect.objectContaining({ ts: NOW }));
    });

    it('drops a completion signal carrying neither stage nor message', () => {
        send({ action: 'trace', seq: 9, data: { id: 'n1', runId: 'r1' } });

        expect(subscribers.onTraceUpdate).not.toHaveBeenCalled();
    });

    it('drops a trace from another flow', () => {
        send({ action: 'trace', seq: 1, stage: 'run', message: 'x', data: { id: 'n1', flowId: 'other' } });

        expect(subscribers.onTraceUpdate).not.toHaveBeenCalled();
    });
});

describe('progress and log envelopes', () => {
    it('reads the progress snapshot from one level down', () => {
        send({
            type: 'progress:deploy',
            id: 'n1',
            seq: 999,
            data: { seq: 12, status: 'running', percent: 40, label: 'deploying', meta: { product$: { url: 'u' } } },
        });

        expect(subscribers.onProgressUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ nodeId: 'n1', seq: 12, status: 'running', percent: 40, label: 'deploying' })
        );
    });

    it('carries the product view through', () => {
        send({ type: 'progress:x', id: 'n1', data: { seq: 1, meta: { product$: { url: 'u' } } } });

        expect(subscribers.onProgressUpdate).toHaveBeenCalledWith(expect.objectContaining({ product$: { url: 'u' } }));
    });

    it('emits one call per log line, in the order they were written', () => {
        send({
            type: 'log:info',
            id: 'n1',
            data: {
                source: 'run-1',
                entries: [
                    { message: 'first', seq: 1 },
                    { message: 'second', seq: 2 },
                ],
            },
        });

        expect(subscribers.onLogTrace).toHaveBeenCalledTimes(2);
        expect(subscribers.onLogTrace.mock.calls.map(([entry]) => entry.message)).toEqual(['first', 'second']);
        expect(subscribers.onLogTrace).toHaveBeenCalledWith(expect.objectContaining({ nodeId: 'n1', source: 'run-1' }));
    });
});

describe('traffic the graph has no opinion about', () => {
    it('routes product deploy progress to its own subscriber', () => {
        // `action: 'progress'` is not an envelope the unwrap opens, so the payload stays
        // flat — the fields sit alongside the action, not inside a `data`.
        send({
            action: 'progress',
            type: 'product-progress',
            id: 'p1',
            productId: 'p1',
            progress$: { build: 40 },
            state: 'building',
        });

        expect(subscribers.onProductProgress).toHaveBeenCalledWith(
            expect.objectContaining({ productId: 'p1', state: 'building', timestamps: [] })
        );
    });

    it('tells nobody about a frame it does not recognise', () => {
        send({ type: 'something-else', id: 'x1' });

        for (const subscriber of Object.values(subscribers)) expect(subscriber).not.toHaveBeenCalled();
    });
});
