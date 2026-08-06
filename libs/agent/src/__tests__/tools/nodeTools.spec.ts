import { describe, expect, it } from 'vitest';

import { createInMemoryCanvasBinding } from '../../canvas/inMemoryCanvasBinding';
import {
    createNodeConfigToolProvider,
    createNodeMoveToolProvider,
    createNodeReadToolProvider,
    createNodeRenameToolProvider,
    createNodeSearchToolProvider,
    createNodeStructureToolProvider,
    listNodeLocations,
    renderEdgeContext,
} from '../../tools/nodeTools';
import { createFixtureCatalog } from '../harness/fixtures';
import { IDS, makeInitialGraph, nodeById } from '../harness/fixtures';

import type { ToolCall, ToolProvider, ToolResult } from '../../tools/types';
import type { NodeData } from '@lemoncloud/eureka-flows-api';

const call = (name: string, args: unknown): ToolCall => ({ id: `c-${name}`, name, args });
const run = async (provider: ToolProvider, name: string, args: unknown): Promise<ToolResult> =>
    provider.dispatch(call(name, args));

const makeNode = (id: string, x = 0, y = 0, extra: Partial<NodeData> = {}): NodeData => ({
    id,
    type: 'test',
    position: { x, y },
    ...extra,
});

// ── CONFIG (write: config) ────────────────────────────────────────────────────────────────────

describe('node config provider — set_properties validation', () => {
    const catalog = createFixtureCatalog();

    it('exposes ONLY set_properties — no rename (labeling is the builder-only rename provider)', async () => {
        const defs = await createNodeConfigToolProvider(createInMemoryCanvasBinding(), catalog).listTools();
        expect(defs.map(t => t.name)).toEqual(['set_properties']);
        expect(defs[0].requires).toBe('canEditConfig');
    });

    it('applies a valid select value and merges over existing config', async () => {
        const binding = createInMemoryCanvasBinding(makeInitialGraph());
        const config = createNodeConfigToolProvider(binding, catalog);
        const res = await run(config, 'set_properties', { nodeId: IDS.gen, config: { model: 'gemini-2.5-pro' } });
        expect(res.ok).toBe(true);
        expect(nodeById(binding.readGraph(), IDS.gen).config).toEqual({ model: 'gemini-2.5-pro', temperature: '0.7' });
    });

    it('rejects a value outside the select (gpt-4o) — no op recorded', async () => {
        const binding = createInMemoryCanvasBinding(makeInitialGraph());
        const config = createNodeConfigToolProvider(binding, catalog);
        const res = await run(config, 'set_properties', { nodeId: IDS.gen, config: { model: 'gpt-4o' } });
        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.error).toContain('not an allowed option');
        }
        // nothing applied — the model is unchanged
        expect(nodeById(binding.readGraph(), IDS.gen).config).toEqual({
            model: 'gemini-2.5-flash',
            temperature: '0.7',
        });
    });

    it('rejects a wrong-typed value (topK=abc) — no op recorded', async () => {
        const binding = createInMemoryCanvasBinding(makeInitialGraph());
        const config = createNodeConfigToolProvider(binding, catalog);
        const res = await run(config, 'set_properties', { nodeId: IDS.gen, config: { topK: 'abc' } });
        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.error).toContain('not a number');
        }
        // nothing applied — topK never set
        expect(nodeById(binding.readGraph(), IDS.gen).config?.topK).toBeUndefined();
    });

    it('rejects an unknown config key', async () => {
        const binding = createInMemoryCanvasBinding(makeInitialGraph());
        const config = createNodeConfigToolProvider(binding, catalog);
        const res = await run(config, 'set_properties', { nodeId: IDS.gen, config: { nope: 'x' } });
        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.error).toContain('unknown config key');
        }
    });

    it('rejects config on a missing node', async () => {
        const binding = createInMemoryCanvasBinding(makeInitialGraph());
        const config = createNodeConfigToolProvider(binding, catalog);
        const res = await run(config, 'set_properties', { nodeId: 'ghost', config: { model: 'gemini-2.5-pro' } });
        expect(res.ok).toBe(false);
    });
});

