/**
 * Edge agent-level scenarios (no orchestrator): drive the edge agent directly with a concrete task over a
 * fake gateway and assert the live graph — its definition of done (docs/browser-agent/agents/edge.md).
 * A bespoke typed graph is used (the shared fixture is fully-wired + text/untyped only).
 */
import { describe, expect, it } from 'vitest';

import { createEdgeAgent } from '../../../agents/edgeAgent';
import { createInMemoryCanvasBinding } from '../../../canvas/inMemoryCanvasBinding';
import { createCatalogLookup } from '../../../catalog';
import { createFakeGateway } from '../../../llm/fakeGateway';
import { createInMemorySessionStore } from '../../../session/session';

import type { Graph } from '../../../canvas/canvasBinding';
import type { BlockSchema } from '../../../catalog';
import type { FakeScriptStep } from '../../../llm/fakeGateway';
import type { SessionState, SessionStore } from '../../../session/session';

const block = (type: string, inputs: BlockSchema['inputs'], outputs: BlockSchema['outputs']): BlockSchema => ({
    type,
    label: type,
    config: { type: 'object', properties: {} },
    inputs,
    outputs,
});

const catalog = createCatalogLookup([
    block('text-src', [], [{ portId: 'out', type: 'text' }]),
    block('text-sink', [{ portId: 'in', type: 'text' }], []),
    block('img-sink', [{ portId: 'in', type: 'image' }], []), // real cross-type: a text output can't feed it
]);

const makeGraph = (edges: Graph['edges'] = []): Graph => ({
    nodes: [
        { id: 'a', type: 'text-src', position: { x: 0, y: 0 } },
        { id: 'b', type: 'text-sink', position: { x: 100, y: 0 } },
        { id: 'c', type: 'img-sink', position: { x: 200, y: 0 } },
        { id: 'd', type: 'text-src', position: { x: 300, y: 0 } }, // a second source, to occupy an input
    ],
    edges,
});

const setup = (script: FakeScriptStep[], graph: Graph = makeGraph()) => {
    const binding = createInMemoryCanvasBinding(graph);
    const gateway = createFakeGateway(script);
    const storage: SessionStore = createInMemorySessionStore();
    const flowId = 'flow-1';
    const agent = createEdgeAgent({
        gateway,
        binding,
        catalog,
        storage,
        flowId,
        userPermissions: { canModifyCanvas: true, canEditConfig: true },
    });
    const state = (): SessionState => storage.load(flowId) as SessionState;
    const toolMsg = () => state().messages.find(m => m.role === 'tool');
    return { binding, gateway, agent, state, toolMsg };
};

describe('edge agent — connect_nodes', () => {
    it('connects two compatible ports (adds one edge)', async () => {
        const { agent, binding } = setup([
            {
                toolCalls: [
                    {
                        name: 'connect_nodes',
                        args: { sourceNodeId: 'a', sourcePortId: 'out', targetNodeId: 'b', targetPortId: 'in' },
                    },
                ],
            },
            { text: 'Connected the source to the sink.' },
        ]);

        await agent.send('connect a to b');

        const edges = binding.readGraph().edges;
        expect(edges).toHaveLength(1);
        // prove the edge landed on the RIGHT endpoints/ports, not just that *an* edge appeared
        expect(edges[0]).toMatchObject({
            sourceNodeId: 'a',
            sourcePortId: 'out',
            targetNodeId: 'b',
            targetPortId: 'in',
        });
    });

    it('reports a rejected connection and does NOT reroute to another port (incompatible types)', async () => {
        const { agent, binding, toolMsg } = setup([
            {
                toolCalls: [
                    {
                        name: 'connect_nodes',
                        args: { sourceNodeId: 'a', sourcePortId: 'out', targetNodeId: 'c', targetPortId: 'in' },
                    },
                ],
            },
            { text: "text output can't feed an image input; I did not reroute." },
        ]);

        await agent.send('connect a to c');

        expect(binding.readGraph().edges).toHaveLength(0);
        expect(toolMsg()?.content).toMatch(/incompatible port types/);
    });
});

describe('edge agent — disconnect_edge', () => {
    it('finds an edge via list_edges and disconnects it', async () => {
        const { agent, binding } = setup(
            [
                { toolCalls: [{ name: 'list_edges', args: {} }] },
                { toolCalls: [{ name: 'disconnect_edge', args: { edgeId: 'x' } }] },
                { text: 'Disconnected the edge.' },
            ],
            makeGraph([{ id: 'x', sourceNodeId: 'a', sourcePortId: 'out', targetNodeId: 'b', targetPortId: 'in' }])
        );

        await agent.send('disconnect a from b');

        expect(binding.readGraph().edges).toHaveLength(0);
        expect(binding.readGraph().nodes).toHaveLength(4);
    });
});

describe('edge agent — occupied input', () => {
    it('reports a rejected connect to an occupied input and does NOT replace the existing edge', async () => {
        // b.in is already fed by d → b; asking to connect a → b.in must be rejected, not a silent replace.
        const { agent, binding, toolMsg } = setup(
            [
                {
                    toolCalls: [
                        {
                            name: 'connect_nodes',
                            args: { sourceNodeId: 'a', sourcePortId: 'out', targetNodeId: 'b', targetPortId: 'in' },
                        },
                    ],
                },
                { text: 'b.in is already connected (edge x from d:out); I did not replace it.' },
            ],
            makeGraph([{ id: 'x', sourceNodeId: 'd', sourcePortId: 'out', targetNodeId: 'b', targetPortId: 'in' }])
        );

        await agent.send('connect a to b');

        // the occupying edge is untouched; no second edge was added
        const into = binding.readGraph().edges.filter(e => e.targetNodeId === 'b' && e.targetPortId === 'in');
        expect(into).toHaveLength(1);
        expect(into[0].id).toBe('x');
        expect(into[0].sourceNodeId).toBe('d'); // still the original source, not replaced by 'a'
        expect(toolMsg()?.content).toMatch(/already connected/);
    });
});

describe('edge agent — context', () => {
    it('does not inject the node list; offers get_graph to pull current state (Approach 3)', async () => {
        const { agent, gateway } = setup([{ text: 'ok' }]);
        await agent.send('what can you connect?');
        const systemContent = gateway.calls[0].messages
            .filter(m => m.role === 'system')
            .map(m => m.content)
            .join('\n');
        // Approach 3: no auto-injected node list — the edge agent pulls current state on demand.
        expect(systemContent).not.toMatch(/id="a"/);
        const toolNames = new Set((gateway.calls[0].tools ?? []).map(t => t.name));
        expect(toolNames.has('get_graph')).toBe(true);
    });
});
