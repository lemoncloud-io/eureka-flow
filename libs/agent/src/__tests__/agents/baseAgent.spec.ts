import { describe, expect, it } from 'vitest';

import { collect } from '../../agents/baseAgent';
import { createBuilderAgent } from '../../agents/builderAgent';
import { createInMemoryCanvasBinding } from '../../canvas/inMemoryCanvasBinding';
import { createInMemorySessionStore } from '../../session/session';
import { MOVE_NODE } from '../../tools/nodeTools';
import { createToolExecutor } from '../../tools/toolExecutor';
import { toolset } from '../../tools/toolset';

import type { CatalogLookup } from '../../catalog';
import type { ChatRequest, Chunk, LlmGateway } from '../../llm/llmGateway';

// `LocatorAgent` was retired when node-moving folded into the `builder` (see
// `agents/registrations.ts`); these tests exercise `BaseAgent.send()`'s generic
// thoughtSignature/duplicate-id plumbing, not any persona-specific behavior, so any concrete
// `BaseAgent` subclass proves the same thing — `createBuilderAgent` stands in for it here.
const emptyCatalog: CatalogLookup = { has: () => false, schema: () => undefined, search: () => [] };

/**
 * Regression coverage for Phase 4's "safe handling of duplicate tool-call IDs" requirement.
 *
 * `collect()` accumulates streamed `toolCall.argsDelta` chunks by `id` — correct for the normal
 * case (one call's JSON growing across several chunks). If a provider ever emitted two genuinely
 * distinct tool calls sharing the same `id` (a provider bug, not something any gateway here is
 * known to do), this same merge path would concatenate both calls' argsDelta strings under one
 * call. These tests lock in that the result degrades safely — the model never gets an extra,
 * unintended tool call, and the ToolExecutor's own argument-schema validation rejects the merged
 * result rather than dispatching a mutation built from a stray concatenation.
 */
const chunksFor = (deltas: Array<{ id: string; name: string; argsDelta: string }>): AsyncIterable<Chunk> => {
    async function* gen() {
        for (const toolCall of deltas) {
            yield { toolCall };
        }
    }
    return gen();
};

describe('collect — duplicate tool-call id handling', () => {
    it('merges two chunks sharing an id into exactly one collected tool call, keeping the first name', async () => {
        const result = await collect(
            chunksFor([
                { id: 'call_1', name: 'move_node', argsDelta: '{"nodeId":"a"}' },
                { id: 'call_1', name: 'a_completely_different_tool', argsDelta: '{"nodeId":"b"}' },
            ])
        );

        expect(result.toolCalls).toHaveLength(1);
        expect(result.toolCalls[0].name).toBe('move_node');
    });

    it('produces args that fail to parse as valid JSON when two full JSON payloads collide under one id', async () => {
        const result = await collect(
            chunksFor([
                { id: 'call_1', name: 'move_node', argsDelta: '{"nodeId":"a"}' },
                { id: 'call_1', name: 'move_node', argsDelta: '{"nodeId":"b"}' },
            ])
        );

        expect(result.toolCalls).toHaveLength(1);
        // Two concatenated complete JSON objects are not valid JSON — safeJsonParse falls back to
        // the raw string rather than throwing, so `args` here is a string, not a parsed object.
        expect(typeof result.toolCalls[0].args).toBe('string');
    });

    it('the real ToolExecutor rejects (never dispatches) a merged/garbled duplicate-id call, and the canvas is never mutated', async () => {
        const binding = createInMemoryCanvasBinding({
            nodes: [{ id: 'text-1', type: 'text-input', position: { x: 100, y: 100 } }],
            edges: [],
        });
        const executor = createToolExecutor();
        const config = {
            id: 'test-agent',
            description: 'test',
            systemPrompt: 'test',
            grant: { canModifyCanvas: true },
            tools: [toolset({ binding, catalog: emptyCatalog }, [MOVE_NODE])],
        };

        const collected = await collect(
            chunksFor([
                { id: 'call_1', name: 'move_node', argsDelta: '{"nodeId":"text-1","by":{"dx":10,"dy":0}}' },
                { id: 'call_1', name: 'move_node', argsDelta: '{"nodeId":"text-1","by":{"dx":20,"dy":0}}' },
            ])
        );
        const call = collected.toolCalls[0];

        const result = await executor.dispatch(
            config,
            { id: call.id, name: call.name, args: call.args },
            {
                canModifyCanvas: true,
            }
        );

        expect(result.ok).toBe(false);
        expect(binding.readGraph().nodes.find(n => n.id === 'text-1')?.position).toEqual({ x: 100, y: 100 });
    });
});

