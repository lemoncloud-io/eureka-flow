/**
 * Locator agent-level scenarios (no orchestrator): drive the locator directly with a concrete task over a
 * fake gateway and assert the live graph — the locator's definition of done
 * (docs/browser-agent/agents/locator.md). Cross-agent behavior lives in integration.spec.ts; the
 * real-model variant in locator.live.spec.ts.
 */
import { describe, expect, it } from 'vitest';

import { createLocatorAgent } from '../../../agents/locatorAgent';
import { createInMemoryCanvasBinding } from '../../../canvas/inMemoryCanvasBinding';
import { createFakeGateway } from '../../../llm/fakeGateway';
import { createInMemorySessionStore } from '../../../session/session';

import type { CanvasBinding } from '../../../canvas/canvasBinding';
import type { CatalogLookup } from '../../../catalog';
import type { FakeScriptStep } from '../../../llm/fakeGateway';
import type { Chunk, LlmGateway } from '../../../llm/llmGateway';
import type { SessionState, SessionStore } from '../../../session/session';
import type { NodeData } from '@lemoncloud/eureka-flows-api';

/** A no-op catalog — the locator only moves; describe_node is never exercised here. */
const emptyCatalog: CatalogLookup = { has: () => false, schema: () => undefined, search: () => [] };

const makeNode = (id: string, x = 0, y = 0, extra: Partial<NodeData> = {}): NodeData => ({
    id,
    type: 'test',
    position: { x, y },
    ...extra,
});

const setup = (
    nodes: NodeData[],
    script: FakeScriptStep[],
    grant?: { canModifyCanvas?: boolean },
    opts?: { maxIterations?: number }
) => {
    const binding: CanvasBinding = createInMemoryCanvasBinding({ nodes, edges: [] });
    const gateway = createFakeGateway(script);
    const storage: SessionStore = createInMemorySessionStore();
    const flowId = 'flow-1';
    const agent = createLocatorAgent({
        gateway,
        binding,
        catalog: emptyCatalog,
        storage,
        flowId,
        // Owner-level ceiling — so the `grant` arg (the agent's own grant) is what these tests gate on.
        userPermissions: { canModifyCanvas: true, canEditConfig: true },
        config: grant ? { grant } : undefined,
        maxIterations: opts?.maxIterations,
    });
    const state = (): SessionState => storage.load(flowId) as SessionState;
    const posOf = (id: string) => binding.readGraph().nodes.find(n => n.id === id)?.position;
    const lastAssistant = () => [...state().messages].reverse().find(m => m.role === 'assistant' && m.content);
    return { binding, gateway, storage, flowId, agent, state, posOf, lastAssistant };
};

describe('locator agent — Story 1: relative nudge (headline)', () => {
    it('moves the Fetch node 10px right → (210, 80) and confirms', async () => {
        const { agent, state, posOf, lastAssistant, gateway } = setup(
            [makeNode('n1', 200, 80, { type: 'http', customLabel: 'Fetch' })],
            [
                { toolCalls: [{ name: 'move_node', args: { nodeId: 'n1', by: { dx: 10, dy: 0 } } }] },
                { text: 'Moved Fetch 10px right to (210, 80).' },
            ]
        );

        await agent.send('move the Fetch node 10px to the right');

        expect(posOf('n1')).toEqual({ x: 210, y: 80 });
        expect(state().phase).toBe('done');
        expect(lastAssistant()?.content).toMatch(/Fetch/);
        expect(gateway.isExhausted()).toBe(true);
    });
});

