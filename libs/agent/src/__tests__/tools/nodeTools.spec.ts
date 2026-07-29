import { describe, expect, it } from 'vitest';

import { createInMemoryCanvasBinding } from '../../canvas/inMemoryCanvasBinding';
import {
    createNodeConfigToolProvider,
    createNodeMoveToolProvider,
    createNodeReadToolProvider,
    listNodeLocations,
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

// ── CONFIG (write: config/label) ──────────────────────────────────────────────────────────────

describe('node config provider — set_properties / rename validation', () => {
    const catalog = createFixtureCatalog();

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

    it("renames and clears the label with ''", async () => {
        const binding = createInMemoryCanvasBinding(makeInitialGraph());
        const config = createNodeConfigToolProvider(binding, catalog);
        await run(config, 'rename', { nodeId: IDS.prev, label: 'Result' });
        expect(nodeById(binding.readGraph(), IDS.prev).customLabel).toBe('Result');
        await run(config, 'rename', { nodeId: IDS.prev, label: '' });
        expect(nodeById(binding.readGraph(), IDS.prev).customLabel).toBeUndefined();
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
