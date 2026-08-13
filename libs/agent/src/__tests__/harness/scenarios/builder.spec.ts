/**
 * Builder specialist scenarios (no orchestrator): drive the composition `builder` DIRECTLY over the shared
 * fixtures. It carries the FULL editing toolset + `use_skill`, so it builds a whole flow in ONE sub-turn:
 * add → configure → wire → (read back →) repair. Cross-agent behaviour (orchestrator → builder) is
 * integration.spec.ts A7; the live variant is builder.live.spec.ts.
 */
import { describe, expect, it } from 'vitest';

import { createBuilderAgent } from '../../../agents/builderAgent';
import { createInMemoryCanvasBinding } from '../../../canvas/inMemoryCanvasBinding';
import { createFakeGateway } from '../../../llm/fakeGateway';
import { createInMemorySessionStore } from '../../../session/session';
import { createFixtureCatalog, nodeOfType as nodeOfTypeIn } from '../fixtures';

import type { Graph } from '../../../canvas/canvasBinding';
import type { FakeScriptStep } from '../../../llm/fakeGateway';
import type { SessionStore } from '../../../session/session';

const setup = (script: FakeScriptStep[], initialGraph?: Graph) => {
    const binding = createInMemoryCanvasBinding(initialGraph);
    const catalog = createFixtureCatalog();
    const gateway = createFakeGateway(script);
    const storage: SessionStore = createInMemorySessionStore();
    const flowId = 'flow-1';
    const agent = createBuilderAgent({
        gateway,
        binding,
        catalog,
        storage,
        flowId,
        userPermissions: { canModifyCanvas: true, canEditConfig: true },
    });
    const graph = () => binding.readGraph();
    const nodeOfType = (type: string) => nodeOfTypeIn(graph(), type);
    /** The concatenated content of every tool-result message — how a rejection reason reaches the builder. */
    const toolText = () =>
        (storage.load(flowId)?.messages ?? [])
            .filter(m => m.role === 'tool')
            .map(m => m.content ?? '')
            .join('\n');
    return { binding, gateway, agent, graph, nodeOfType, toolText };
};

describe('builder agent — builds a flow from a plan', () => {
    it('adds the stages, configures the generator inline, and wires the chain in order', async () => {
        // Empty canvas: the in-memory binding mints n_1, n_2, n_3 for the three adds (see fixtures/binding).
        const [TXT, GEN, PREV] = ['n_1', 'n_2', 'n_3'];
        const { agent, graph, nodeOfType } = setup(
            [
                { toolCalls: [{ name: 'add_node', args: { type: 'input-text', position: { x: 100, y: 100 } } }] },
                {
                    toolCalls: [
                        {
                            name: 'add_node',
                            args: {
                                type: 'single-output-generator',
                                position: { x: 300, y: 100 },
                                config: { model: 'gemini-2.5-pro' },
                            },
                        },
                    ],
                },
                { toolCalls: [{ name: 'add_node', args: { type: 'output-preview', position: { x: 500, y: 100 } } }] },
                {
                    toolCalls: [
                        {
                            name: 'connect_nodes',
                            args: { sourceNodeId: TXT, sourcePortId: 'out', targetNodeId: GEN, targetPortId: 'in' },
                        },
                        {
                            name: 'connect_nodes',
                            args: { sourceNodeId: GEN, sourcePortId: 'out', targetNodeId: PREV, targetPortId: 'in' },
                        },
                    ],
                },
                { text: 'Built input → generator → preview.' },
            ],
            { nodes: [], edges: [] }
        );

        await agent.send('build input-text → generator(model gemini-2.5-pro) → preview, wired in order');

        const g = graph();
        // the three block types are present (asserted by TYPE, never by minted id)
        expect(g.nodes.map(n => n.type).sort()).toEqual(['input-text', 'output-preview', 'single-output-generator']);
        // the generator carries the model set at creation (add + configure in one call)
        expect(nodeOfType('single-output-generator').config?.model).toBe('gemini-2.5-pro');
        // wired in dependency order: input → generator → preview, and nothing else
        const txt = nodeOfType('input-text');
        const gen = nodeOfType('single-output-generator');
        const prev = nodeOfType('output-preview');
        expect(g.edges.some(e => e.sourceNodeId === txt.id && e.targetNodeId === gen.id)).toBe(true);
        expect(g.edges.some(e => e.sourceNodeId === gen.id && e.targetNodeId === prev.id)).toBe(true);
        expect(g.edges).toHaveLength(2);
    });
});