/**
 * `thoughtSignature` — an opaque continuation token Gemini's "thinking" model family requires on a
 * replayed functionCall part (see GeminiToolLlmGateway.ts's doc; confirmed live, 2026-08-07, that
 * omitting it causes Gemini to reject the request outright). `collect()` must carry it from the
 * gateway's chunk through to the persisted tool call unmodified, for every other provider (which
 * never sets it) to remain a no-op.
 */
describe('collect — thoughtSignature passthrough', () => {
    const chunksWithSignature = (
        deltas: Array<{ id: string; name: string; argsDelta: string; thoughtSignature?: string }>
    ): AsyncIterable<Chunk> => {
        async function* gen() {
            for (const toolCall of deltas) {
                yield { toolCall };
            }
        }
        return gen();
    };

    it('carries thoughtSignature from a single chunk onto the collected tool call', async () => {
        const result = await collect(
            chunksWithSignature([{ id: 'call_1', name: 'list_nodes', argsDelta: '{}', thoughtSignature: 'sig-abc' }])
        );

        expect(result.toolCalls).toEqual([
            { id: 'call_1', name: 'list_nodes', args: {}, rawArgs: '{}', thoughtSignature: 'sig-abc' },
        ]);
    });

    it('omits thoughtSignature entirely when the gateway never sets it (every non-Gemini provider)', async () => {
        const result = await collect(chunksWithSignature([{ id: 'call_1', name: 'move_node', argsDelta: '{}' }]));

        expect(result.toolCalls[0]).not.toHaveProperty('thoughtSignature');
    });

    it('keeps the first non-undefined thoughtSignature when a later argsDelta chunk for the same id has none', async () => {
        const result = await collect(
            chunksWithSignature([
                { id: 'call_1', name: 'move_node', argsDelta: '{"nodeId":', thoughtSignature: 'sig-first' },
                { id: 'call_1', name: 'move_node', argsDelta: '"text-1"}' },
            ])
        );

        expect(result.toolCalls[0].thoughtSignature).toBe('sig-first');
        expect(result.toolCalls[0].rawArgs).toBe('{"nodeId":"text-1"}');
    });
});

/**
 * `BaseAgent.send()` end-to-end coverage for the two `thoughtSignature` call sites Phase 4A/4B-0's
 * real coverage run found untested: `mapTranscript()` (replaying a PRIOR turn's signature from
 * storage back onto the outgoing gateway request) and the assistant-message builder inside `send()`
 * itself (persisting a signature the gateway just returned). `collect()`'s own passthrough is
 * already covered above — these two exercise the surrounding product path (storage → mapTranscript
 * → gateway request, and gateway response → persisted session state) via the real, public
 * `send()` method on a concrete agent, never by calling either private function directly.
 *
 * A tiny scripted gateway is defined locally (not the shared `fakeGateway.ts`) purely because
 * `FakeGateway`'s `FakeResponse` shape has no way to attach a `thoughtSignature` to a scripted tool
 * call — this is a same-file, additive test double, not a change to `BaseAgent`'s own behavior.
 */

interface ScriptedTurn {
    text?: string;
    toolCalls?: Array<{ id: string; name: string; args: unknown; thoughtSignature?: string }>;
}

/** Records every request it receives and, per call, yields the next scripted turn's chunks. */
const createScriptedGateway = (script: ScriptedTurn[]): LlmGateway & { requests: ChatRequest[] } => {
    const requests: ChatRequest[] = [];
    let cursor = 0;

    return {
        capabilities: { toolCalls: true },
        requests,
        async *chat(req: ChatRequest) {
            requests.push(req);
            const turn = script[Math.min(cursor, script.length - 1)];
            cursor += 1;
            if (turn.text) {
                yield { text: turn.text };
            }
            for (const call of turn.toolCalls ?? []) {
                yield {
                    toolCall: {
                        id: call.id,
                        name: call.name,
                        argsDelta: JSON.stringify(call.args),
                        ...(call.thoughtSignature !== undefined ? { thoughtSignature: call.thoughtSignature } : {}),
                    },
                };
            }
            yield { done: true };
        },
    };
};

