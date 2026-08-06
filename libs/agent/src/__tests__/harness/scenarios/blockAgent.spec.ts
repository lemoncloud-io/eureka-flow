/**
 * Generic BlockAgent scenarios (no orchestrator): drive a `BlockAgent(type)` directly with a concrete task
 * over a fake gateway and assert the live graph — its definition of done. One agent CONFIGURES one block
 * type's nodes (sets fields on an existing node — NOT add/delete/rename, which the builder owns) and its
 * reads are TYPE-SCOPED (`search_nodes`). The named generator specialist has its own suite
 * (singleOutputGenerator.spec.ts); cross-agent behavior is integration.spec.ts.
 */
import { describe, expect, it } from 'vitest';

import { createBlockAgent } from '../../../agents/blockAgent';
import { createInMemoryCanvasBinding } from '../../../canvas/inMemoryCanvasBinding';
import { createFakeGateway } from '../../../llm/fakeGateway';
import { createInMemorySessionStore } from '../../../session/session';
import { IDS, createFixtureCatalog, makeInitialGraph } from '../fixtures';

import type { FakeScriptStep } from '../../../llm/fakeGateway';
import type { SessionState, SessionStore } from '../../../session/session';

/** Build a generic BlockAgent for `blockType` over the shared 4-node fixture graph + fixture catalog. */
const setup = (blockType: string, script: FakeScriptStep[]) => {
    const binding = createInMemoryCanvasBinding(makeInitialGraph());
    const catalog = createFixtureCatalog();
    const gateway = createFakeGateway(script);
    const storage: SessionStore = createInMemorySessionStore();
    const flowId = 'flow-1';
    const agent = createBlockAgent({
        gateway,
        binding,
        catalog,
        storage,
        flowId,
        userPermissions: { canModifyCanvas: true, canEditConfig: true },
        blockType,
    });
    const state = (): SessionState => storage.load(flowId) as SessionState;
    const nodes = () => binding.readGraph().nodes;
    const nodeOf = (id: string) => nodes().find(n => n.id === id);
    const toolMsg = () => state().messages.find(m => m.role === 'tool');
    return { binding, gateway, agent, state, nodes, nodeOf, toolMsg };
};

describe('block agent — configure (merged, validated)', () => {
    it('sets a config value and keeps the others (merge)', async () => {
        const { agent, nodeOf } = setup('buffer', [
            { toolCalls: [{ name: 'set_properties', args: { nodeId: IDS.buf, config: { delayMs: '999' } } }] },
            { text: 'Set the buffer delay to 999ms.' },
        ]);

        await agent.send(`set node ${IDS.buf} delayMs to 999`);

        expect(nodeOf(IDS.buf)?.config).toEqual({ delayMs: '999' });
    });

    it('rejects an unknown config key and does NOT invent one (reject + report)', async () => {
        const { agent, nodeOf, toolMsg } = setup('buffer', [
            { toolCalls: [{ name: 'set_properties', args: { nodeId: IDS.buf, config: { foo: 'bar' } } }] },
            { text: 'The buffer has no "foo" field; nothing changed.' },
        ]);

        await agent.send(`set node ${IDS.buf} foo to bar`);

        // unchanged — the rejection came back to the agent, no key invented
        expect(nodeOf(IDS.buf)?.config).toEqual({ delayMs: '500' });
        expect(toolMsg()?.content).toMatch(/unknown config key/);
    });
});

describe('block agent — tool surface (configure-only)', () => {
    it('offers ONLY search + config — no add/delete (the builder shapes the flow) and no rename (it labels)', async () => {
        const { agent, gateway } = setup('output-preview', [{ text: 'ok' }]);

        await agent.send('what can you do?');

        const toolNames = new Set((gateway.calls[0].tools ?? []).map(t => t.name));
        expect([...toolNames].sort()).toEqual(['describe_node', 'search_nodes', 'set_properties']);
        // the structural + label writes belong to the builder, never a block agent
        for (const absent of ['add_node', 'delete_node', 'rename', 'move_node', 'connect_nodes']) {
            expect(toolNames.has(absent)).toBe(false);
        }
    });
});

describe('block agent — type-scoped reads', () => {
    it('search_nodes returns ONLY the agent’s own block type', async () => {
        const { agent, toolMsg } = setup('buffer', [
            { toolCalls: [{ name: 'search_nodes', args: {} }] },
            { text: 'You manage 1 buffer.' },
        ]);

        await agent.send('which buffers are there?');

        const result = JSON.parse(toolMsg()?.content ?? '{}') as { nodes?: { id: string; type: string }[] };
        expect(result.nodes).toBeDefined();
        expect(result.nodes?.every(n => n.type === 'buffer')).toBe(true);
        expect(result.nodes?.map(n => n.id)).toContain(IDS.buf);
        // the other three fixture nodes (input-text / generator / preview) are invisible to a buffer agent
        expect(result.nodes?.some(n => n.id === IDS.gen || n.id === IDS.txt || n.id === IDS.prev)).toBe(false);
    });

    it('injects the live own-type node list into the head; no get_graph (head context)', async () => {
        const { agent, gateway } = setup('buffer', [{ text: 'ok' }]);
        await agent.send('what can you do?');
        const systemContent = gateway.calls[0].messages
            .filter(m => m.role === 'system')
            .map(m => m.content)
            .join('\n');
        // Head context: the block agent gets its own-type node list every turn — no get_graph pull to amortize.
        expect(systemContent).toMatch(new RegExp(`id="${IDS.buf}"`));
        const toolNames = new Set((gateway.calls[0].tools ?? []).map(t => t.name));
        expect(toolNames.has('get_graph')).toBe(false);
    });
});

describe('block agent — search_nodes query filter', () => {
    it('narrows its own-type list to nodes whose label matches the query (case-insensitive)', async () => {
        const { agent, binding, toolMsg } = setup('buffer', [
            { toolCalls: [{ name: 'search_nodes', args: { query: 'delta' } }] },
            { text: 'Found the delta buffer.' },
        ]);
        // two same-type buffers with distinct labels; only the label-matching one should come back
        binding.updateNode(IDS.buf, { label: 'Alpha buffer' });
        const { id: deltaId } = binding.addNode('buffer', { x: 10, y: 10 });
        binding.updateNode(deltaId, { label: 'Delta Buffer' }); // capital D pins the case-insensitivity

        await agent.send('find the delta buffer');

        const result = JSON.parse(toolMsg()?.content ?? '{}') as { nodes?: { id: string }[] };
        expect(result.nodes?.map(n => n.id)).toEqual([deltaId]);
    });

    it('returns an empty list when no own-type label matches the query', async () => {
        const { agent, binding, toolMsg } = setup('buffer', [
            { toolCalls: [{ name: 'search_nodes', args: { query: 'nope' } }] },
            { text: 'No buffer matches.' },
        ]);
        binding.updateNode(IDS.buf, { label: 'Alpha buffer' });

        await agent.send('find the nope buffer');

        const result = JSON.parse(toolMsg()?.content ?? '{}') as { nodes?: { id: string }[] };
        expect(result.nodes).toEqual([]);
    });
});