describe('locator agent — Story 2: target not found', () => {
    it('moves nothing and reports it could not find the node', async () => {
        const { agent, state, posOf, lastAssistant } = setup(
            [makeNode('n1', 200, 80, { customLabel: 'Fetch' })],
            [{ text: "I couldn't find a node called Translate. I can see: Fetch." }]
        );

        await agent.send('move the Translate node up 30px');

        expect(posOf('n1')).toEqual({ x: 200, y: 80 });
        expect(state().phase).toBe('done');
        expect(lastAssistant()?.content).toMatch(/could(n't| not) find|Translate/i);
    });

    it('recovers when the model tries a bad id: tool errors, nothing moves', async () => {
        // The model guesses a wrong id, the tool rejects it, and the model apologizes.
        const { agent, state, posOf } = setup(
            [makeNode('n1', 200, 80, { customLabel: 'Fetch' })],
            [
                { toolCalls: [{ name: 'move_node', args: { nodeId: 'ghost', by: { dx: 0, dy: -30 } } }] },
                { text: 'Sorry, I could not find that node.' },
            ]
        );

        await agent.send('move Translate up 30');

        expect(posOf('n1')).toEqual({ x: 200, y: 80 });
        expect(state().phase).toBe('done');
        // the tool result recorded the error (content is JSON, so quotes are escaped)
        const toolMsg = state().messages.find(m => m.role === 'tool');
        expect(toolMsg?.content).toContain('no node with id');
        expect(toolMsg?.content).toContain('ghost');
    });
});

describe('locator agent — additional coverage', () => {
    it('no distance given → moves nothing and asks for one (no default)', async () => {
        // The locator no longer invents a distance (no DEFAULT_STEP). Given no amount it does not move — it
        // replies asking for the exact distance. (Fake-scripted here; a real model is prompted to do this.)
        const { agent, posOf, state, lastAssistant } = setup(
            [makeNode('n1', 50, 50, { customLabel: 'Fetch' })],
            [{ text: 'How far should I nudge Fetch up? Give me an exact distance (e.g. 20px).' }]
        );
        await agent.send('nudge Fetch up');
        expect(posOf('n1')).toEqual({ x: 50, y: 50 }); // unchanged — no default applied
        expect(state().phase).toBe('done');
        const moves = state()
            .messages.flatMap(m => m.toolCalls ?? [])
            .filter(c => c.name === 'move_node');
        expect(moves).toHaveLength(0); // never called move_node
        expect(lastAssistant()?.content).toMatch(/distance|how far|exact/i);
    });

    it('ambiguous reference: model asks, nothing moves', async () => {
        const { agent, state, posOf } = setup(
            [makeNode('a', 0, 0, { customLabel: 'Fetch' }), makeNode('b', 100, 100, { customLabel: 'Fetch' })],
            [{ text: 'There are two nodes labeled Fetch. Which one — the one at (0,0) or (100,100)?' }]
        );
        await agent.send('move Fetch right 10');
        expect(posOf('a')).toEqual({ x: 0, y: 0 });
        expect(posOf('b')).toEqual({ x: 100, y: 100 });
        expect(state().phase).toBe('done');
    });

    it('moves several nodes in one turn (one call each)', async () => {
        const { agent, posOf } = setup(
            [makeNode('n1', 0, 0, { customLabel: 'Fetch' }), makeNode('n2', 0, 0, { customLabel: 'Email' })],
            [
                {
                    toolCalls: [
                        { name: 'move_node', args: { nodeId: 'n1', by: { dx: 10, dy: 0 } } },
                        { name: 'move_node', args: { nodeId: 'n2', by: { dx: 0, dy: 10 } } },
                    ],
                },
                { text: 'Moved both.' },
            ]
        );
        await agent.send('move Fetch right 10 and Email down 10');
        expect(posOf('n1')).toEqual({ x: 10, y: 0 });
        expect(posOf('n2')).toEqual({ x: 0, y: 10 });
    });

    it('pure question: answers without moving', async () => {
        const { agent, state, posOf } = setup(
            [makeNode('n1', 5, 5, { customLabel: 'Fetch' })],
            [{ text: 'There is one node: Fetch at (5, 5).' }]
        );
        await agent.send('what nodes are on the canvas?');
        expect(posOf('n1')).toEqual({ x: 5, y: 5 });
        expect(state().phase).toBe('done');
    });

    it('does not inject the node list; offers get_graph to pull it (Approach 3)', async () => {
        const { agent, gateway } = setup(
            [makeNode('n1', 5, 5, { type: 'http', customLabel: 'Fetch' })],
            [{ text: 'ok' }]
        );
        await agent.send('hi');
        const systemContent = gateway.calls[0].messages
            .filter(m => m.role === 'system')
            .map(m => m.content)
            .join('\n');
        // Approach 3: the live node list is NOT auto-injected — the locator pulls it via get_graph.
        expect(systemContent).not.toMatch(/id="n1"/);
        const toolNames = new Set((gateway.calls[0].tools ?? []).map(t => t.name));
        expect(toolNames.has('get_graph')).toBe(true);
    });

    it('get_graph reflects the updated position after a move (pull, not push)', async () => {
        const { agent, storage, flowId } = setup(
            [makeNode('n1', 0, 0, { customLabel: 'Fetch' })],
            [
                { toolCalls: [{ name: 'move_node', args: { nodeId: 'n1', by: { dx: 10, dy: 0 } } }] },
                { toolCalls: [{ name: 'get_graph', args: {} }] },
                { text: 'done' },
            ]
        );
        await agent.send('move Fetch right 10, then check');
        // Approach 3: the agent pulls; the get_graph result carries the post-move position.
        const toolText = (storage.load(flowId)?.messages ?? [])
            .filter(m => m.role === 'tool')
            .map(m => m.content ?? '')
            .join('\n');
        expect(toolText).toMatch(/\(10, 0\)/);
    });

    it('persists the transcript to storage', async () => {
        const { agent, storage, flowId } = setup(
            [makeNode('n1', 0, 0, { customLabel: 'Fetch' })],
            [{ toolCalls: [{ name: 'move_node', args: { nodeId: 'n1', by: { dx: 1, dy: 1 } } }] }, { text: 'done' }]
        );
        await agent.send('move Fetch');
        const reloaded = storage.load(flowId) as SessionState;
        const roles = reloaded.messages.map(m => m.role);
        expect(roles).toEqual(['user', 'assistant', 'tool', 'assistant']);
    });
});

describe('locator agent — robustness (post-review fixes)', () => {
    it('records per-call status: a failed second call is marked error, not ok', async () => {
        const { agent, state } = setup(
            [makeNode('n1', 0, 0, { customLabel: 'Fetch' })],
            [
                {
                    toolCalls: [
                        { name: 'move_node', args: { nodeId: 'n1', by: { dx: 10, dy: 0 } } }, // ok
                        { name: 'move_node', args: { nodeId: 'ghost', by: { dx: 0, dy: 10 } } }, // error
                    ],
                },
                { text: 'done' },
            ]
        );
        await agent.send('move Fetch and Ghost');
        const assistant = state().messages.find(m => m.role === 'assistant' && m.toolCalls);
        expect(assistant?.toolCalls?.map(c => c.status)).toEqual(['ok', 'error']);
    });

    it('ignores a concurrent send while a turn is in flight (single active turn)', async () => {
        const { agent, state, posOf } = setup(
            [makeNode('n1', 0, 0, { customLabel: 'Fetch' })],
            [{ toolCalls: [{ name: 'move_node', args: { nodeId: 'n1', by: { dx: 10, dy: 0 } } }] }, { text: 'done' }]
        );
        await Promise.all([agent.send('first'), agent.send('second')]);
        const users = state().messages.filter(m => m.role === 'user');
        expect(users).toHaveLength(1);
        expect(users[0].content).toBe('first');
        // The dropped 'second' send did not double-apply the move.
        expect(posOf('n1')).toEqual({ x: 10, y: 0 });
    });

    it('does not apply a move from a response that finished after abort', async () => {
        const binding = createInMemoryCanvasBinding({ nodes: [makeNode('n1', 200, 80)], edges: [] });
        const storage = createInMemorySessionStore();
        let doAbort: () => void = () => undefined;
        const gateway: LlmGateway = {
            async *chat(): AsyncIterable<Chunk> {
                yield {
                    toolCall: {
                        id: 'x',
                        name: 'move_node',
                        argsDelta: JSON.stringify({ nodeId: 'n1', by: { dx: 10, dy: 0 } }),
                    },
                };
                doAbort(); // abort lands while the response is still draining
                yield { done: true };
            },
        };
        const agent = createLocatorAgent({
            gateway,
            binding,
            catalog: emptyCatalog,
            storage,
            flowId: 'f',
            userPermissions: { canModifyCanvas: true },
        });
        doAbort = () => agent.abort();

        await agent.send('move it');

        expect(binding.readGraph().nodes[0].position).toEqual({ x: 200, y: 80 });
        expect((storage.load('f') as SessionState).phase).toBe('done');
    });

    it('leaves an already-applied move applied when aborted on a later iteration', async () => {
        const binding = createInMemoryCanvasBinding({ nodes: [makeNode('n1', 200, 80)], edges: [] });
        const storage = createInMemorySessionStore();
        let doAbort: () => void = () => undefined;
        let calls = 0;
        const gateway: LlmGateway = {
            async *chat(): AsyncIterable<Chunk> {
                calls += 1;
                if (calls === 1) {
                    yield {
                        toolCall: {
                            id: 'x',
                            name: 'move_node',
                            argsDelta: JSON.stringify({ nodeId: 'n1', by: { dx: 10, dy: 0 } }),
                        },
                    };
                    yield { done: true };
                } else {
                    doAbort(); // abort during the follow-up request
                    yield { text: 'stopping' };
                    yield { done: true };
                }
            },
        };
        const agent = createLocatorAgent({
            gateway,
            binding,
            catalog: emptyCatalog,
            storage,
            flowId: 'f',
            userPermissions: { canModifyCanvas: true },
        });
        doAbort = () => agent.abort();

        await agent.send('move it');

        expect(binding.readGraph().nodes[0].position).toEqual({ x: 210, y: 80 }); // first move survived
        expect((storage.load('f') as SessionState).phase).toBe('done');
    });

    it('ends in error when the reasoning iteration cap is exceeded', async () => {
        const { agent, state } = setup(
            [makeNode('n1', 0, 0, { customLabel: 'Fetch' })],
            [
                { toolCalls: [{ name: 'move_node', args: { nodeId: 'n1', by: { dx: 1, dy: 0 } } }] },
                { toolCalls: [{ name: 'move_node', args: { nodeId: 'n1', by: { dx: 1, dy: 0 } } }] },
            ],
            undefined,
            { maxIterations: 2 }
        );
        await agent.send('keep moving');
        expect(state().phase).toBe('error');
        expect(state().error).toMatch(/exceeded 2/);
    });

    it('ends in error when the gateway fails (non-abort)', async () => {
        const binding = createInMemoryCanvasBinding({ nodes: [makeNode('n1', 0, 0)], edges: [] });
        const storage = createInMemorySessionStore();
        const gateway: LlmGateway = {
            chat(): AsyncIterable<Chunk> {
                throw new Error('network boom');
            },
        };
        const agent = createLocatorAgent({
            gateway,
            binding,
            catalog: emptyCatalog,
            storage,
            flowId: 'f',
            userPermissions: { canModifyCanvas: true },
        });
        await agent.send('move it');
        const state = storage.load('f') as SessionState;
        expect(state.phase).toBe('error');
        expect(state.error).toMatch(/network boom/);
    });
});
