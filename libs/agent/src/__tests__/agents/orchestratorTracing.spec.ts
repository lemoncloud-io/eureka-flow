import { describe, expect, it } from 'vitest';

import { createOrchestratorAgent } from '../../agents/orchestratorAgent';
import { createInMemoryCanvasBinding } from '../../canvas/inMemoryCanvasBinding';
import { createFakeGateway } from '../../llm/fakeGateway';
import { createInMemorySessionStore } from '../../session/session';
import { createTracer } from '../../trace/createTracer';
import { AGENT_RETURN, AGENT_SPAWN, CANVAS_MUTATE, TURN_START } from '../../trace/events';
import { toGraphDiff, toTraceForest, toTranscripts } from '../../trace/project';
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

        // Attribution: the handoff is on the orchestrator instance (epoch 1); the canvas edit is on the
        // fresh builder instance, nested under that epoch.
        const spawn = records.find(r => r.name === AGENT_SPAWN);
        expect(spawn?.context['gen_ai.agent.id']).toBe('orchestrator#1');
        expect(spawn?.fields.agentType).toBe('builder');

        const mutate = records.find(r => r.name === CANVAS_MUTATE);
        expect(mutate?.context['gen_ai.agent.id']).toBe('builder#1');
        expect(mutate?.context.flowPath).toBe(`${FLOW_ID}#1:builder#1`);
        expect(mutate?.context.runId).toBe('run-1.1'); // inherited from the orchestrator's request (epoch.turn)

        // View 1 — trace forest: one orchestrator#1 root with builder#1 nested under it.
        const forest = toTraceForest(records);
        expect(forest).toHaveLength(1);
        expect(forest[0].agentId).toBe('orchestrator#1');
        expect(forest[0].children.map(c => c.agentId)).toEqual(['builder#1']);

        // View 2 — transcripts: one chat per instance, chat-shaped.
        const transcripts = toTranscripts(records);
        expect(transcripts.map(t => t.agentId).sort()).toEqual(['builder#1', 'orchestrator#1']);
        const builderChat = transcripts.find(t => t.agentId === 'builder#1')?.chat ?? [];
        expect(builderChat[0]?.role).toBe('user');
        expect(builderChat.some(e => e.role === 'assistant' && (e.toolCalls?.length ?? 0) > 0)).toBe(true);

        // View 3 — graph diff: the input node moved (position changed) across the request.
        const diff = toGraphDiff(records, 'run-1.1');
        expect(diff.changedNodes.map(n => n.id)).toContain(IDS.txt);
    });

    it('keeps cross-epoch children distinct in the transcripts (rebuilt runner reuses builder#1)', async () => {
        // A reload/model switch rebuilds the orchestrator: a fresh runner restarts its spawn counter, so the
        // epoch-2 builder is `builder#1` again. Both epochs share one trace buffer; keyed by agentId alone
        // the two builders would merge — they must stay separate, one transcript per epoch-unique flowPath.
        const sink = memorySink();
        const tracer = createTracer(sink, () => 0);
        const storage = createInMemorySessionStore();
        const binding = createInMemoryCanvasBinding(makeInitialGraph());

        const build = () =>
            createOrchestratorAgent({
                gateway: createFakeGateway(scripts().orchestrator),
                gatewayFor: agentType => createFakeGateway(scripts()[agentType] ?? []),
                storage,
                flowId: FLOW_ID,
                binding,
                catalog: createFixtureCatalog(),
                userPermissions: { canModifyCanvas: true, canEditConfig: true },
                tracer,
            });

        await build().send('nudge the input right'); // epoch 1
        await build().send('nudge it again'); // new instance continues the session → epoch 2

        const builders = toTranscripts(sink.records).filter(t => t.agentType === 'builder');
        expect(builders).toHaveLength(2); // not folded into one
        expect(builders.map(t => t.agentId)).toEqual(['builder#1', 'builder#1']); // same label...
        expect(builders.map(t => t.flowPath)).toEqual([`${FLOW_ID}#1:builder#1`, `${FLOW_ID}#2:builder#1`]); // ...distinct instances
    });

    it('tags each instance with its model in the forest (orchestrator + per-child, inherit vs override)', async () => {
        const sink = memorySink();
        const tracer = createTracer(sink, () => 0);
        // Orchestrator + builder run the reasoning model; a worker block agent runs a different model.
        const script: Record<string, FakeScriptStep[]> = {
            orchestrator: [
                {
                    toolCalls: [
                        {
                            name: 'spawn',
                            args: {
                                children: [
                                    { agentType: 'builder', task: `move ${IDS.txt} right by 20px` },
                                    { agentType: 'buffer', task: `set the buffer delay on ${IDS.buf}` },
                                ],
                            },
                        },
                    ],
                },
                { text: 'done' },
            ],
            builder: [
                { toolCalls: [{ name: 'move_node', args: { nodeId: IDS.txt, by: { dx: 20, dy: 0 } } }] },
                { text: 'moved' },
            ],
            buffer: [{ text: 'configured' }],
        };
        const agent = createOrchestratorAgent({
            gateway: createFakeGateway(script.orchestrator),
            gatewayFor: agentType => createFakeGateway(script[agentType] ?? []),
            storage: createInMemorySessionStore(),
            flowId: FLOW_ID,
            binding: createInMemoryCanvasBinding(makeInitialGraph()),
            catalog: createFixtureCatalog(),
            userPermissions: { canModifyCanvas: true, canEditConfig: true },
            tracer,
            model: 'gemini-2.5-pro', // the orchestrator's (reasoning) model
            modelFor: agentType => (agentType === 'buffer' ? 'gemini-2.5-flash' : undefined), // buffer overrides; builder inherits
        });

        await agent.send('nudge the input right and tune the buffer');

        const [root] = toTraceForest(sink.records);
        expect(root.agentId).toBe('orchestrator#1');
        expect(root.model).toBe('gemini-2.5-pro'); // orchestrator tagged with its model
        const byType = new Map(root.children.map(c => [c.agentType, c.model]));
        expect(byType.get('builder')).toBe('gemini-2.5-pro'); // inherits the orchestrator's model
        expect(byType.get('buffer')).toBe('gemini-2.5-flash'); // worker override shows per-child
    });
});
