import { describe, expect, it } from 'vitest';

import { createInMemoryCanvasBinding } from '../../canvas/inMemoryCanvasBinding';
import { createCatalogLookup } from '../../catalog';
import { createEdgeToolProvider } from '../../tools/edgeTools';

import type { Graph } from '../../canvas/canvasBinding';
import type { BlockSchema, CatalogLookup } from '../../catalog';
import type { ToolCall, ToolProvider, ToolResult } from '../../tools/types';

const call = (name: string, args: unknown): ToolCall => ({ id: `c-${name}`, name, args });
const run = async (provider: ToolProvider, name: string, args: unknown): Promise<ToolResult> =>
    provider.dispatch(call(name, args));

const block = (type: string, inputs: BlockSchema['inputs'], outputs: BlockSchema['outputs']): BlockSchema => ({
    type,
    label: type,
    config: { type: 'object', properties: {} },
    inputs,
    outputs,
});

/** A bespoke catalog with typed ports (the shared fixture is text/untyped only, so incompatible-type is unexpressible there). */
const catalog: CatalogLookup = createCatalogLookup([
    block('text-src', [], [{ portId: 'out', type: 'text' }]),
    block('text-sink', [{ portId: 'in', type: 'text' }], []),
    block('num-sink', [{ portId: 'in', type: 'number' }], []),
    block('pass', [{ portId: 'in' }], [{ portId: 'out' }]), // untyped ports → any-compatible
]);

/** Nodes: a=text-src, b=text-sink, c=num-sink, d/e=pass. No edges unless a test adds them. */
const makeGraph = (edges: Graph['edges'] = []): Graph => ({
    nodes: [
        { id: 'a', type: 'text-src', position: { x: 0, y: 0 } },
        { id: 'b', type: 'text-sink', position: { x: 100, y: 0 } },
        { id: 'c', type: 'num-sink', position: { x: 200, y: 0 } },
        { id: 'd', type: 'pass', position: { x: 300, y: 0 } },
        { id: 'e', type: 'pass', position: { x: 400, y: 0 } },
    ],
    edges,
});

describe('edge provider — tool surface', () => {
    it('exposes list_edges (read) + connect_nodes/disconnect_edge (canModifyCanvas)', async () => {
        const defs = await createEdgeToolProvider(createInMemoryCanvasBinding(), catalog).listTools();
        expect(defs.map(t => t.name)).toEqual(['list_edges', 'connect_nodes', 'disconnect_edge']);
        expect(defs.find(d => d.name === 'list_edges')?.requires).toBeUndefined();
        expect(defs.find(d => d.name === 'connect_nodes')?.requires).toBe('canModifyCanvas');
        expect(defs.find(d => d.name === 'disconnect_edge')?.requires).toBe('canModifyCanvas');
    });
});

