import { describe, expect, it } from 'vitest';

import { createBuilderAgent } from '../../agents/builderAgent';
import { createInMemoryCanvasBinding } from '../../canvas/inMemoryCanvasBinding';
import { createFakeGateway } from '../../llm/fakeGateway';
import { createInMemorySessionStore } from '../../session/session';

import type { Graph } from '../../canvas';
import type { CatalogLookup } from '../../catalog';
import type { SessionState, SessionStore } from '../../session/session';

// These exercise BaseAgent's epoch/context-boundary logic (agent-agnostic); the builder stands in because
// it carries an initialUserPreamble (graph seed) — the orchestrator uses the identical code path.
const emptyCatalog: CatalogLookup = { has: () => false, schema: () => undefined, search: () => [] };
const GRAPH: Graph = {
    nodes: [{ id: 'n_seed', type: 'input-text', position: { x: 0, y: 0 }, config: { text: 'hi' } }],
    edges: [],
};

/** A prior conversation: a tool-call turn (list_nodes) + its result, then an assistant text reply. */
const priorConversation = (flowId: string): SessionState => ({
    flowId,
    phase: 'idle',
    epoch: 1,
    messages: [
        { id: 'u-1', role: 'user', content: 'list the nodes', ts: 1 },
        {
            id: 'a-1',
            role: 'assistant',
            toolCalls: [{ id: 'c1', name: 'list_nodes', args: '{}', status: 'ok', thoughtSignature: 'sig-prior' }],
            ts: 2,
        },
        { id: 't-1', role: 'tool', content: '{"nodes":[]}', toolCallId: 'c1', ts: 3 },
        { id: 'a-2', role: 'assistant', content: 'Listed the nodes.', ts: 4 },
    ],
});

const makeAgent = (storage: SessionStore, flowId: string, gateway: ReturnType<typeof createFakeGateway>) =>
    createBuilderAgent({
        gateway,
        storage,
        flowId,
        binding: createInMemoryCanvasBinding(GRAPH),
        catalog: emptyCatalog,
        userPermissions: { canModifyCanvas: true },
    });

describe('BaseAgent context handoff — epoch boundary (reload/switch) vs same-instance turns', () => {
    it('a NEW instance continuing a session drops the prior tool trace and re-seeds the current graph', async () => {
        const flowId = 'continuation';
        const storage = createInMemorySessionStore();
        storage.save(priorConversation(flowId));

        const gateway = createFakeGateway([{ text: 'done' }]);
        await makeAgent(storage, flowId, gateway).send('now move it');

        const sent = gateway.calls[0].messages;
        // Prior tool trace is gone: no tool-result message, no replayed tool call / signature.
        expect(sent.some(m => m.role === 'tool')).toBe(false);
        expect(sent.some(m => m.toolCalls?.length)).toBe(false);
        expect(JSON.stringify(sent)).not.toContain('sig-prior');
        // Conversation before the boundary is kept (user turn + assistant text).
        expect(sent.some(m => m.role === 'user' && m.content === 'list the nodes')).toBe(true);
        expect(sent.some(m => m.role === 'assistant' && m.content === 'Listed the nodes.')).toBe(true);
        // The current graph is re-seeded onto the latest user turn (end of chatlog), hidden.
        const newUser = sent.find(m => m.role === 'user' && (m.content ?? '').includes('now move it'));
        expect(newUser?.content).toContain('n_seed');

        // Persisted: seed hidden from `content` (panel), carried in `seedPrefix`; epoch + boundary advanced.
        const state = storage.load(flowId);
        const persisted = state?.messages.find(m => m.role === 'user' && m.content === 'now move it');
        expect(persisted?.content).toBe('now move it');
        expect(persisted?.seedPrefix).toContain('n_seed');
        expect(state?.epoch).toBe(2);
        expect(state?.contextBaseIndex).toBe(4); // boundary at the new turn
    });

    it('a second send on the SAME instance is not a boundary — no epoch bump, seed only once', async () => {
        const flowId = 'same-instance';
        const storage = createInMemorySessionStore();
        const agent = makeAgent(storage, flowId, createFakeGateway([{ text: 'ok' }]));

        await agent.send('first'); // fresh → epoch 1
        await agent.send('second'); // same instance → still epoch 1, no boundary

        const state = storage.load(flowId);
        expect(state?.epoch).toBe(1);
        expect(state?.contextBaseIndex ?? 0).toBe(0);
        const users = state?.messages.filter(m => m.role === 'user') ?? [];
        expect(users[0]?.seedPrefix).toContain('n_seed'); // seeded once, on the first turn of the epoch
        expect(users[1]?.seedPrefix).toBeUndefined();
    });

    it('hides the graph seed from the persisted first message but sends it to the model', async () => {
        const flowId = 'fresh';
        const storage = createInMemorySessionStore();
        const gateway = createFakeGateway([{ text: 'ok' }]);
        await makeAgent(storage, flowId, gateway).send('inspect the canvas');

        const first = storage.load(flowId)?.messages[0];
        expect(first?.content).toBe('inspect the canvas');
        expect(first?.seedPrefix).toContain('n_seed');
        const sentUser = gateway.calls[0].messages.find(m => m.role === 'user');
        expect(sentUser?.content).toContain('n_seed');
        expect(sentUser?.content).toContain('inspect the canvas');
    });

    it('each new instance opens the next epoch (reload/switch numbering)', async () => {
        const flowId = 'epochs';
        const storage = createInMemorySessionStore();

        await makeAgent(storage, flowId, createFakeGateway([{ text: '1' }])).send('a'); // fresh → 1
        expect(storage.load(flowId)?.epoch).toBe(1);
        await makeAgent(storage, flowId, createFakeGateway([{ text: '2' }])).send('b'); // new instance → 2
        expect(storage.load(flowId)?.epoch).toBe(2);
        await makeAgent(storage, flowId, createFakeGateway([{ text: '3' }])).send('c'); // new instance → 3
        expect(storage.load(flowId)?.epoch).toBe(3);
    });
});