describe('builder agent — reject and report (never force)', () => {
    it('reports a rejected connection (occupied input) and does not displace the occupying edge', async () => {
        // The generator's input is already wired from the text input; wiring the buffer into that SAME input
        // must be rejected (each input holds one edge). The builder reports it — it never overwrites the edge.
        const initial: Graph = {
            nodes: [
                { id: 'n_txt', type: 'input-text', position: { x: 100, y: 100 }, config: { text: 'hi' } },
                { id: 'n_buf', type: 'buffer', position: { x: 100, y: 300 }, config: {} },
                {
                    id: 'n_gen',
                    type: 'single-output-generator',
                    position: { x: 400, y: 200 },
                    config: { model: 'gemini-2.5-flash' },
                },
            ],
            edges: [
                {
                    id: 'e_txt_gen',
                    sourceNodeId: 'n_txt',
                    sourcePortId: 'out',
                    targetNodeId: 'n_gen',
                    targetPortId: 'in',
                },
            ],
        };
        const { agent, graph, toolText } = setup(
            [
                {
                    toolCalls: [
                        {
                            name: 'connect_nodes',
                            args: {
                                sourceNodeId: 'n_buf',
                                sourcePortId: 'out',
                                targetNodeId: 'n_gen',
                                targetPortId: 'in',
                            },
                        },
                    ],
                },
                {
                    text: 'Could not wire the buffer into the generator — its input is already connected from the text input.',
                },
            ],
            initial
        );

        await agent.send('wire the buffer into the generator');

        const g = graph();
        // the occupied-input connect was REJECTED and its reason reached the builder (reported, not forced)
        expect(toolText()).toMatch(/already connected/);
        // no buffer→generator edge was created, and the original text→generator edge is intact
        expect(g.edges.some(e => e.sourceNodeId === 'n_buf' && e.targetNodeId === 'n_gen')).toBe(false);
        expect(g.edges.some(e => e.sourceNodeId === 'n_txt' && e.targetNodeId === 'n_gen')).toBe(true);
        expect(g.edges).toHaveLength(1);
    });
});

describe('builder agent — tool surface', () => {
    it('offers the full editing toolset plus use_skill', async () => {
        const { agent, gateway } = setup([{ text: 'ready' }]);

        await agent.send('what can you build?');

        const toolNames = new Set((gateway.calls[0].tools ?? []).map(t => t.name));
        for (const name of [
            'list_nodes',
            'describe_node',
            'catalog_search',
            'add_node',
            'delete_node',
            'set_properties',
            'rename',
            'list_edges',
            'connect_nodes',
            'disconnect_edge',
            'move_node',
            'use_skill',
        ]) {
            expect(toolNames.has(name)).toBe(true);
        }
    });

    it('drives BUILDER_SYSTEM_PROMPT (the plan-executing persona), reaching the model', async () => {
        const { agent, gateway } = setup([{ text: 'ok' }]);

        await agent.send('hello');

        const systemContent = gateway.calls[0].messages
            .filter(m => m.role === 'system')
            .map(m => m.content)
            .join('\n');
        expect(systemContent).toMatch(/You are the Builder/);
    });
});

describe('builder agent — progressive disclosure', () => {
    it('use_skill loads a seed playbook and its instructions enter context only after the call', async () => {
        const { agent, gateway } = setup([
            { toolCalls: [{ name: 'use_skill', args: { name: 'build-linear-pipeline' } }] },
            { text: 'Loaded the playbook; building.' },
        ]);

        await agent.send('build a linear pipeline');

        const marker = 'Assemble the flow as a directed acyclic graph'; // a phrase unique to the build-linear-pipeline BODY (not its description)
        // Iteration 1: use_skill is offered, but the body is not yet in the transcript.
        expect(JSON.stringify(gateway.calls[0].messages)).not.toContain(marker);
        // Iteration 2: the loaded instructions are now in context (as the use_skill tool result).
        expect(JSON.stringify(gateway.calls[1].messages)).toContain(marker);
    });
});

describe('builder agent — Approach 3: initial graph in the first user message + get_graph', () => {
    it('seeds the starting canvas into the first user message and offers get_graph (no per-turn injection)', async () => {
        // Seed-once + pull: the graph is not pushed every turn. It rides the FIRST user
        // message as the starting state, and the builder pulls fresh state on demand via get_graph — so the
        // transcript stays append-only and no volatile block sits in the cached prefix.
        const initial: Graph = {
            nodes: [{ id: 'n_seed', type: 'input-text', position: { x: 0, y: 0 }, config: { text: 'hi' } }],
            edges: [],
        };
        const { agent, gateway } = setup([{ text: 'nothing to change' }], initial);

        await agent.send('inspect the canvas');

        const messages = gateway.calls[0].messages;
        // the starting graph rides the FIRST user message (a user turn), together with the plan text
        const firstUser = messages.find(m => m.role === 'user');
        expect(firstUser?.content).toContain('n_seed');
        expect(firstUser?.content).toContain('inspect the canvas');
        // it is NOT injected into a system header (that would sit in the cached prefix)
        const systemContent = messages
            .filter(m => m.role === 'system')
            .map(m => m.content)
            .join('\n');
        expect(systemContent).not.toContain('n_seed');
        // and the builder can PULL fresh state on demand
        const toolNames = new Set((gateway.calls[0].tools ?? []).map(t => t.name));
        expect(toolNames.has('get_graph')).toBe(true);
    });
});