describe('BaseAgent.send() — thoughtSignature end-to-end (same-instance replay → gateway request)', () => {
    it("replays a prior turn's thoughtSignature onto a later same-instance turn, unchanged, on the correct call only", async () => {
        const binding = createInMemoryCanvasBinding({ nodes: [], edges: [] });
        const storage = createInMemorySessionStore();
        const flowId = 'flow-sig-replay';

        // Turn 1 emits an assistant turn with two tool calls — one carrying a Gemini "thinking" signature,
        // one a plain call without — then ends. Turn 2 (the SAME instance, so NOT an epoch boundary — a
        // reload/switch would condense and drop the trace) must replay them from storage onto the outgoing
        // request unchanged. A tool that errors is fine: the assistant message (with its signatures) is
        // persisted before dispatch.
        const gateway = createScriptedGateway([
            {
                toolCalls: [
                    { id: 'call_1', name: 'list_nodes', args: {}, thoughtSignature: 'opaque-sig-prior' },
                    { id: 'call_2', name: 'move_node', args: { nodeId: 'x' } },
                ],
            },
            { text: 'listed' }, // ends turn 1
            { text: 'done' }, // turn 2
        ]);
        const agent = createBuilderAgent({
            gateway,
            storage,
            flowId,
            binding,
            catalog: emptyCatalog,
            userPermissions: { canModifyCanvas: true },
        });

        await agent.send('list then move'); // turn 1 → persists the signed tool calls
        await agent.send('what happened?'); // turn 2 → replays them (same instance, full replay)

        const sentMessages = gateway.requests.at(-1)?.messages ?? [];
        const replayedAssistantMsg = sentMessages.find(
            m => m.role === 'assistant' && m.toolCalls?.some(tc => tc.id === 'call_1')
        );
        expect(replayedAssistantMsg).toBeDefined();

        const replayedCall1 = replayedAssistantMsg?.toolCalls?.find(tc => tc.id === 'call_1');
        const replayedCall2 = replayedAssistantMsg?.toolCalls?.find(tc => tc.id === 'call_2');

        // id/name/args survive unchanged, and the signature lands on exactly the right call.
        expect(replayedCall1).toEqual({
            id: 'call_1',
            name: 'list_nodes',
            args: '{}',
            thoughtSignature: 'opaque-sig-prior',
        });
        // The sibling call never had a signature — mapTranscript must not fabricate one for it, nor
        // leak call_1's signature onto it.
        expect(replayedCall2).toEqual({ id: 'call_2', name: 'move_node', args: '{"nodeId":"x"}' });
        expect(replayedCall2).not.toHaveProperty('thoughtSignature');
    });

    it('omits thoughtSignature on replay when the tool call never had one (every non-Gemini session)', async () => {
        const binding = createInMemoryCanvasBinding({ nodes: [], edges: [] });
        const storage = createInMemorySessionStore();
        const flowId = 'flow-no-sig';

        const gateway = createScriptedGateway([
            { toolCalls: [{ id: 'call_1', name: 'list_nodes', args: {} }] }, // no signature
            { text: 'ok' }, // ends turn 1
            { text: 'done' }, // turn 2
        ]);
        const agent = createBuilderAgent({
            gateway,
            storage,
            flowId,
            binding,
            catalog: emptyCatalog,
            userPermissions: { canModifyCanvas: true },
        });

        await agent.send('go');
        await agent.send('continue');

        const sentMessages = gateway.requests.at(-1)?.messages ?? [];
        const replayedAssistantMsg = sentMessages.find(
            m => m.role === 'assistant' && m.toolCalls?.some(tc => tc.id === 'call_1')
        );
        expect(replayedAssistantMsg?.toolCalls?.[0]).not.toHaveProperty('thoughtSignature');
    });
});

