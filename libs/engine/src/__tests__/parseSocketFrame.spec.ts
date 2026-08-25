import { describe, expect, it } from 'vitest';

import { parsePortId, parseSocketFrame } from '../runtime/parseSocketFrame';

describe('envelopes', () => {
    it('reads a bare frame', () => {
        const frame = parseSocketFrame({ type: 'node', id: 'n1', state: 'RUNNING' });

        expect(frame).toMatchObject({ kind: 'node', event: { nodeId: 'n1', state: 'RUNNING' } });
    });

    it('unwraps an action envelope', () => {
        const frame = parseSocketFrame({ action: 'message', data: { type: 'node', id: 'n1', state: 'COMPLETED' } });

        expect(frame).toMatchObject({ kind: 'node', event: { nodeId: 'n1', state: 'COMPLETED' } });
    });

    it('merges a trace envelope, whose halves are split across levels', () => {
        // seq/ts/stage ride on the envelope, the node id rides inside `data` — neither
        // half identifies a frame on its own.
        const frame = parseSocketFrame({
            action: 'trace',
            seq: 7,
            ts: 1700,
            stage: 'tool',
            message: 'called search',
            data: { id: 'n1', runId: 'r1' },
        });

        expect(frame).toEqual({
            kind: 'trace',
            trace: {
                nodeId: 'n1',
                flowId: undefined,
                seq: 7,
                ts: 1700,
                stage: 'tool',
                message: 'called search',
                state: undefined,
                runId: 'r1',
                data: undefined,
            },
        });
    });

    it('parses a JSON string, the shape the socket actually delivers', () => {
        const frame = parseSocketFrame('{"type":"node","id":"n1","state":"READY","no":3}');

        expect(frame).toMatchObject({ kind: 'node', event: { nodeId: 'n1', state: 'READY', no: 3 } });
    });

    it('returns null for malformed JSON rather than throwing', () => {
        expect(parseSocketFrame('{not json')).toBeNull();
    });

    it('returns null when nothing identifies a node', () => {
        expect(parseSocketFrame({ type: 'node', state: 'RUNNING' })).toBeNull();
    });

    it('accepts nodeId in place of id where the frame has no id of its own', () => {
        expect(parseSocketFrame({ nodeId: 'n9', seq: 1, message: 'step' })).toMatchObject({ kind: 'trace' });
    });
});

describe('frames that are about a node rather than from one', () => {
    // A port row or a data response names the node it belongs to in `nodeId`, alongside a
    // `type`. Reading those as node state puts a toast on an id that is not a canvas node.
    it('refuses a node frame that also names a nodeId', () => {
        expect(parseSocketFrame({ type: 'node', id: 'n1:out', nodeId: 'n1', state: 'COMPLETED' })).toBeNull();
    });

    it('refuses a flow frame that also names a nodeId', () => {
        expect(parseSocketFrame({ type: 'flow', id: 'f1', nodeId: 'n1' })).toBeNull();
    });

    it('refuses a node frame that has only a nodeId to go on', () => {
        expect(parseSocketFrame({ type: 'node', nodeId: 'n9', state: 'RUNNING' })).toBeNull();
    });

    it('still reads an ordinary node frame', () => {
        expect(parseSocketFrame({ type: 'node', id: 'n1', state: 'RUNNING' })?.kind).toBe('node');
    });
});

describe('port ids', () => {
    it('splits nodeId, portName and direction', () => {
        expect(parsePortId('1000637:in@in')).toEqual({
            nodeId: '1000637',
            portId: '1000637:in',
            portName: 'in',
            direction: 'in',
        });
    });

    it('leaves direction unset when the id carries no suffix', () => {
        // Guessing would send the follow-up fetch to the wrong side of the node.
        expect(parsePortId('1000637:out')).toEqual({
            nodeId: '1000637',
            portId: '1000637:out',
            portName: 'out',
            direction: undefined,
        });
    });

    it('ignores a suffix that is not a direction', () => {
        expect(parsePortId('n1:out@sideways')?.direction).toBeUndefined();
    });

    it('rejects an id with no port at all', () => {
        expect(parsePortId('1000637')).toBeNull();
    });

    it('carries the parts onto a node/port frame', () => {
        const frame = parseSocketFrame({ type: 'node/port', id: 'n1:out@out', flowId: 'f1', no: 4, ts: 99 });

        expect(frame).toEqual({
            kind: 'port',
            direction: 'out',
            event: { portId: 'n1:out', nodeId: 'n1', portName: 'out', flowId: 'f1', runId: undefined, no: 4, ts: 99 },
        });
    });

    it('drops a node/port frame whose id has no port', () => {
        expect(parseSocketFrame({ type: 'node/port', id: 'n1' })).toBeNull();
    });
});

