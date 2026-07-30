import { describe, expect, it } from 'vitest';

import { mergeNodeView } from '../persistence/nodeView';

import type { NodeViewFields } from '../persistence/nodeView';
import type { DataPacket, NodeData } from '@lemoncloud/eureka-flows-api';

const packet = (value: unknown): DataPacket => ({ value, type: 'text' }) as DataPacket;

const current: NodeViewFields = {
    config: { model: 'sonnet', temperature: '0.7' },
    inputData: { in: packet('old-in') },
    outputData: { out: packet('old-out') },
};

/** The array forms have no home in `NodeData`, which is the whole reason this module exists. */
const view = (fields: Record<string, unknown>): Partial<NodeData> => fields as Partial<NodeData>;

describe('mergeNodeView — the wire arrays', () => {
    it('reads config$ into a config object', () => {
        const merged = mergeNodeView(current, view({ config$: [{ key: 'model', val: 'opus' }] }));

        expect(merged.config).toEqual({ model: 'opus' });
    });

    it('reads inputData$$ into an inputData object', () => {
        const merged = mergeNodeView(current, view({ inputData$$: [{ portId: 'in', packet: packet('fresh') }] }));

        expect(merged.inputData).toEqual({ in: packet('fresh') });
    });

    it('reads outputData$$ into an outputData object', () => {
        const merged = mergeNodeView(current, view({ outputData$$: [{ portId: 'out', packet: packet('fresh') }] }));

        expect(merged.outputData).toEqual({ out: packet('fresh') });
    });
});

describe('mergeNodeView — how each field merges', () => {
    it('replaces config rather than merging, so a deleted key stays deleted', () => {
        const merged = mergeNodeView(current, view({ config$: [{ key: 'model', val: 'opus' }] }));

        expect(merged.config).not.toHaveProperty('temperature');
    });

    it('replaces inputData when the array form arrives — it is the whole input state', () => {
        const withTwo: NodeViewFields = { ...current, inputData: { a: packet('a'), b: packet('b') } };

        const merged = mergeNodeView(withTwo, view({ inputData$$: [{ portId: 'a', packet: packet('fresh') }] }));

        expect(merged.inputData).toEqual({ a: packet('fresh') });
    });

    it('merges inputData when the object form arrives — that is one port reporting', () => {
        const withTwo: NodeViewFields = { ...current, inputData: { a: packet('a'), b: packet('b') } };

        const merged = mergeNodeView(withTwo, view({ inputData: { a: packet('fresh') } }));

        expect(merged.inputData).toEqual({ a: packet('fresh'), b: packet('b') });
    });

    it('merges outputData either way — ports report one at a time', () => {
        const withTwo: NodeViewFields = { ...current, outputData: { a: packet('a'), b: packet('b') } };

        const fromArray = mergeNodeView(withTwo, view({ outputData$$: [{ portId: 'a', packet: packet('fresh') }] }));
        const fromObject = mergeNodeView(withTwo, view({ outputData: { a: packet('fresh') } }));

        expect(fromArray.outputData).toEqual({ a: packet('fresh'), b: packet('b') });
        expect(fromObject.outputData).toEqual({ a: packet('fresh'), b: packet('b') });
    });
});

describe('mergeNodeView — absence', () => {
    it('leaves every field alone when the server sends none of them', () => {
        const merged = mergeNodeView(current, view({ state: 'COMPLETED' }));

        expect(merged).toEqual(current);
    });

    it('treats an empty outputData object as no news, not as a clear', () => {
        const merged = mergeNodeView(current, view({ outputData: {} }));

        expect(merged.outputData).toEqual(current.outputData);
    });

    it('does not mutate what it was given', () => {
        const before = JSON.parse(JSON.stringify(current));

        mergeNodeView(current, view({ inputData: { in: packet('fresh') }, config$: [{ key: 'x', val: 'y' }] }));

        expect(current).toEqual(before);
    });
});
