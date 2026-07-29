/**
 * Property agent-level scenarios (no orchestrator): drive the property agent directly with a concrete task
 * over a fake gateway and assert the live graph — its definition of done
 * (docs/browser-agent/agents/property.md). Cross-agent behavior lives in integration.spec.ts; the
 * real-model variant in property.live.spec.ts.
 */
import { describe, expect, it } from 'vitest';

import { createPropertyAgent } from '../../../agents/propertyAgent';
import { createInMemoryCanvasBinding } from '../../../canvas/inMemoryCanvasBinding';
import { createFakeGateway } from '../../../llm/fakeGateway';
import { createInMemorySessionStore } from '../../../session/session';
import { IDS, createFixtureCatalog, makeInitialGraph } from '../fixtures';

import type { FakeScriptStep } from '../../../llm/fakeGateway';
import type { AgentGrant } from '../../../permissions';
import type { SessionState, SessionStore } from '../../../session/session';

const setup = (script: FakeScriptStep[], grant?: AgentGrant, opts?: { maxIterations?: number }) => {
    const binding = createInMemoryCanvasBinding(makeInitialGraph());
    const catalog = createFixtureCatalog();
    const gateway = createFakeGateway(script);
    const storage: SessionStore = createInMemorySessionStore();
    const flowId = 'flow-1';
    const agent = createPropertyAgent({
        gateway,
        binding,
        catalog,
        storage,
        flowId,
        // Owner-level ceiling — so the `grant` arg (the agent's own grant) is what these tests gate on.
        userPermissions: { canModifyCanvas: true, canEditConfig: true },
        config: grant ? { grant } : undefined,
        maxIterations: opts?.maxIterations,
    });
    const state = (): SessionState => storage.load(flowId) as SessionState;
    const nodeOf = (id: string) => binding.readGraph().nodes.find(n => n.id === id);
    const configOf = (id: string) => nodeOf(id)?.config;
    const labelOf = (id: string) => nodeOf(id)?.customLabel;
    const toolMsg = () => state().messages.find(m => m.role === 'tool');
    const lastAssistant = () => [...state().messages].reverse().find(m => m.role === 'assistant' && m.content);
    return { binding, gateway, storage, flowId, agent, state, configOf, labelOf, toolMsg, lastAssistant };
};

describe('property agent — set_properties (config, merged)', () => {
    it('sets model and KEEPS the existing temperature (A2 merge)', async () => {
        const { agent, configOf } = setup([
            { toolCalls: [{ name: 'set_properties', args: { nodeId: IDS.gen, config: { model: 'gemini-2.5-pro' } } }] },
            { text: 'Set the generator model to gemini-2.5-pro.' },
        ]);

        await agent.send(`set node ${IDS.gen} model to gemini-2.5-pro`);

        expect(configOf(IDS.gen)).toEqual({ model: 'gemini-2.5-pro', temperature: '0.7' });
    });

    it('rejects an invalid select value and does NOT substitute its own (keeps judgement in the orchestrator)', async () => {
        const { agent, configOf, toolMsg } = setup([
            { toolCalls: [{ name: 'set_properties', args: { nodeId: IDS.gen, config: { model: 'gpt-4o' } } }] },
            { text: 'gpt-4o is not an allowed model. Valid options: gemini-2.5-flash, gemini-2.5-pro, …' },
        ]);

        await agent.send(`set node ${IDS.gen} model to gpt-4o`);

        // Nothing applied, model unchanged; the reason came back to the agent.
        expect(configOf(IDS.gen)?.model).toBe('gemini-2.5-flash');
        expect(toolMsg()?.content).toMatch(/not an allowed option/);
    });
});

describe('property agent — rename', () => {
    it("renames a node's custom label (A3)", async () => {
        const { agent, labelOf } = setup([
            { toolCalls: [{ name: 'rename', args: { nodeId: IDS.prev, label: 'Result' } }] },
            { text: 'Renamed the preview to “Result”.' },
        ]);

        await agent.send(`rename node ${IDS.prev} to Result`);

        expect(labelOf(IDS.prev)).toBe('Result');
    });
});

describe('property agent — context', () => {
    it('seeds the current node list into context on the first request', async () => {
        const { agent, gateway } = setup([{ text: 'ok' }]);
        await agent.send('what can you change?');
        const systemContent = gateway.calls[0].messages
            .filter(m => m.role === 'system')
            .map(m => m.content)
            .join('\n');
        expect(systemContent).toMatch(new RegExp(`id="${IDS.gen}"`));
        expect(systemContent).toMatch(/single-output-generator/);
    });
});
