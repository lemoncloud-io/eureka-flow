import { describe, expect, it } from 'vitest';

import { diffSnapshots, emptySnapshot, hasStructuralChange, toSnapshot } from '@flows/flows';

import type { BlockDefinitionWithFrontend, GraphNode } from '@flows/flows';
import type { NodeData } from '@lemoncloud/eureka-flows-api';

const registry = {
    'text-input': { type: 'text-input', inputs: [], outputs: [] },
} as unknown as Record<string, BlockDefinitionWithFrontend>;

const node = (id: string, over: Partial<NodeData> = {}): GraphNode =>
    ({
        id,
        type: 'text-input',
        position: { x: 0, y: 0 },
        config: { value: 'hello' },
        ...over,
    }) as GraphNode;

const edge = (id: string, source = 'a', target = 'b') => ({
    id,
    sourceNodeId: source,
    sourcePortId: 'out',
    targetNodeId: target,
    targetPortId: 'in',
});

const snap = (nodes: GraphNode[], edges: ReturnType<typeof edge>[] = []) =>
    toSnapshot({ nodes, edges } as never, registry);

describe('diffSnapshots', () => {
    it('reports no change when nothing moved', () => {
        const before = snap([node('a'), node('b')], [edge('e1')]);
        const after = snap([node('a'), node('b')], [edge('e1')]);
        expect(diffSnapshots(after, before).isEmpty).toBe(true);
    });

    it('is blind to a node running', () => {
        // This is what keeps save-before-run from looping: a run rewrites status and port
        // data, and none of it may register as an edit.
        const before = snap([node('a')]);
        const after = snap([
            node('a', {
                state: 'COMPLETED',
                status: 'COMPLETED',
                inputData: { in: { value: 'x', type: 'text' } },
                outputData: { out: { value: 'y', type: 'text' } },
                executionStats: { startTime: 1, duration: 2, progress: 100 },
                errorMessage: 'transient',
            } as Partial<NodeData>),
        ]);
        expect(diffSnapshots(after, before)).toMatchObject({ isEmpty: true });
    });

    it('does not care about key order', () => {
        const before = snap([node('a', { config: { x: '1', y: '2' } } as Partial<NodeData>)]);
        const after = snap([node('a', { config: { y: '2', x: '1' } } as Partial<NodeData>)]);
        expect(diffSnapshots(after, before).isEmpty).toBe(true);
    });

    it('is blind to node ordering', () => {
        const before = snap([node('a'), node('b')]);
        const after = snap([node('b'), node('a')]);
        expect(diffSnapshots(after, before).isEmpty).toBe(true);
    });

    it('catches an added node', () => {
        const diff = diffSnapshots(snap([node('a'), node('b')]), snap([node('a')]));
        expect(diff.addedNodes).toEqual(['b']);
        expect(diff.isEmpty).toBe(false);
    });

    it('catches a removed node', () => {
        const diff = diffSnapshots(snap([node('a')]), snap([node('a'), node('b')]));
        expect(diff.removedNodes).toEqual(['b']);
        expect(diff.isEmpty).toBe(false);
    });

    it('catches a moved node', () => {
        const diff = diffSnapshots(snap([node('a', { position: { x: 40, y: 0 } })]), snap([node('a')]));
        expect(diff.modifiedNodes).toEqual(['a']);
    });

    it('catches a config edit', () => {
        const diff = diffSnapshots(snap([node('a', { config: { value: 'bye' } })]), snap([node('a')]));
        expect(diff.modifiedNodes).toEqual(['a']);
    });

    it('catches a rename', () => {
        const diff = diffSnapshots(snap([node('a', { customLabel: 'Renamed' })]), snap([node('a')]));
        expect(diff.modifiedNodes).toEqual(['a']);
    });

    it('catches added and removed edges', () => {
        const diff = diffSnapshots(
            snap([node('a'), node('b')], [edge('e2')]),
            snap([node('a'), node('b')], [edge('e1')])
        );
        expect(diff.addedEdges).toEqual(['e2']);
        expect(diff.removedEdges).toEqual(['e1']);
    });

    it('reads a re-pointed edge as one removed and one added', () => {
        const diff = diffSnapshots(
            snap([node('a')], [edge('e1', 'a', 'c')]),
            snap([node('a')], [edge('e1', 'a', 'b')])
        );
        expect(diff.addedEdges).toEqual(['e1']);
        expect(diff.removedEdges).toEqual(['e1']);
        expect(diff.isEmpty).toBe(false);
    });

    it('treats a fresh flow as everything added', () => {
        const diff = diffSnapshots(snap([node('a')]), emptySnapshot());
        expect(diff.addedNodes).toEqual(['a']);
    });
});

describe('hasStructuralChange', () => {
    it('is false for a config-only edit — all an editor may save', () => {
        const diff = diffSnapshots(snap([node('a', { config: { value: 'bye' } })]), snap([node('a')]));
        expect(diff.isEmpty).toBe(false);
        expect(hasStructuralChange(diff)).toBe(false);
    });

    it('is true once a node is added', () => {
        expect(hasStructuralChange(diffSnapshots(snap([node('a'), node('b')]), snap([node('a')])))).toBe(true);
    });

    it('is true once an edge is added', () => {
        const diff = diffSnapshots(snap([node('a')], [edge('e1')]), snap([node('a')]));
        expect(hasStructuralChange(diff)).toBe(true);
    });
});