// ── RENAME (write: label) — the builder-only labeling provider ───────────────────────────────────

describe('node rename provider — rename', () => {
    it('exposes only rename, gated by canEditConfig', async () => {
        const defs = await createNodeRenameToolProvider(createInMemoryCanvasBinding()).listTools();
        expect(defs.map(t => t.name)).toEqual(['rename']);
        expect(defs[0].requires).toBe('canEditConfig');
    });

    it("sets a node's customLabel and clears it with ''", async () => {
        const binding = createInMemoryCanvasBinding(makeInitialGraph());
        const rename = createNodeRenameToolProvider(binding);
        await run(rename, 'rename', { nodeId: IDS.prev, label: 'Result' });
        expect(nodeById(binding.readGraph(), IDS.prev).customLabel).toBe('Result');
        await run(rename, 'rename', { nodeId: IDS.prev, label: '' });
        expect(nodeById(binding.readGraph(), IDS.prev).customLabel).toBeUndefined();
    });

    it('rejects renaming a missing node and changes nothing', async () => {
        const binding = createInMemoryCanvasBinding(makeInitialGraph());
        const res = await run(createNodeRenameToolProvider(binding), 'rename', { nodeId: 'ghost', label: 'X' });
        expect(res.ok).toBe(false);
        expect(res.ok === false && res.error).toMatch(/no node with id "ghost"/);
    });
});

// ── READ (list_nodes + describe_node) over any CanvasBinding ─────────────────────────────────────

describe('node read provider — list_nodes / describe_node', () => {
    const catalog = createFixtureCatalog();
    const read = () => createNodeReadToolProvider(createInMemoryCanvasBinding(makeInitialGraph()), catalog);

    it('exposes list_nodes + describe_node, neither requiring a capability', async () => {
        const defs = await read().listTools();
        expect(defs.map(t => t.name)).toEqual(['list_nodes', 'describe_node']);
        expect(defs.every(d => d.requires === undefined)).toBe(true);
    });

    it('describe_node returns type + current config + schema', async () => {
        const res = await run(read(), 'describe_node', { nodeId: IDS.gen });
        expect(res.ok).toBe(true);
        if (res.ok) {
            const data = res.data as { type: string; currentConfig: Record<string, string>; schema: { type: string } };
            expect(data.type).toBe('single-output-generator');
            expect(data.currentConfig).toEqual({ model: 'gemini-2.5-flash', temperature: '0.7' });
            expect(data.schema.type).toBe('single-output-generator');
        }
    });

    it('describe_node errors on a missing node', async () => {
        const res = await run(read(), 'describe_node', { nodeId: 'ghost' });
        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.error).toMatch(/no node with id "ghost"/);
        }
    });

    it('list_nodes returns the compact live node list', async () => {
        const res = await run(read(), 'list_nodes', {});
        expect(res.ok).toBe(true);
        if (res.ok) {
            const data = res.data as { nodes: { id: string }[] };
            expect(data.nodes.map(n => n.id)).toEqual([IDS.txt, IDS.buf, IDS.gen, IDS.prev]);
        }
    });
});

// ── SEARCH (search_nodes over the current nodes; optional type scope) ────────────────────────────

