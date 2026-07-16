import { describe, expect, it } from 'vitest';

import { createLocatorAgent } from './locatorAgent';
import { createInMemoryCanvasBinding } from '../canvas/inMemoryCanvasBinding';
import { createFakeGateway } from '../llm/fakeGateway';
import { createInMemoryStorage } from '../session/session';

import type { CanvasBinding } from '../canvas/canvasBinding';
import type { FakeScriptStep } from '../llm/fakeGateway';
import type { Chunk, LlmGateway } from '../llm/llmGateway';
import type { SessionState, Storage } from '../session/session';
import type { NodeData } from '@lemoncloud/eureka-flows-api';

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
    const storage: Storage = createInMemoryStorage();
    const flowId = 'flow-1';
    const agent = createLocatorAgent({
        gateway,
        binding,
        storage,
        flowId,
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

    it('does not move any other node', async () => {
        const { agent, posOf } = setup(
            [makeNode('n1', 200, 80, { customLabel: 'Fetch' }), makeNode('n2', 400, 400, { customLabel: 'Email' })],
            [{ toolCalls: [{ name: 'move_node', args: { nodeId: 'n1', by: { dx: 10, dy: 0 } } }] }, { text: 'done' }]
        );
        await agent.send('move Fetch right 10');
        expect(posOf('n1')).toEqual({ x: 210, y: 80 });
        expect(posOf('n2')).toEqual({ x: 400, y: 400 });
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
    it('absolute move: put Email at (100, 100)', async () => {
        const { agent, posOf } = setup(
            [makeNode('e1', 300, 300, { customLabel: 'Email' })],
            [{ toolCalls: [{ name: 'move_node', args: { nodeId: 'e1', to: { x: 100, y: 100 } } }] }, { text: 'ok' }]
        );
        await agent.send('put the Email node at x=100, y=100');
        expect(posOf('e1')).toEqual({ x: 100, y: 100 });
    });

    it('vague amount uses the 20px default (model emits dy:-20)', async () => {
        const { agent, posOf } = setup(
            [makeNode('n1', 50, 50, { customLabel: 'Fetch' })],
            [
                { toolCalls: [{ name: 'move_node', args: { nodeId: 'n1', by: { dx: 0, dy: -20 } } }] },
                { text: 'nudged up 20px' },
            ]
        );
        await agent.send('nudge Fetch up');
        expect(posOf('n1')).toEqual({ x: 50, y: 30 });
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

    it('seeds the model with the current node list on the first request', async () => {
        const { agent, gateway } = setup(
            [makeNode('n1', 5, 5, { type: 'http', customLabel: 'Fetch' })],
            [{ text: 'ok' }]
        );
        await agent.send('hi');
        const systemContent = gateway.calls[0].messages
            .filter(m => m.role === 'system')
            .map(m => m.content)
            .join('\n');
        expect(systemContent).toMatch(/id="n1"/);
        expect(systemContent).toMatch(/Fetch/);
    });

    it('re-seeds updated positions on the second request within a turn', async () => {
        const { agent, gateway } = setup(
            [makeNode('n1', 0, 0, { customLabel: 'Fetch' })],
            [{ toolCalls: [{ name: 'move_node', args: { nodeId: 'n1', by: { dx: 10, dy: 0 } } }] }, { text: 'done' }]
        );
        await agent.send('move Fetch right 10');
        const secondReqSystem = gateway.calls[1].messages
            .filter(m => m.role === 'system')
            .map(m => m.content)
            .join('\n');
        expect(secondReqSystem).toMatch(/\(10, 0\)/);
    });

    it('permission gate: without canModifyCanvas the move is denied and nothing changes', async () => {
        const { agent, posOf, state } = setup(
            [makeNode('n1', 200, 80, { customLabel: 'Fetch' })],
            [
                { toolCalls: [{ name: 'move_node', args: { nodeId: 'n1', by: { dx: 10, dy: 0 } } }] },
                { text: 'I was not allowed to move it.' },
            ],
            { canModifyCanvas: false }
        );
        await agent.send('move Fetch right 10');
        expect(posOf('n1')).toEqual({ x: 200, y: 80 });
        const toolMsg = state().messages.find(m => m.role === 'tool');
        expect(toolMsg?.content).toMatch(/permission denied/);
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
        const storage = createInMemoryStorage();
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
        const agent = createLocatorAgent({ gateway, binding, storage, flowId: 'f' });
        doAbort = () => agent.abort();

        await agent.send('move it');

        expect(binding.readGraph().nodes[0].position).toEqual({ x: 200, y: 80 });
        expect((storage.load('f') as SessionState).phase).toBe('done');
    });

    it('leaves an already-applied move applied when aborted on a later iteration', async () => {
        const binding = createInMemoryCanvasBinding({ nodes: [makeNode('n1', 200, 80)], edges: [] });
        const storage = createInMemoryStorage();
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
        const agent = createLocatorAgent({ gateway, binding, storage, flowId: 'f' });
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
        const storage = createInMemoryStorage();
        const gateway: LlmGateway = {
            chat(): AsyncIterable<Chunk> {
                throw new Error('network boom');
            },
        };
        const agent = createLocatorAgent({ gateway, binding, storage, flowId: 'f' });
        await agent.send('move it');
        const state = storage.load('f') as SessionState;
        expect(state.phase).toBe('error');
        expect(state.error).toMatch(/network boom/);
    });
});
