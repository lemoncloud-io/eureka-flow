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

/**
 * A bespoke catalog with typed ports + a two-input block (the shared fixture is single-input, text/untyped
 * only, so cross-type and multi-input cases are unexpressible there). `image` is a real shipped port type, so
 * text→image is a realistic incompatible pair — no synthetic `number` input (no shipped block exposes one).
 */
const catalog: CatalogLookup = createCatalogLookup([
    block('text-src', [], [{ portId: 'out', type: 'text' }]),
    block('text-sink', [{ portId: 'in', type: 'text' }], []),
    block('img-sink', [{ portId: 'in', type: 'image' }], []), // real cross-type: a text output can't feed it
    block('pass', [{ portId: 'in' }], [{ portId: 'out' }]), // untyped ports → any-compatible
    block('combine', [{ portId: 'a' }, { portId: 'b' }], [{ portId: 'out' }]), // TWO input ports
]);

/** Nodes: a=text-src, b=text-sink, c=img-sink, d/e=pass, m=combine (two inputs a,b). No edges unless a test adds them. */
const makeGraph = (edges: Graph['edges'] = []): Graph => ({
    nodes: [
        { id: 'a', type: 'text-src', position: { x: 0, y: 0 } },
        { id: 'b', type: 'text-sink', position: { x: 100, y: 0 } },
        { id: 'c', type: 'img-sink', position: { x: 200, y: 0 } },
        { id: 'd', type: 'pass', position: { x: 300, y: 0 } },
        { id: 'e', type: 'pass', position: { x: 400, y: 0 } },
        { id: 'm', type: 'combine', position: { x: 500, y: 0 } },
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

    it('rejects incompatible port types and adds nothing (text → image)', async () => {
        const binding = createInMemoryCanvasBinding(makeGraph());
        const res = await run(createEdgeToolProvider(binding, catalog), 'connect_nodes', {
            sourceNodeId: 'a', // text-src.out (text)
            sourcePortId: 'out',
            targetNodeId: 'c', // img-sink.in (image)
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

    it('rejects a connect to an occupied input port, names the occupying edge, and leaves it intact', async () => {
        const binding = createInMemoryCanvasBinding(makeGraph());
        const edge = createEdgeToolProvider(binding, catalog);
        // First: d(pass).out → b.in occupies b's single input.
        const first = await run(edge, 'connect_nodes', {
            sourceNodeId: 'd',
            sourcePortId: 'out',
            targetNodeId: 'b',
            targetPortId: 'in',
        });
        const firstId = first.ok ? (first.data as { edgeId: string }).edgeId : '';
        // Then: a(text-src).out → b.in is REJECTED (b.in occupied) and names the occupying edge + its source.
        const res = await run(edge, 'connect_nodes', {
            sourceNodeId: 'a',
            sourcePortId: 'out',
            targetNodeId: 'b',
            targetPortId: 'in',
        });
        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.error).toContain('already connected');
            expect(res.error).toContain(firstId); // the occupying edge id, so the orchestrator can disconnect it
            expect(res.error).toContain('d:out'); // and where it comes from
        }
        // The original edge survives; no replacement, no second edge.
        const into = binding.readGraph().edges.filter(e => e.targetNodeId === 'b' && e.targetPortId === 'in');
        expect(into).toHaveLength(1);
        expect(into[0].id).toBe(firstId);
        expect(into[0].sourceNodeId).toBe('d'); // still the ORIGINAL source — not replaced by 'a'
    });

    it('treats input ports independently — a sibling input port accepts an edge and only the same port rejects', async () => {
        const binding = createInMemoryCanvasBinding(makeGraph());
        const edge = createEdgeToolProvider(binding, catalog);
        // m(combine) has two input ports: a, b. Wire d.out → m.a, then e.out → m.b.
        await run(edge, 'connect_nodes', {
            sourceNodeId: 'd',
            sourcePortId: 'out',
            targetNodeId: 'm',
            targetPortId: 'a',
        });
        const second = await run(edge, 'connect_nodes', {
            sourceNodeId: 'e',
            sourcePortId: 'out',
            targetNodeId: 'm',
            targetPortId: 'b',
        });
        expect(second.ok).toBe(true); // the second input port is free — NOT a replacement of port 'a'
        const into = binding.readGraph().edges.filter(e => e.targetNodeId === 'm');
        expect(into).toHaveLength(2); // two edges into ONE node, on different ports
        expect(into.map(e => e.targetPortId).sort()).toEqual(['a', 'b']);
        // Reconnecting to the OCCUPIED port 'a' rejects; port 'b' is untouched.
        const clash = await run(edge, 'connect_nodes', {
            sourceNodeId: 'e',
            sourcePortId: 'out',
            targetNodeId: 'm',
            targetPortId: 'a',
        });
        expect(clash.ok).toBe(false);
        expect(binding.readGraph().edges.filter(e => e.targetNodeId === 'm')).toHaveLength(2);
    });

    it('allows an output port to fan out — one source output feeds several targets (only INPUTS are limited)', async () => {
        const binding = createInMemoryCanvasBinding(makeGraph());
        const edge = createEdgeToolProvider(binding, catalog);
        // a(text-src).out → b(text-sink).in, then the SAME output port a.out → m(combine).a.
        const first = await run(edge, 'connect_nodes', {
            sourceNodeId: 'a',
            sourcePortId: 'out',
            targetNodeId: 'b',
            targetPortId: 'in',
        });
        const second = await run(edge, 'connect_nodes', {
            sourceNodeId: 'a',
            sourcePortId: 'out',
            targetNodeId: 'm',
            targetPortId: 'a',
        });
        expect(first.ok).toBe(true);
        expect(second.ok).toBe(true); // an output port is NOT consumed by its first edge — fan-out is allowed
        const fromA = binding.readGraph().edges.filter(e => e.sourceNodeId === 'a' && e.sourcePortId === 'out');
        expect(fromA).toHaveLength(2); // two edges leave the SAME output port, to different targets
        expect(fromA.map(e => e.targetNodeId).sort()).toEqual(['b', 'm']);
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
        expect(binding.readGraph().nodes).toHaveLength(6);
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
