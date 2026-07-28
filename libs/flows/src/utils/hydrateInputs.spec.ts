import { describe, expect, it } from 'vitest';

import { hydrateInputsFromUpstream } from './hydrateInputs';

interface Packet {
    value?: unknown;
    type?: string;
}

const edge = (sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string) => ({
    sourceNodeId,
    sourcePortId,
    targetNodeId,
    targetPortId,
});

describe('hydrateInputsFromUpstream', () => {
    it('fills an empty input from its upstream output', () => {
        const inputs = hydrateInputsFromUpstream<Packet>(
            'b',
            [edge('a', 'out', 'b', 'in')],
            [{ id: 'a', outputData: { out: { value: 'fresh', type: 'text' } } }],
            {}
        );

        expect(inputs['in']).toEqual({ value: 'fresh', type: 'text' });
    });

    it('replaces what an earlier run left on a connected port', () => {
        // The defect this covers: the port already holds a value, so this used to be
        // skipped and the node ran — and upserted to the server — on the stale packet.
        const inputs = hydrateInputsFromUpstream<Packet>(
            'b',
            [edge('a', 'out', 'b', 'in')],
            [{ id: 'a', outputData: { out: { value: 'fresh', type: 'text' } } }],
            { in: { value: 'stale', type: 'text' } }
        );

        expect(inputs['in']).toEqual({ value: 'fresh', type: 'text' });
    });

    it('keeps an existing value when the upstream node has produced nothing', () => {
        const inputs = hydrateInputsFromUpstream<Packet>('b', [edge('a', 'out', 'b', 'in')], [{ id: 'a' }], {
            in: { value: 'kept', type: 'text' },
        });

        expect(inputs['in']).toEqual({ value: 'kept', type: 'text' });
    });

    it('leaves a port with no incoming connection alone', () => {
        const inputs = hydrateInputsFromUpstream<Packet>(
            'b',
            [edge('a', 'out', 'b', 'in')],
            [{ id: 'a', outputData: { out: { value: 'fresh', type: 'text' } } }],
            { manual: { value: 'unconnected', type: 'text' } }
        );

        expect(inputs['manual']).toEqual({ value: 'unconnected', type: 'text' });
        expect(inputs['in']).toEqual({ value: 'fresh', type: 'text' });
    });

    it('ignores edges that target another node', () => {
        const inputs = hydrateInputsFromUpstream<Packet>(
            'b',
            [edge('a', 'out', 'c', 'in')],
            [{ id: 'a', outputData: { out: { value: 'fresh', type: 'text' } } }],
            {}
        );

        expect(inputs).toEqual({});
    });

    it('does not mutate the inputs it was given', () => {
        const existing = { in: { value: 'stale', type: 'text' } };

        hydrateInputsFromUpstream<Packet>(
            'b',
            [edge('a', 'out', 'b', 'in')],
            [{ id: 'a', outputData: { out: { value: 'fresh', type: 'text' } } }],
            existing
        );

        expect(existing.in).toEqual({ value: 'stale', type: 'text' });
    });
});