describe('edge provider — connect_nodes', () => {
    it('connects compatible ports, adds exactly one edge, and returns its id', async () => {
        const binding = createInMemoryCanvasBinding(makeGraph());
        const edge = createEdgeToolProvider(binding, catalog);
        const res = await run(edge, 'connect_nodes', {
            sourceNodeId: 'a',
            sourcePortId: 'out',
            targetNodeId: 'b',
            targetPortId: 'in',
        });
        expect(res.ok).toBe(true);
        const edges = binding.readGraph().edges;
        expect(edges).toHaveLength(1);
        if (res.ok) {
            expect((res.data as { edgeId: string }).edgeId).toBe(edges[0].id);
        }
    });

    it('rejects incompatible port types and adds nothing (text → number)', async () => {
        const binding = createInMemoryCanvasBinding(makeGraph());
        const res = await run(createEdgeToolProvider(binding, catalog), 'connect_nodes', {
            sourceNodeId: 'a',
            sourcePortId: 'out',
            targetNodeId: 'c',
            targetPortId: 'in',
        });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error).toContain('incompatible port types');
        expect(binding.readGraph().edges).toHaveLength(0);
    });

    it('rejects a self-loop as a cycle', async () => {
        const binding = createInMemoryCanvasBinding(makeGraph());
        const res = await run(createEdgeToolProvider(binding, catalog), 'connect_nodes', {
            sourceNodeId: 'd',
            sourcePortId: 'out',
            targetNodeId: 'd',
            targetPortId: 'in',
        });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error).toContain('cycle');
        expect(binding.readGraph().edges).toHaveLength(0);
    });

    it('rejects a connection that would close a longer cycle', async () => {
        // d → e exists; connecting e → d would cycle.
        const binding = createInMemoryCanvasBinding(
            makeGraph([{ id: 'seed', sourceNodeId: 'd', sourcePortId: 'out', targetNodeId: 'e', targetPortId: 'in' }])
        );
        const res = await run(createEdgeToolProvider(binding, catalog), 'connect_nodes', {
            sourceNodeId: 'e',
            sourcePortId: 'out',
            targetNodeId: 'd',
            targetPortId: 'in',
        });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error).toContain('cycle');
        expect(binding.readGraph().edges).toHaveLength(1); // only the seed remains
    });

    it('rejects an unknown source output port and names the real ports', async () => {
        const binding = createInMemoryCanvasBinding(makeGraph());
        const res = await run(createEdgeToolProvider(binding, catalog), 'connect_nodes', {
            sourceNodeId: 'a',
            sourcePortId: 'nope',
            targetNodeId: 'b',
            targetPortId: 'in',
        });
        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.error).toContain('no output port "nope"');
            expect(res.error).toContain('out'); // names what the block exposes
        }
        expect(binding.readGraph().edges).toHaveLength(0);
    });

    it('rejects an unknown target input port', async () => {
        const binding = createInMemoryCanvasBinding(makeGraph());
        const res = await run(createEdgeToolProvider(binding, catalog), 'connect_nodes', {
            sourceNodeId: 'a',
            sourcePortId: 'out',
            targetNodeId: 'b',
            targetPortId: 'nope',
        });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error).toContain('no input port "nope"');
        expect(binding.readGraph().edges).toHaveLength(0); // rejected → graph untouched
    });

    it('rejects an unknown node', async () => {
        const binding = createInMemoryCanvasBinding(makeGraph());
        const res = await run(createEdgeToolProvider(binding, catalog), 'connect_nodes', {
            sourceNodeId: 'ghost',
            sourcePortId: 'out',
            targetNodeId: 'b',
            targetPortId: 'in',
        });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error).toMatch(/no node with id "ghost"/);
        expect(binding.readGraph().edges).toHaveLength(0); // rejected → graph untouched
    });

    it('replaces an existing edge on an occupied input port (one edge in, not two)', async () => {
        const binding = createInMemoryCanvasBinding(makeGraph());
        const edge = createEdgeToolProvider(binding, catalog);
        // First: d(pass).out → b.in ; then a(text-src).out → b.in should REPLACE it.
        await run(edge, 'connect_nodes', {
            sourceNodeId: 'd',
            sourcePortId: 'out',
            targetNodeId: 'b',
            targetPortId: 'in',
        });
        await run(edge, 'connect_nodes', {
            sourceNodeId: 'a',
            sourcePortId: 'out',
            targetNodeId: 'b',
            targetPortId: 'in',
        });
        const into = binding.readGraph().edges.filter(e => e.targetNodeId === 'b' && e.targetPortId === 'in');
        expect(into).toHaveLength(1);
        expect(into[0].sourceNodeId).toBe('a');
    });
});

describe('edge provider — disconnect_edge + list_edges', () => {
    it('lists edges with their ids and endpoints', async () => {
        const binding = createInMemoryCanvasBinding(
            makeGraph([{ id: 'x', sourceNodeId: 'a', sourcePortId: 'out', targetNodeId: 'b', targetPortId: 'in' }])
        );
        const res = await run(createEdgeToolProvider(binding, catalog), 'list_edges', {});
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.data).toEqual({
                edges: [{ edgeId: 'x', sourceNodeId: 'a', sourcePortId: 'out', targetNodeId: 'b', targetPortId: 'in' }],
            });
        }
    });

    it('disconnects exactly the named edge and leaves nodes in place', async () => {
        const binding = createInMemoryCanvasBinding(
            makeGraph([{ id: 'x', sourceNodeId: 'a', sourcePortId: 'out', targetNodeId: 'b', targetPortId: 'in' }])
        );
        const res = await run(createEdgeToolProvider(binding, catalog), 'disconnect_edge', { edgeId: 'x' });
        expect(res.ok).toBe(true);
        expect(binding.readGraph().edges).toHaveLength(0);
        expect(binding.readGraph().nodes).toHaveLength(5);
    });

    it('rejects disconnecting an unknown edge and leaves existing edges intact', async () => {
        // Seed a real edge so the reject proves collateral safety (invariant #2), not a vacuous 0→0.
        const binding = createInMemoryCanvasBinding(
            makeGraph([{ id: 'x', sourceNodeId: 'a', sourcePortId: 'out', targetNodeId: 'b', targetPortId: 'in' }])
        );
        const res = await run(createEdgeToolProvider(binding, catalog), 'disconnect_edge', { edgeId: 'ghost' });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error).toMatch(/no edge with id "ghost"/);
        expect(binding.readGraph().edges.map(e => e.id)).toEqual(['x']); // the real edge survived
    });
});
