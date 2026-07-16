import { describe, expect, it } from 'vitest';

import { createCanvasToolProvider, listNodeLocations } from '../../canvas/canvasTools';
import { createInMemoryCanvasBinding } from '../../canvas/inMemoryCanvasBinding';
import { createToolExecutor } from '../../tools/toolExecutor';

import type { AgentConfig } from '../../agent';
import type { ToolCall } from '../../tools/toolTypes';
import type { NodeData } from '@lemoncloud/eureka-flows-api';

const makeNode = (id: string, x = 0, y = 0, extra: Partial<NodeData> = {}): NodeData => ({
    id,
    type: 'test',
    position: { x, y },
    ...extra,
});

const call = (name: string, args: unknown): ToolCall => ({ id: 'c1', name, args });

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

describe('createCanvasToolProvider', () => {
    it('exposes list_nodes (read) and move_node (mutate), with the capability on the mutate tool only', async () => {
        const defs = await createCanvasToolProvider(createInMemoryCanvasBinding()).listTools();
        expect(defs.map(t => t.name)).toEqual(['list_nodes', 'move_node']);
        const requiresByName = Object.fromEntries(defs.map(d => [d.name, d.requires]));
        expect(requiresByName.list_nodes).toBeUndefined(); // a read — no capability
        expect(requiresByName.move_node).toBe('canModifyCanvas'); // a mutate
    });

    it('list_nodes returns the current node locations', async () => {
        const binding = createInMemoryCanvasBinding({ nodes: [makeNode('n1', 5, 6)], edges: [] });
        const result = await createCanvasToolProvider(binding).dispatch(call('list_nodes', {}));
        expect(result.ok === true && result.data).toEqual({
            nodes: [{ id: 'n1', type: 'test', label: undefined, position: { x: 5, y: 6 } }],
        });
    });

    it('move_node applies a relative delta through the binding', async () => {
        const binding = createInMemoryCanvasBinding({ nodes: [makeNode('n1', 200, 80)], edges: [] });
        const result = await createCanvasToolProvider(binding).dispatch(
            call('move_node', { nodeId: 'n1', by: { dx: 10, dy: 0 } })
        );

        expect(result.ok).toBe(true);
        expect(result.ok === true && result.data).toEqual({
            nodeId: 'n1',
            label: undefined,
            from: { x: 200, y: 80 },
            to: { x: 210, y: 80 },
        });
        expect(binding.readGraph().nodes[0].position).toEqual({ x: 210, y: 80 });
    });

    it('move_node applies an absolute position', async () => {
        const binding = createInMemoryCanvasBinding({ nodes: [makeNode('n1', 200, 80)], edges: [] });
        await createCanvasToolProvider(binding).dispatch(call('move_node', { nodeId: 'n1', to: { x: 100, y: 120 } }));
        expect(binding.readGraph().nodes[0].position).toEqual({ x: 100, y: 120 });
    });

    it('move_node errors and changes nothing when the node does not exist', async () => {
        const binding = createInMemoryCanvasBinding({ nodes: [makeNode('n1', 200, 80)], edges: [] });
        const result = await createCanvasToolProvider(binding).dispatch(
            call('move_node', { nodeId: 'ghost', by: { dx: 10, dy: 0 } })
        );

        expect(result.ok).toBe(false);
        expect(result.ok === false && result.error).toMatch(/no node with id "ghost"/);
        expect(binding.readGraph().nodes[0].position).toEqual({ x: 200, y: 80 });
    });

    it('move_node rejects a non-finite result and changes nothing', async () => {
        const binding = createInMemoryCanvasBinding({ nodes: [makeNode('n1', 10, 10)], edges: [] });
        const provider = createCanvasToolProvider(binding);

        const relInfinity = await provider.dispatch(call('move_node', { nodeId: 'n1', by: { dx: Infinity, dy: 0 } }));
        expect(relInfinity.ok === false && relInfinity.error).toMatch(/finite/);

        const absInfinity = await provider.dispatch(call('move_node', { nodeId: 'n1', to: { x: Infinity, y: 0 } }));
        expect(absInfinity.ok === false && absInfinity.error).toMatch(/finite/);

        expect(binding.readGraph().nodes[0].position).toEqual({ x: 10, y: 10 });
    });

    it('move_node rejects neither/both of by and to', async () => {
        const binding = createInMemoryCanvasBinding({ nodes: [makeNode('n1', 0, 0)], edges: [] });
        const provider = createCanvasToolProvider(binding);

        const neither = await provider.dispatch(call('move_node', { nodeId: 'n1' }));
        expect(neither.ok === false && neither.error).toMatch(/exactly one/);

        const both = await provider.dispatch(
            call('move_node', { nodeId: 'n1', by: { dx: 1, dy: 1 }, to: { x: 1, y: 1 } })
        );
        expect(both.ok === false && both.error).toMatch(/exactly one/);
        expect(binding.readGraph().nodes[0].position).toEqual({ x: 0, y: 0 });
    });
});

// Permission is per-tool (via each ToolDef's `requires`), enforced by the executor — not by
// which provider a tool sits in. One canvas provider therefore serves agents of different
// capability: the grant decides what each may actually call.
describe('permission enforcement (via the executor)', () => {
    const exec = createToolExecutor();
    const baseCfg = { id: 'x', description: '', systemPrompt: '' };

    it('offers both tools but the grant gates the mutate one', async () => {
        const binding = createInMemoryCanvasBinding({ nodes: [makeNode('n1', 0, 0)], edges: [] });
        const readOnly: AgentConfig = { ...baseCfg, grant: {}, tools: [createCanvasToolProvider(binding)] };

        // list_nodes needs no capability → allowed even with an empty grant.
        const list = await exec.dispatch(readOnly, call('list_nodes', {}));
        expect(list.ok).toBe(true);

        // move_node requires canModifyCanvas → denied; nothing moves.
        const move = await exec.dispatch(readOnly, call('move_node', { nodeId: 'n1', by: { dx: 5, dy: 0 } }));
        expect(move.ok).toBe(false);
        expect(move.ok === false && move.error).toMatch(/permission denied/);
        expect(binding.readGraph().nodes[0].position).toEqual({ x: 0, y: 0 });
    });

    it('applies move_node once canModifyCanvas is granted', async () => {
        const binding = createInMemoryCanvasBinding({ nodes: [makeNode('n1', 0, 0)], edges: [] });
        const editor: AgentConfig = {
            ...baseCfg,
            grant: { canModifyCanvas: true },
            tools: [createCanvasToolProvider(binding)],
        };
        expect((await exec.listTools(editor)).map(t => t.name)).toEqual(['list_nodes', 'move_node']);
        const move = await exec.dispatch(editor, call('move_node', { nodeId: 'n1', to: { x: 9, y: 9 } }));
        expect(move.ok).toBe(true);
        expect(binding.readGraph().nodes[0].position).toEqual({ x: 9, y: 9 });
    });
});
