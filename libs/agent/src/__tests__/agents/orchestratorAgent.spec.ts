import { describe, expect, it } from 'vitest';

import { createOrchestratorAgent } from '../../agents/orchestratorAgent';
import { createInMemoryCanvasBinding } from '../../canvas/inMemoryCanvasBinding';
import { createFakeGateway } from '../../llm/fakeGateway';
import { createInMemorySessionStore } from '../../session/session';
import { IDS, createFixtureCatalog, makeInitialGraph, nodeById } from '../harness/fixtures';

import type { OrchestratorAgentDeps } from '../../agents/orchestratorAgent';
import type { FakeScriptStep } from '../../llm/fakeGateway';

const FLOW_ID = 'orchestrator-flow';

// The orchestrator ends its turn with a plain-text message (there is no finish tool): turn 1 delegates the
// move, then a plain-text reply ends the turn. There is no structured outcome here — the eval (runScenario)
// extracts one via a re-ask; this spec drives the orchestrator directly and checks the live-canvas effect
// plus the plain-text turn-end.
const scripts = (): Record<string, FakeScriptStep[]> => ({
    orchestrator: [
        {
            toolCalls: [
                {
                    name: 'spawn',
                    args: { children: [{ agentType: 'builder', task: `move ${IDS.txt} right by 20px` }] },
                },
            ],
        },
        { text: 'Moved the input right by 20px.' },
    ],
    // A move is structural, so it routes to the builder (edge/locator are retired).
    builder: [
        { toolCalls: [{ name: 'move_node', args: { nodeId: IDS.txt, by: { dx: 20, dy: 0 } } }] },
        { text: 'moved' },
    ],
});

/** Deps for the consolidated orchestrator: it builds its own roster + sub-agent runner from these. */
const buildDeps = (): OrchestratorAgentDeps => {
    const script = scripts();
    return {
        gateway: createFakeGateway(script.orchestrator),
        gatewayFor: agentType => createFakeGateway(script[agentType] ?? []),
        storage: createInMemorySessionStore(),
        flowId: FLOW_ID,
        binding: createInMemoryCanvasBinding(makeInitialGraph()),
        catalog: createFixtureCatalog(),
        userPermissions: { canModifyCanvas: true, canEditConfig: true },
    };
};

describe('createOrchestratorAgent — one agent drives the whole turn', () => {
    it('delegates the edit onto the live canvas', async () => {
        const deps = buildDeps();
        const agent = createOrchestratorAgent(deps);

        await agent.send('nudge the input right');

        // the LIVE binding reflects the delegated move (input-text (100,100) → x = 120)
        expect(nodeById(deps.binding.readGraph(), IDS.txt).position.x).toBe(120);
    });

    it('ends the turn with the model’s plain-text message (what the panel renders)', async () => {
        const deps = buildDeps();
        const agent = createOrchestratorAgent(deps);

        await agent.send('nudge the input right');

        const state = deps.storage.load(FLOW_ID);
        const lastAssistant = state?.messages.filter(m => m.role === 'assistant' && m.content).at(-1);
        expect(lastAssistant?.content).toContain('Moved the input right');
        expect(state?.phase).toBe('done');
    });

    it('reuses one session across sends — it does not reset the transcript', async () => {
        const deps = buildDeps();
        const agent = createOrchestratorAgent(deps);

        await agent.send('nudge the input right');
        const afterFirst = deps.storage.load(FLOW_ID)?.messages.length ?? 0;

        // A second send on the SAME agent (its fake gateway is now exhausted → a no-op turn) still
        // appends to the same transcript rather than starting over — the transcript is the state.
        await agent.send('and again');
        const messages = deps.storage.load(FLOW_ID)?.messages ?? [];
        expect(messages.length).toBeGreaterThan(afterFirst);
        expect(messages[0].content).toContain('nudge the input right'); // turn-1 history preserved (the graph seed rides seedPrefix, not content)
    });
});
