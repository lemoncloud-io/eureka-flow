/**
 * Node agent-level scenarios (no orchestrator): drive the node agent directly with a concrete task over a
 * fake gateway and assert the live graph — its definition of done (docs/browser-agent/agents/node.md).
 * Cross-agent behavior (the add→wire→configure composition) lives in integration.spec.ts.
 */
import { describe, expect, it } from 'vitest';

import { createNodeAgent } from '../../../agents/nodeAgent';
import { createInMemoryCanvasBinding } from '../../../canvas/inMemoryCanvasBinding';
import { createFakeGateway } from '../../../llm/fakeGateway';
import { createInMemorySessionStore } from '../../../session/session';
import { IDS, createFixtureCatalog, makeInitialGraph } from '../fixtures';

import type { FakeScriptStep } from '../../../llm/fakeGateway';
import type { SessionState, SessionStore } from '../../../session/session';

const setup = (script: FakeScriptStep[]) => {
    const binding = createInMemoryCanvasBinding(makeInitialGraph());
    const catalog = createFixtureCatalog();
    const gateway = createFakeGateway(script);
    const storage: SessionStore = createInMemorySessionStore();
    const flowId = 'flow-1';
    const agent = createNodeAgent({
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

describe('node agent — add_node', () => {
    it('adds a node of the given type at the given position (defaults-only)', async () => {
        const { agent, binding } = setup([
            { toolCalls: [{ name: 'add_node', args: { type: 'buffer', position: { x: 900, y: 120 } } }] },
            { text: 'Added a buffer node.' },
        ]);

        await agent.send('add a buffer at (900, 120)');

        const graph = binding.readGraph();
        expect(graph.nodes).toHaveLength(5);
        const added = graph.nodes.find(n => n.type === 'buffer' && n.id !== IDS.buf);
        expect(added?.position).toEqual({ x: 900, y: 120 });
        // No wiring: adding a node creates no edge.
        expect(graph.edges).toHaveLength(3);
    });

    it('reports an unknown block type and adds nothing (does not invent one)', async () => {
        const { agent, binding, toolMsg } = setup([
            { toolCalls: [{ name: 'add_node', args: { type: 'gpt-block', position: { x: 0, y: 0 } } }] },
            { text: 'There is no block type "gpt-block".' },
        ]);

        await agent.send('add a gpt-block');

        expect(binding.readGraph().nodes).toHaveLength(4);
        expect(toolMsg()?.content).toMatch(/unknown block type/);
    });
});

describe('node agent — delete_node', () => {
    it('deletes a node and cascades its edges', async () => {
        const { agent, binding } = setup([
            { toolCalls: [{ name: 'delete_node', args: { nodeId: IDS.buf } }] },
            { text: 'Deleted the buffer; its two edges went with it.' },
        ]);

        await agent.send(`delete node ${IDS.buf}`);

        const graph = binding.readGraph();
        expect(graph.nodes.find(n => n.id === IDS.buf)).toBeUndefined();
        expect(graph.edges.some(e => e.sourceNodeId === IDS.buf || e.targetNodeId === IDS.buf)).toBe(false);
    });
});

describe('node agent — context', () => {
    it('seeds the current node list into context on the first request', async () => {
        const { agent, gateway } = setup([{ text: 'ok' }]);
        await agent.send('what can you add?');
        const systemContent = gateway.calls[0].messages
            .filter(m => m.role === 'system')
            .map(m => m.content)
            .join('\n');
        expect(systemContent).toMatch(new RegExp(`id="${IDS.gen}"`));
    });
});