describe('node frames that are really about a port', () => {
    it('marks a colon-bearing node id as a port and names the parent', () => {
        const frame = parseSocketFrame({ type: 'node', id: 'n1:5', state: 'COMPLETED' });

        expect(frame).toMatchObject({ kind: 'node', event: { isPort: true, parentNodeId: 'n1' } });
    });

    it('leaves a plain node id alone', () => {
        const frame = parseSocketFrame({ type: 'node', id: 'n1', state: 'COMPLETED' });

        expect(frame).toMatchObject({ event: { isPort: false, parentNodeId: undefined } });
    });

    it('drops a state the engine does not recognise', () => {
        const frame = parseSocketFrame({ type: 'node', id: 'n1', state: 'PENDING' });

        expect(frame).toMatchObject({ event: { state: undefined } });
    });
});

describe('progress envelopes', () => {
    it('reads the snapshot from one level down', () => {
        // The envelope's own fields are not the snapshot's; `seq` at the top level belongs
        // to the message, and ordering the stream by it would use the wrong clock.
        const frame = parseSocketFrame({
            type: 'progress:deploy',
            id: 'n1',
            seq: 999,
            data: { seq: 12, status: 'running', percent: 40, label: 'deploying' },
        });

        expect(frame).toMatchObject({
            kind: 'progress',
            label: 'deploying',
            event: { nodeId: 'n1', seq: 12, status: 'running', percent: 40 },
        });
    });

    it('carries the product view the caller merges into the node output', () => {
        const frame = parseSocketFrame({
            type: 'progress:deploy',
            id: 'n1',
            data: { seq: 1, meta: { product$: { url: 'https://x' } } },
        });

        expect(frame).toMatchObject({ product$: { url: 'https://x' } });
    });

    it('defaults a missing seq to zero rather than dropping the snapshot', () => {
        expect(parseSocketFrame({ type: 'progress:x', id: 'n1', data: { percent: 10 } })).toMatchObject({
            event: { seq: 0, percent: 10 },
        });
    });

    it('drops an envelope with no snapshot inside', () => {
        expect(parseSocketFrame({ type: 'progress:x', id: 'n1' })).toBeNull();
    });
});

describe('log envelopes', () => {
    it('unpacks the batch, keeping the order it was written in', () => {
        const frame = parseSocketFrame({
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

        expect(frame).toMatchObject({ kind: 'log', log: { nodeId: 'n1', source: 'run-1' } });
        expect(frame?.kind === 'log' && frame.log.entries.map(e => e.message)).toEqual(['first', 'second']);
    });

    it('drops an empty batch', () => {
        expect(parseSocketFrame({ type: 'log:info', id: 'n1', data: { entries: [] } })).toBeNull();
    });

    it('drops an envelope with no batch inside', () => {
        expect(parseSocketFrame({ type: 'log:info', id: 'n1' })).toBeNull();
    });
});

describe('discrimination', () => {
    it('reads a flow reload notice', () => {
        expect(parseSocketFrame({ type: 'flow', id: 'f1', timestamp: 1 })).toEqual({ kind: 'flow', flowId: 'f1' });
    });

    it('treats a typeless frame carrying seq as a trace', () => {
        expect(parseSocketFrame({ id: 'n1', seq: 3, message: 'step' })).toMatchObject({ kind: 'trace' });
    });

    it('drops a trace with neither a stage nor a message — a completion signal', () => {
        expect(parseSocketFrame({ id: 'n1', seq: 3, runId: 'r1' })).toBeNull();
    });

    it('drops a history node, which is a past snapshot and not the live node', () => {
        expect(parseSocketFrame({ type: 'node', id: 'ywb8c99z3@2', state: 'COMPLETED' })).toBeNull();
    });

    it('ignores traffic it has no opinion about', () => {
        expect(parseSocketFrame({ type: 'product-progress', id: 'p1' })).toBeNull();
    });
});

describe('a trace merged with node data', () => {
    it('stays a trace even though the merge left `type: node` on it', () => {
        // The envelope merge copies the nested payload's fields up, `type` included.
        // Matching on type first would file every agent trace as a node state change.
        const frame = parseSocketFrame({
            action: 'trace',
            seq: 4,
            ts: 1700,
            stage: 'step',
            message: 'thinking',
            data: { id: 'n1', type: 'node', state: 'RUNNING' },
        });

        expect(frame?.kind).toBe('trace');
    });

    it('still reads a node frame that carries no seq', () => {
        expect(parseSocketFrame({ type: 'node', id: 'n1', no: 4, state: 'RUNNING' })?.kind).toBe('node');
    });
});
