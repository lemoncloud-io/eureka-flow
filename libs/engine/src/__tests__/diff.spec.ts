import { describe, expect, it } from 'vitest';

import { diffSnapshots, hasStructuralChange } from '../persistence/diff';
import { emptySnapshot } from '../persistence/snapshot';

import type { FlowSnapshot } from '../persistence/snapshot';
import type { EdgeData, NodeData } from '@lemoncloud/eureka-flows-api';

const node = (id: string, over: Partial<NodeData> = {}): NodeData =>
    ({
        id,
        type: 'input-text',
        position: { x: 0, y: 0 },
        config: { value: 'hello' },
        ...over,
    }) as NodeData;

const edge = (id: string, source = 'a', target = 'b'): EdgeData =>
    ({
        id,
        sourceNodeId: source,
        sourcePortId: 'out',
        targetNodeId: target,
        targetPortId: 'in',
    }) as unknown as EdgeData;

const snapshot = (nodes: NodeData[], edges: EdgeData[] = []): FlowSnapshot => ({ nodes, edges });

describe('diffSnapshots — nodes', () => {
    it('reads an unchanged flow as empty', () => {
        const diff = diffSnapshots(snapshot([node('a')]), snapshot([node('a')]));

        expect(diff.isEmpty).toBe(true);
    });

    it('sorts each node into added, removed or modified', () => {
        const before = snapshot([node('kept'), node('gone')]);
        const after = snapshot([node('kept', { position: { x: 5, y: 5 } }), node('fresh')]);

        const diff = diffSnapshots(after, before);

        expect(diff.addedNodes).toEqual(['fresh']);
        expect(diff.removedNodes).toEqual(['gone']);
        expect(diff.modifiedNodes).toEqual(['kept']);
        expect(diff.isEmpty).toBe(false);
    });

    it('does not call a flow dirty over config key order', () => {
        const before = snapshot([node('a', { config: { alpha: 1, beta: 2 } })]);
        const after = snapshot([node('a', { config: { beta: 2, alpha: 1 } })]);

        expect(diffSnapshots(after, before).isEmpty).toBe(true);
    });

    it('does not call a flow dirty over an undefined field nobody set', () => {
        const before = snapshot([node('a')]);
        const after = snapshot([node('a', { customLabel: undefined })]);

        expect(diffSnapshots(after, before).isEmpty).toBe(true);
    });

    it('sees a nested config edit', () => {
        const before = snapshot([node('a', { config: { nested: { deep: 1 } } })]);
        const after = snapshot([node('a', { config: { nested: { deep: 2 } } })]);

        expect(diffSnapshots(after, before).modifiedNodes).toEqual(['a']);
    });

    it('measures a new flow against the empty snapshot', () => {
        const diff = diffSnapshots(snapshot([node('a')]), emptySnapshot());

        expect(diff.addedNodes).toEqual(['a']);
    });
});

describe('diffSnapshots — edges', () => {
    it('reads a re-pointed edge as one removal and one addition', () => {
        // An edge has no `modified` bucket: a changed connection is a different edge
        // wearing the same id.
        const before = snapshot([], [edge('e1', 'a', 'b')]);
        const after = snapshot([], [edge('e1', 'a', 'c')]);

        const diff = diffSnapshots(after, before);

        expect(diff.addedEdges).toEqual(['e1']);
        expect(diff.removedEdges).toEqual(['e1']);
    });

    it('ignores fields that do not describe the connection', () => {
        const before = snapshot([], [edge('e1')]);
        const after = snapshot([], [{ ...edge('e1'), label: 'renamed' } as EdgeData]);

        expect(diffSnapshots(after, before).isEmpty).toBe(true);
    });

    it('reports a genuinely new edge as added only', () => {
        const diff = diffSnapshots(snapshot([], [edge('e1')]), snapshot([], []));

        expect(diff.addedEdges).toEqual(['e1']);
        expect(diff.removedEdges).toEqual([]);
    });
});

describe('hasStructuralChange', () => {
    it('is true for anything the server would drop from a non-owner editor', () => {
        expect(hasStructuralChange(diffSnapshots(snapshot([node('a')]), emptySnapshot()))).toBe(true);
        expect(hasStructuralChange(diffSnapshots(snapshot([], [edge('e1')]), emptySnapshot()))).toBe(true);
        expect(hasStructuralChange(diffSnapshots(snapshot([]), snapshot([node('a')])))).toBe(true);
    });

    it('is false for a config-only edit, which the overlay can hold', () => {
        const before = snapshot([node('a')]);
        const after = snapshot([node('a', { config: { value: 'edited' } })]);

        const diff = diffSnapshots(after, before);

        expect(diff.modifiedNodes).toEqual(['a']);
        expect(hasStructuralChange(diff)).toBe(false);
    });
});
