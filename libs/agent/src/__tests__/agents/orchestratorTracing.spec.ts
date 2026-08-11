import { describe, expect, it } from 'vitest';

import { createOrchestratorAgent } from '../../agents/orchestratorAgent';
import { createInMemoryCanvasBinding } from '../../canvas/inMemoryCanvasBinding';
import { createFakeGateway } from '../../llm/fakeGateway';
import { createInMemorySessionStore } from '../../session/session';
import { createTracer } from '../../trace/createTracer';
import { AGENT_RETURN, AGENT_SPAWN, CANVAS_MUTATE, TURN_START } from '../../trace/events';
import { toGraphDiff, toTraceTree, toTranscripts } from '../../trace/project';
import { memorySink } from '../../trace/sinks';
import { IDS, createFixtureCatalog, makeInitialGraph } from '../harness/fixtures';

import type { FakeScriptStep } from '../../llm/fakeGateway';

const FLOW_ID = 'trace-flow';

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
    builder: [
        { toolCalls: [{ name: 'move_node', args: { nodeId: IDS.txt, by: { dx: 20, dy: 0 } } }] },
        { text: 'moved' },
    ],
});

describe('orchestrator tracing (end-to-end via memorySink)', () => {
    it('emits an attributed record stream that projects to tree, transcripts, and graph diff', async () => {
        const sink = memorySink();
        const tracer = createTracer(sink, () => 0).child({
            'gen_ai.agent.name': 'orchestrator',
            'gen_ai.agent.id': 'orchestrator',
            flowPath: FLOW_ID,
        });
        const script = scripts();
        const agent = createOrchestratorAgent({
            gateway: createFakeGateway(script.orchestrator),
            gatewayFor: agentType => createFakeGateway(script[agentType] ?? []),
            storage: createInMemorySessionStore(),
            flowId: FLOW_ID,
            binding: createInMemoryCanvasBinding(makeInitialGraph()),
            catalog: createFixtureCatalog(),
            userPermissions: { canModifyCanvas: true, canEditConfig: true },
            tracer,
        });

        await agent.send('nudge the input right');

        const { records } = sink;
        const names = new Set(records.map(r => r.name));
        expect(names).toContain(TURN_START);
        expect(names).toContain(AGENT_SPAWN);
        expect(names).toContain(AGENT_RETURN);
        expect(names).toContain(CANVAS_MUTATE);

        // Attribution: the handoff is on the orchestrator; the canvas edit is on the fresh builder instance.
        const spawn = records.find(r => r.name === AGENT_SPAWN);
        expect(spawn?.context['gen_ai.agent.id']).toBe('orchestrator');
        expect(spawn?.fields.agentType).toBe('builder');

        const mutate = records.find(r => r.name === CANVAS_MUTATE);
        expect(mutate?.context['gen_ai.agent.id']).toBe('builder#1');
        expect(mutate?.context.flowPath).toBe(`${FLOW_ID}:builder#1`);
        expect(mutate?.context.runId).toBe('run-1'); // inherited from the orchestrator's request

        // View 1 — trace tree: orchestrator root with builder#1 nested under it.
        const root = toTraceTree(records);
        expect(root?.agentId).toBe('orchestrator');
        expect(root?.children.map(c => c.agentId)).toEqual(['builder#1']);

        // View 2 — transcripts: one chat per instance, chat-shaped.
        const transcripts = toTranscripts(records);
        expect(transcripts.map(t => t.agentId).sort()).toEqual(['builder#1', 'orchestrator']);
        const builderChat = transcripts.find(t => t.agentId === 'builder#1')?.chat ?? [];
        expect(builderChat[0]?.role).toBe('user');
        expect(builderChat.some(e => e.role === 'assistant' && (e.toolCalls?.length ?? 0) > 0)).toBe(true);

        // View 3 — graph diff: the input node moved (position changed) across the request.
        const diff = toGraphDiff(records, 'run-1');
        expect(diff.changedNodes.map(n => n.id)).toContain(IDS.txt);
    });
});