describe('node search provider — search_nodes', () => {
    const catalog = createFixtureCatalog();
    const search = (opts?: { type?: string }) =>
        createNodeSearchToolProvider(createInMemoryCanvasBinding(makeInitialGraph()), catalog, opts);
    const idsOf = (res: ToolResult) => (res.ok ? (res.data as { nodes: { id: string }[] }).nodes.map(n => n.id) : []);

    it('unscoped: lists all current nodes when no query is given', async () => {
        const res = await run(search(), 'search_nodes', {});
        expect(idsOf(res).sort()).toEqual([IDS.buf, IDS.gen, IDS.prev, IDS.txt].sort());
    });

    it('matches the query against a node id, label, or block type (case-insensitive)', async () => {
        const binding = createInMemoryCanvasBinding(makeInitialGraph());
        binding.updateNode(IDS.prev, { label: 'Final Result' });
        const provider = createNodeSearchToolProvider(binding, catalog);
        expect(idsOf(await run(provider, 'search_nodes', { query: 'BUFFER' }))).toEqual([IDS.buf]); // by type
        expect(idsOf(await run(provider, 'search_nodes', { query: 'N_GEN' }))).toEqual([IDS.gen]); // by id (case-insensitive)
        expect(idsOf(await run(provider, 'search_nodes', { query: 'final' }))).toEqual([IDS.prev]); // by label (case-insensitive)
    });

    it('scoped by opts.type: only ever returns that block type (structural bound)', async () => {
        const res = await run(search({ type: 'buffer' }), 'search_nodes', {});
        const nodes = res.ok ? (res.data as { nodes: { type: string }[] }).nodes : [];
        expect(nodes.length).toBeGreaterThan(0);
        expect(nodes.every(n => n.type === 'buffer')).toBe(true);
    });
});

// ── MOVE (write: position) over a CanvasBinding ─────────────────────────────────────────────────

describe('node move provider — move_node over a CanvasBinding', () => {
    it('exposes only move_node, gated by canModifyCanvas', async () => {
        const defs = await createNodeMoveToolProvider(createInMemoryCanvasBinding()).listTools();
        expect(defs.map(t => t.name)).toEqual(['move_node']);
        expect(defs[0].requires).toBe('canModifyCanvas');
    });

    it('applies a relative delta through the binding', async () => {
        const binding = createInMemoryCanvasBinding({ nodes: [makeNode('n1', 200, 80)], edges: [] });
        const result = await run(createNodeMoveToolProvider(binding), 'move_node', {
            nodeId: 'n1',
            by: { dx: 10, dy: 0 },
        });
        expect(result.ok).toBe(true);
        expect(result.ok === true && result.data).toEqual({
            nodeId: 'n1',
            label: undefined,
            from: { x: 200, y: 80 },
            to: { x: 210, y: 80 },
        });
        expect(binding.readGraph().nodes[0].position).toEqual({ x: 210, y: 80 });
    });

    it('applies an absolute position', async () => {
        const binding = createInMemoryCanvasBinding({ nodes: [makeNode('n1', 200, 80)], edges: [] });
        await run(createNodeMoveToolProvider(binding), 'move_node', { nodeId: 'n1', to: { x: 100, y: 120 } });
        expect(binding.readGraph().nodes[0].position).toEqual({ x: 100, y: 120 });
    });

    it('errors and changes nothing when the node does not exist', async () => {
        const binding = createInMemoryCanvasBinding({ nodes: [makeNode('n1', 200, 80)], edges: [] });
        const result = await run(createNodeMoveToolProvider(binding), 'move_node', {
            nodeId: 'ghost',
            by: { dx: 10, dy: 0 },
        });
        expect(result.ok).toBe(false);
        expect(result.ok === false && result.error).toMatch(/no node with id "ghost"/);
        expect(binding.readGraph().nodes[0].position).toEqual({ x: 200, y: 80 });
    });

    it('rejects a non-finite result and changes nothing', async () => {
        const binding = createInMemoryCanvasBinding({ nodes: [makeNode('n1', 10, 10)], edges: [] });
        const provider = createNodeMoveToolProvider(binding);
        const relInfinity = await run(provider, 'move_node', { nodeId: 'n1', by: { dx: Infinity, dy: 0 } });
        expect(relInfinity.ok === false && relInfinity.error).toMatch(/finite/);
        const absInfinity = await run(provider, 'move_node', { nodeId: 'n1', to: { x: Infinity, y: 0 } });
        expect(absInfinity.ok === false && absInfinity.error).toMatch(/finite/);
        expect(binding.readGraph().nodes[0].position).toEqual({ x: 10, y: 10 });
    });

    it('rejects neither/both of by and to', async () => {
        const binding = createInMemoryCanvasBinding({ nodes: [makeNode('n1', 0, 0)], edges: [] });
        const provider = createNodeMoveToolProvider(binding);
        const neither = await run(provider, 'move_node', { nodeId: 'n1' });
        expect(neither.ok === false && neither.error).toMatch(/exactly one/);
        const both = await run(provider, 'move_node', { nodeId: 'n1', by: { dx: 1, dy: 1 }, to: { x: 1, y: 1 } });
        expect(both.ok === false && both.error).toMatch(/exactly one/);
        expect(binding.readGraph().nodes[0].position).toEqual({ x: 0, y: 0 });
    });
});

