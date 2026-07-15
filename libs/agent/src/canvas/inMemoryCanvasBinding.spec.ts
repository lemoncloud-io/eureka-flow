import { describe, expect, it } from 'vitest';

import { createInMemoryCanvasBinding } from './inMemoryCanvasBinding';

import type { NodeData } from '@lemoncloud/eureka-flows-api';

const makeNode = (id: string, x = 0, y = 0, extra: Partial<NodeData> = {}): NodeData => ({
    id,
    type: 'test',
    position: { x, y },
    ...extra,
});

describe('createInMemoryCanvasBinding', () => {
    it('reads back the initial graph', () => {
        const binding = createInMemoryCanvasBinding({ nodes: [makeNode('a', 1, 2)], edges: [] });
        expect(binding.readGraph().nodes).toHaveLength(1);
        expect(binding.readGraph().nodes[0].position).toEqual({ x: 1, y: 2 });
    });

    it('defaults to an empty graph', () => {
        const binding = createInMemoryCanvasBinding();
        expect(binding.readGraph()).toEqual({ nodes: [], edges: [] });
    });

    it('updates one node position and leaves the rest untouched', () => {
        const binding = createInMemoryCanvasBinding({
            nodes: [makeNode('a', 0, 0), makeNode('b', 100, 100)],
            edges: [],
        });
        binding.updateNode('a', { position: { x: 10, y: 20 } });

        const nodes = binding.readGraph().nodes;
        expect(nodes.find(n => n.id === 'a')?.position).toEqual({ x: 10, y: 20 });
        expect(nodes.find(n => n.id === 'b')?.position).toEqual({ x: 100, y: 100 });
    });

    it('replaces position wholesale (never a partial axis)', () => {
        const binding = createInMemoryCanvasBinding({ nodes: [makeNode('a', 5, 5)], edges: [] });
        binding.updateNode('a', { position: { x: 9, y: 9 } });
        expect(binding.readGraph().nodes[0].position).toEqual({ x: 9, y: 9 });
    });

    it('sets and clears customLabel via label', () => {
        const binding = createInMemoryCanvasBinding({ nodes: [makeNode('a')], edges: [] });
        binding.updateNode('a', { label: 'Fetch' });
        expect(binding.readGraph().nodes[0].customLabel).toBe('Fetch');
        binding.updateNode('a', { label: '' });
        expect(binding.readGraph().nodes[0].customLabel).toBeUndefined();
    });

    it('is a no-op for an unknown id', () => {
        const binding = createInMemoryCanvasBinding({ nodes: [makeNode('a', 1, 1)], edges: [] });
        binding.updateNode('missing', { position: { x: 9, y: 9 } });
        expect(binding.readGraph().nodes[0].position).toEqual({ x: 1, y: 1 });
    });

    it('swapFlow replaces the whole graph', () => {
        const binding = createInMemoryCanvasBinding({ nodes: [makeNode('a')], edges: [] });
        binding.swapFlow({ nodes: [makeNode('x', 7, 7)], edges: [] });
        expect(binding.readGraph().nodes.map(n => n.id)).toEqual(['x']);
    });

    it('readGraph returns a fresh array wrapper — mutating it does not corrupt the store', () => {
        const binding = createInMemoryCanvasBinding({ nodes: [makeNode('a')], edges: [] });
        binding.readGraph().nodes.push(makeNode('injected'));
        binding.readGraph().edges.push({ sourceNodeId: 'a', sourcePortId: 'o', targetNodeId: 'a', targetPortId: 'i' });
        expect(binding.readGraph().nodes.map(n => n.id)).toEqual(['a']);
        expect(binding.readGraph().edges).toHaveLength(0);
    });
});
