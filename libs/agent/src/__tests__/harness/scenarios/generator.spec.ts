/**
 * Generator specialist scenarios (no orchestrator): drive the `single-output-generator` block agent directly.
 * It is a BlockAgent with an AI persona, so it owns the generator's whole lifecycle AND can add+configure in
 * ONE turn (the block-ownership payoff). Cross-agent behavior is integration.spec.ts; live variant is
 * generator.live.spec.ts.
 */
import { describe, expect, it } from 'vitest';

import { createGeneratorAgent } from '../../../agents/generatorAgent';
import { createInMemoryCanvasBinding } from '../../../canvas/inMemoryCanvasBinding';
import { createFakeGateway } from '../../../llm/fakeGateway';
import { createInMemorySessionStore } from '../../../session/session';
import { IDS, createFixtureCatalog, makeInitialGraph } from '../fixtures';

import type { FakeScriptStep } from '../../../llm/fakeGateway';
import type { SessionState, SessionStore } from '../../../session/session';

const GEN = 'single-output-generator';

const setup = (script: FakeScriptStep[]) => {
    const binding = createInMemoryCanvasBinding(makeInitialGraph());
    const catalog = createFixtureCatalog();
    const gateway = createFakeGateway(script);
    const storage: SessionStore = createInMemorySessionStore();
    const flowId = 'flow-1';
    const agent = createGeneratorAgent({
        gateway,
        binding,
        catalog,
        storage,
        flowId,
        userPermissions: { canModifyCanvas: true, canEditConfig: true },
    });
    const state = (): SessionState => storage.load(flowId) as SessionState;
    const nodes = () => binding.readGraph().nodes;
    const nodeOf = (id: string) => nodes().find(n => n.id === id);
    const addedGenerator = () => nodes().find(n => n.type === GEN && n.id !== IDS.gen);
    const toolMsg = () => state().messages.find(m => m.role === 'tool');
    return { binding, gateway, agent, state, nodes, nodeOf, addedGenerator, toolMsg };
};

describe('generator agent — add + configure in ONE turn', () => {
    it('adds a generator and sets its model in a single sub-turn', async () => {
        // The in-memory binding mints `n_1` for the first add (fixture ids are non-numeric); the assertion
        // finds the new node by exclusion, so it never couples to the id scheme.
        const NEW = 'n_1';
        const { agent, addedGenerator } = setup([
            { toolCalls: [{ name: 'add_node', args: { type: GEN, position: { x: 900, y: 300 } } }] },
            { toolCalls: [{ name: 'set_properties', args: { nodeId: NEW, config: { model: 'gemini-2.5-pro' } } }] },
            { text: 'Added a generator and set its model to gemini-2.5-pro.' },
        ]);

        await agent.send('add a single-output-generator at (900, 300) and set its model to gemini-2.5-pro');

        const added = addedGenerator();
        expect(added).toBeDefined();
        expect(added?.config?.model).toBe('gemini-2.5-pro');
    });

    it('adds a generator with its model in ONE add_node call (config inline)', async () => {
        const { agent, addedGenerator } = setup([
            {
                toolCalls: [
                    {
                        name: 'add_node',
                        args: { type: GEN, position: { x: 900, y: 300 }, config: { model: 'gemini-2.5-pro' } },
                    },
                ],
            },
            { text: 'Added a generator configured with gemini-2.5-pro.' },
        ]);

        await agent.send('add a single-output-generator at (900, 300) with model gemini-2.5-pro');

        const added = addedGenerator();
        expect(added).toBeDefined();
        expect(added?.config?.model).toBe('gemini-2.5-pro');
    });
});

describe('generator agent — configure existing', () => {
    it('sets the model and KEEPS the existing temperature (merge)', async () => {
        const { agent, nodeOf } = setup([
            { toolCalls: [{ name: 'set_properties', args: { nodeId: IDS.gen, config: { model: 'gemini-2.5-pro' } } }] },
            { text: 'Set the model.' },
        ]);

        await agent.send(`set node ${IDS.gen} model to gemini-2.5-pro`);

        expect(nodeOf(IDS.gen)?.config).toEqual({ model: 'gemini-2.5-pro', temperature: '0.7' });
    });

    it('rejects a model outside the enum and does NOT substitute its own', async () => {
        const { agent, nodeOf, toolMsg } = setup([
            { toolCalls: [{ name: 'set_properties', args: { nodeId: IDS.gen, config: { model: 'gpt-4o' } } }] },
            { text: 'gpt-4o is not an allowed model.' },
        ]);

        await agent.send(`set node ${IDS.gen} model to gpt-4o`);

        expect(nodeOf(IDS.gen)?.config?.model).toBe('gemini-2.5-flash'); // unchanged
        expect(toolMsg()?.content).toMatch(/not an allowed option/);
    });
});

describe('generator agent — specialist persona', () => {
    it('drives GENERATOR_SYSTEM_PROMPT, not the generic block prompt (the override rides through)', async () => {
        const { agent, gateway } = setup([{ text: 'ok' }]);

        await agent.send('what can you do?');

        const systemContent = gateway.calls[0].messages
            .filter(m => m.role === 'system')
            .map(m => m.content)
            .join('\n');
        // Domain knowledge ONLY the generator persona carries — the generic blockAgentSystemPrompt (label
        // "Generator") never mentions the AI-block name or provider keys, so this proves createGeneratorAgent's
        // persona override actually reached the model rather than the generic block prompt.
        expect(systemContent).toMatch(/AI Text Generator/);
        expect(systemContent).toMatch(/OpenAI key/);
    });
});

describe('generator agent — type-scoped reads', () => {
    it('search_nodes returns only generator nodes', async () => {
        const { agent, toolMsg } = setup([
            { toolCalls: [{ name: 'search_nodes', args: {} }] },
            { text: 'One generator.' },
        ]);

        await agent.send('which generators are there?');

        const result = JSON.parse(toolMsg()?.content ?? '{}') as { nodes?: { id: string; type: string }[] };
        expect(result.nodes?.every(n => n.type === GEN)).toBe(true);
        expect(result.nodes?.map(n => n.id)).toContain(IDS.gen);
        expect(result.nodes?.some(n => n.id === IDS.buf || n.id === IDS.txt || n.id === IDS.prev)).toBe(false);
    });
});