// ── STRUCTURE (write: add/delete node) over a CanvasBinding ─────────────────────────────────────

describe('node structure provider — add_node / delete_node', () => {
    const catalog = createFixtureCatalog();

    it('exposes add_node + delete_node, both gated by canModifyCanvas', async () => {
        const defs = await createNodeStructureToolProvider(createInMemoryCanvasBinding(), catalog).listTools();
        expect(defs.map(t => t.name)).toEqual(['add_node', 'delete_node']);
        expect(defs.every(d => d.requires === 'canModifyCanvas')).toBe(true);
    });

    it('adds a node of the given type at the position and returns its new id + default label', async () => {
        const binding = createInMemoryCanvasBinding(makeInitialGraph());
        const structure = createNodeStructureToolProvider(binding, catalog);
        const res = await run(structure, 'add_node', { type: 'buffer', position: { x: 900, y: 120 } });
        expect(res.ok).toBe(true);
        if (res.ok) {
            const { nodeId, label } = res.data as { nodeId: string; label: string };
            const added = nodeById(binding.readGraph(), nodeId);
            expect(added.type).toBe('buffer');
            expect(added.position).toEqual({ x: 900, y: 120 });
            // the result carries the block's default (catalog) label, so the builder knows what the node is called
            expect(label).toBe('Buffer'); // the fixture catalog's label for the `buffer` type
        }
        expect(binding.readGraph().nodes).toHaveLength(5);
    });

    it('adds a node with initial config in ONE call (merged over defaults)', async () => {
        const binding = createInMemoryCanvasBinding(makeInitialGraph());
        const structure = createNodeStructureToolProvider(binding, catalog);
        const res = await run(structure, 'add_node', {
            type: 'single-output-generator',
            position: { x: 0, y: 0 },
            config: { model: 'gemini-2.5-pro' },
        });
        expect(res.ok).toBe(true);
        if (res.ok) {
            const { nodeId } = res.data as { nodeId: string };
            expect(nodeById(binding.readGraph(), nodeId).config?.model).toBe('gemini-2.5-pro');
        }
        expect(binding.readGraph().nodes).toHaveLength(5);
    });

    it('treats an empty config object like a defaults-only add (no config in the result)', async () => {
        const binding = createInMemoryCanvasBinding(makeInitialGraph());
        const structure = createNodeStructureToolProvider(binding, catalog);
        const res = await run(structure, 'add_node', { type: 'output-preview', position: { x: 0, y: 0 }, config: {} });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.data).not.toHaveProperty('config'); // empty config short-circuits to the defaults-only path
        }
        expect(binding.readGraph().nodes).toHaveLength(5);
    });

    it('rejects invalid initial config and adds NOTHING (atomic)', async () => {
        const binding = createInMemoryCanvasBinding(makeInitialGraph());
        const structure = createNodeStructureToolProvider(binding, catalog);
        const res = await run(structure, 'add_node', {
            type: 'single-output-generator',
            position: { x: 0, y: 0 },
            config: { model: 'gpt-4o' },
        });
        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.error).toContain('not an allowed option');
        }
        expect(binding.readGraph().nodes).toHaveLength(4); // nothing added
    });

    it('rejects an unknown block type and adds nothing', async () => {
        const binding = createInMemoryCanvasBinding(makeInitialGraph());
        const structure = createNodeStructureToolProvider(binding, catalog);
        const res = await run(structure, 'add_node', { type: 'not-a-real-block', position: { x: 0, y: 0 } });
        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.error).toContain('unknown block type');
        }
        expect(binding.readGraph().nodes).toHaveLength(4);
    });

    it('deletes a node and cascades every edge that touches it', async () => {
        const binding = createInMemoryCanvasBinding(makeInitialGraph());
        const structure = createNodeStructureToolProvider(binding, catalog);
        const res = await run(structure, 'delete_node', { nodeId: IDS.buf });
        expect(res.ok).toBe(true);
        if (res.ok) {
            // txt→buf and buf→gen both referenced the buffer and are reported as dropped (by id).
            expect((res.data as { droppedEdges: string[] }).droppedEdges.sort()).toEqual(['e_buf_gen', 'e_txt_buf']);
        }
        const graph = binding.readGraph();
        expect(graph.nodes.find(n => n.id === IDS.buf)).toBeUndefined();
        expect(graph.edges.some(e => e.sourceNodeId === IDS.buf || e.targetNodeId === IDS.buf)).toBe(false);
        // the untouched edge (gen→prev) survives
        expect(graph.edges).toHaveLength(1);
    });

    it('rejects deleting a missing node and changes nothing', async () => {
        const binding = createInMemoryCanvasBinding(makeInitialGraph());
        const structure = createNodeStructureToolProvider(binding, catalog);
        const res = await run(structure, 'delete_node', { nodeId: 'ghost' });
        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.error).toMatch(/no node with id "ghost"/);
        }
        expect(binding.readGraph().nodes).toHaveLength(4);
        expect(binding.readGraph().edges).toHaveLength(3);
    });
});