describe('BaseAgent.send() — thoughtSignature end-to-end (gateway response → persisted session state)', () => {
    it('persists thoughtSignature from a gateway tool-call chunk onto the saved assistant message', async () => {
        const binding = createInMemoryCanvasBinding({ nodes: [], edges: [] });
        const storage = createInMemorySessionStore();
        const flowId = 'flow-persist-test';

        const gateway = createScriptedGateway([
            { toolCalls: [{ id: 'call_1', name: 'list_nodes', args: {}, thoughtSignature: 'opaque-sig-new' }] },
            { text: 'done' },
        ]);
        const agent = createBuilderAgent({
            gateway,
            storage,
            flowId,
            binding,
            catalog: emptyCatalog,
            userPermissions: { canModifyCanvas: true },
        });

        await agent.send('what nodes are there?');

        const state = storage.load(flowId);
        const persistedAssistantMsg = state?.messages.find(m => m.role === 'assistant' && m.toolCalls?.length);
        expect(persistedAssistantMsg?.toolCalls).toEqual([
            { id: 'call_1', name: 'list_nodes', args: '{}', status: 'ok', thoughtSignature: 'opaque-sig-new' },
        ]);
    });

    it('leaves thoughtSignature absent (never undefined-as-data, never invented) when the gateway chunk never carried one', async () => {
        const binding = createInMemoryCanvasBinding({ nodes: [], edges: [] });
        const storage = createInMemorySessionStore();
        const flowId = 'flow-persist-no-signature';

        const gateway = createScriptedGateway([
            { toolCalls: [{ id: 'call_1', name: 'list_nodes', args: {} }] },
            { text: 'done' },
        ]);
        const agent = createBuilderAgent({
            gateway,
            storage,
            flowId,
            binding,
            catalog: emptyCatalog,
            userPermissions: { canModifyCanvas: true },
        });

        await agent.send('go');

        const state = storage.load(flowId);
        const persistedAssistantMsg = state?.messages.find(m => m.role === 'assistant' && m.toolCalls?.length);
        expect(persistedAssistantMsg?.toolCalls?.[0]).not.toHaveProperty('thoughtSignature');
        expect(persistedAssistantMsg?.toolCalls?.[0]).toEqual({
            id: 'call_1',
            name: 'list_nodes',
            args: '{}',
            status: 'ok',
        });
    });

    it('keeps first-wins merge behavior unchanged when the gateway streams a duplicate-id tool call split across chunks with a signature on the first', async () => {
        // Exercises collect()'s Map-based accumulation (already covered above) through the full
        // send() path, confirming BaseAgent's persistence layer doesn't re-derive or drop what
        // collect() already resolved.
        const binding = createInMemoryCanvasBinding({ nodes: [], edges: [] });
        const storage = createInMemorySessionStore();
        const flowId = 'flow-persist-merge';

        const splitChunkGateway: LlmGateway & { requests: ChatRequest[] } = {
            capabilities: { toolCalls: true },
            requests: [],
            async *chat(req) {
                this.requests.push(req);
                if (this.requests.length === 1) {
                    yield {
                        toolCall: {
                            id: 'call_1',
                            name: 'list_nodes',
                            argsDelta: '{}',
                            thoughtSignature: 'sig-first-chunk',
                        },
                    };
                    yield { toolCall: { id: 'call_1', name: 'list_nodes', argsDelta: '' } };
                    yield { done: true };
                } else {
                    yield { text: 'done' };
                    yield { done: true };
                }
            },
        };

        const agent = createBuilderAgent({
            gateway: splitChunkGateway,
            storage,
            flowId,
            binding,
            catalog: emptyCatalog,
            userPermissions: { canModifyCanvas: true },
        });

        await agent.send('go');

        const state = storage.load(flowId);
        const persistedAssistantMsg = state?.messages.find(m => m.role === 'assistant' && m.toolCalls?.length);
        expect(persistedAssistantMsg?.toolCalls).toHaveLength(1);
        expect(persistedAssistantMsg?.toolCalls?.[0].thoughtSignature).toBe('sig-first-chunk');
    });
});

describe('BaseAgent.send() — capabilities.toolCalls: false suppresses tool definitions', () => {
    it('sends an empty tools array to a gateway that declares it cannot act on tool calls', async () => {
        const binding = createInMemoryCanvasBinding({ nodes: [], edges: [] });
        const storage = createInMemorySessionStore();
        const flowId = 'flow-no-tool-calls';

        const requests: ChatRequest[] = [];
        const gateway: LlmGateway = {
            capabilities: { toolCalls: false },
            async *chat(req: ChatRequest) {
                requests.push(req);
                yield { text: 'ok' };
                yield { done: true };
            },
        };

        const agent = createBuilderAgent({
            gateway,
            storage,
            flowId,
            binding,
            catalog: emptyCatalog,
            userPermissions: { canModifyCanvas: true },
        });

        await agent.send('hello');

        // The gateway declared toolCalls: false, so send() must skip executor.listTools(config)
        // entirely and send [] — never the builder's real, non-empty tool list.
        expect(requests).toHaveLength(1);
        expect(requests[0].tools).toEqual([]);
    });
});
