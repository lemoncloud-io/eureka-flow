/**
 * Generator specialist scenarios (no orchestrator): drive the `single-output-generator` block agent directly.
 * It is a BlockAgent with an AI persona, so it CONFIGURES a generator — sets the model + sampling fields on an
 * existing node — and reports rejections without inventing; it does not add/delete/rename (the builder shapes
 * the flow). Cross-agent behavior is integration.spec.ts; live coverage rides the integration live suite.
 */
import { describe, expect, it } from 'vitest';

import { createSingleOutputGeneratorAgent } from '../../../agents/singleOutputGeneratorAgent';
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
    const agent = createSingleOutputGeneratorAgent({
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
    const toolMsg = () => state().messages.find(m => m.role === 'tool');
    return { binding, gateway, agent, state, nodes, nodeOf, toolMsg };
};

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
    it('drives SINGLE_OUTPUT_GENERATOR_SYSTEM_PROMPT, not the generic block prompt (the override rides through)', async () => {
        const { agent, gateway } = setup([{ text: 'ok' }]);

        await agent.send('what can you do?');

        const systemContent = gateway.calls[0].messages
            .filter(m => m.role === 'system')
            .map(m => m.content)
            .join('\n');
        // Domain knowledge ONLY the generator persona carries — the generic blockAgentSystemPrompt (label
        // "Generator") never mentions the AI-block name or provider keys, so this proves createSingleOutputGeneratorAgent's
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