// ── Projection ──────────────────────────────────────────────────────────────────────────────────

describe('listNodeLocations', () => {
    it('projects nodes to id/type/label/position', () => {
        const binding = createInMemoryCanvasBinding({
            nodes: [makeNode('a', 1, 2, { type: 'http', customLabel: 'Fetch' })],
            edges: [],
        });
        expect(listNodeLocations(binding)).toEqual([
            { id: 'a', type: 'http', label: 'Fetch', position: { x: 1, y: 2 } },
        ]);
    });

    it('skips nodes without an id', () => {
        const binding = createInMemoryCanvasBinding({
            nodes: [makeNode('a'), { type: 't', position: { x: 0, y: 0 } } as NodeData],
            edges: [],
        });
        expect(listNodeLocations(binding).map(n => n.id)).toEqual(['a']);
    });
});

describe('renderEdgeContext', () => {
    it('renders one line per edge (id · source:port → target:port)', () => {
        const binding = createInMemoryCanvasBinding({
            nodes: [makeNode('a'), makeNode('b'), makeNode('c')],
            edges: [
                { id: 'e1', sourceNodeId: 'a', sourcePortId: 'out', targetNodeId: 'b', targetPortId: 'in' },
                { id: 'e2', sourceNodeId: 'b', sourcePortId: 'out', targetNodeId: 'c', targetPortId: 'in' },
            ],
        });
        expect(renderEdgeContext(binding)).toBe(
            'Current edges (source → target):\n- id="e1" a:out → b:in\n- id="e2" b:out → c:in'
        );
    });

    it('reports no edges when the graph has none — the fact occupancy is read from', () => {
        const binding = createInMemoryCanvasBinding({ nodes: [makeNode('a')], edges: [] });
        expect(renderEdgeContext(binding)).toBe('No edges on the canvas yet.');
    });
});
