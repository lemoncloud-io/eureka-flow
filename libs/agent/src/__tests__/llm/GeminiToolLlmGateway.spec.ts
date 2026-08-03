import { describe, expect, it } from 'vitest';

import { createInMemoryCanvasBinding } from '../../canvas/inMemoryCanvasBinding';
import { createCatalogLookup } from '../../catalog';
import { createVirtualAgentEnvironment } from '../../environment/createVirtualAgentEnvironment';
import { BufferAgentTraceReporter } from '../../environment/trace/traceReporters';
import { ScriptedHttpRequest } from '../../http/ScriptedHttpRequest';
import { createGeminiToolLlmGateway } from '../../llm/GeminiToolLlmGateway';
import { PRICING_CONFIG_VERSION, estimateCost, getModelPricing } from '../../llm/pricing';
import { createNodeMoveToolProvider, createNodeReadToolProvider } from '../../tools/nodeTools';
import { createToolExecutor } from '../../tools/toolExecutor';

import type { AgentConfig } from '../../agent';
import type { Chunk } from '../../llm/llmGateway';
import type { NodeData } from '@lemoncloud/eureka-flows-api';

const API_KEY = 'test-gemini-key';

/** A canned Gemini text reply. */
const geminiText = (text: string) => ({
    candidates: [{ content: { parts: [{ text }] } }],
    usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 34 },
});

/** A canned Gemini function-call reply. `args` is a parsed object (Gemini's native shape). */
const geminiFunctionCall = (name: string, args: unknown) => ({
    candidates: [{ content: { parts: [{ functionCall: { name, args } }] } }],
    usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 8 },
});

const createGateway = (http: ScriptedHttpRequest, traceReporter?: BufferAgentTraceReporter) =>
    createGeminiToolLlmGateway({
        environment: createVirtualAgentEnvironment({ ...(traceReporter ? { traceReporter } : {}), now: () => 1000 }),
        http,
        apiKey: API_KEY,
    });

const drain = async (stream: AsyncIterable<Chunk>): Promise<Chunk[]> => {
    const chunks: Chunk[] = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return chunks;
};

const userSays = (content: string) => ({ messages: [{ role: 'user' as const, content }], tools: [] });

/** Every offline test below uses the default model (`gemini-2.5-flash`, registered/priced in
 * pricing.ts), so every done chunk now also carries a computed `estimatedCost`/`costSource` on
 * top of the plain token counts — expected here via the same `estimateCost` pricing.spec.ts
 * verifies in isolation, not a hand-typed literal that would silently drift from pricing.ts. */
const withGeminiCost = (usage: { inputTokens: number; outputTokens: number }) => ({
    ...usage,
    estimatedCost: estimateCost('gemini', 'gemini-2.5-flash', usage),
    costSource: 'estimated' as const,
    pricingVersion: PRICING_CONFIG_VERSION,
});

const makeNode = (id: string, x: number, y: number, extra: Partial<NodeData> = {}): NodeData => ({
    id,
    type: 'test',
    position: { x, y },
    ...extra,
});

describe('createGeminiToolLlmGateway', () => {
    it('declares itself a tool-capable gemini gateway with the default model', () => {
        const gateway = createGateway(new ScriptedHttpRequest());

        expect(gateway.capabilities).toEqual({ toolCalls: true });
        expect(gateway.provider).toBe('gemini');
        expect(gateway.model).toBe('gemini-2.5-flash');
    });

    it('authenticates via header, never the URL, and posts to generateContent', async () => {
        const http = new ScriptedHttpRequest([{ json: geminiText('hi') }]);

        await drain(createGateway(http).chat(userSays('hello')));

        const request = http.requests[0];
        expect(request.method).toBe('POST');
        expect(request.url).toBe(
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'
        );
        expect(request.url).not.toContain(API_KEY);
        expect(request.headers?.['x-goog-api-key']).toBe(API_KEY);
    });

    it('maps ToolDef into functionDeclarations with UPPERCASE schema types (recursively)', async () => {
        const http = new ScriptedHttpRequest([{ json: geminiText('ok') }]);

        await drain(
            createGateway(http).chat({
                messages: [{ role: 'user', content: 'move it' }],
                tools: [
                    {
                        name: 'move_node',
                        description: 'move a node',
                        parameters: {
                            type: 'object',
                            properties: {
                                nodeId: { type: 'string' },
                                by: {
                                    type: 'object',
                                    properties: { dx: { type: 'number' }, dy: { type: 'number' } },
                                    required: ['dx', 'dy'],
                                },
                            },
                            required: ['nodeId'],
                        },
                    },
                ],
            })
        );

        const body = http.requests[0].body as Record<string, unknown>;
        expect(body['tools']).toEqual([
            {
                functionDeclarations: [
                    {
                        name: 'move_node',
                        description: 'move a node',
                        parameters: {
                            type: 'OBJECT',
                            properties: {
                                nodeId: { type: 'STRING' },
                                by: {
                                    type: 'OBJECT',
                                    properties: { dx: { type: 'NUMBER' }, dy: { type: 'NUMBER' } },
                                    required: ['dx', 'dy'],
                                },
                            },
                            required: ['nodeId'],
                        },
                    },
                ],
            },
        ]);
    });

    it('maps system messages to systemInstruction and omits tools when none are given', async () => {
        const http = new ScriptedHttpRequest([{ json: geminiText('ok') }]);

        await drain(
            createGateway(http).chat({
                messages: [
                    { role: 'system', content: 'be brief' },
                    { role: 'user', content: 'q' },
                ],
                tools: [],
            })
        );

        const body = http.requests[0].body as Record<string, unknown>;
        expect(body['systemInstruction']).toEqual({ parts: [{ text: 'be brief' }] });
        expect(body).not.toHaveProperty('tools');
    });

    it('yields a text chunk then a done chunk carrying usage', async () => {
        const http = new ScriptedHttpRequest([{ json: geminiText('the answer') }]);

        const chunks = await drain(createGateway(http).chat(userSays('q')));

        expect(chunks).toEqual([{ text: 'the answer' }, { done: true, usage: withGeminiCost({ inputTokens: 12, outputTokens: 34 }) }]);
    });

    it('parses a functionCall part into a toolCall chunk (args object → JSON string argsDelta)', async () => {
        const http = new ScriptedHttpRequest([
            { json: geminiFunctionCall('move_node', { nodeId: 'text-1', by: { dx: 100, dy: 0 } }) },
        ]);

        const chunks = await drain(createGateway(http).chat(userSays('move the text input 100 right')));

        expect(chunks).toEqual([
            {
                toolCall: {
                    id: 'gemini-call-1',
                    name: 'move_node',
                    argsDelta: '{"nodeId":"text-1","by":{"dx":100,"dy":0}}',
                },
            },
            { done: true, usage: withGeminiCost({ inputTokens: 20, outputTokens: 8 }) },
        ]);
    });

    describe('multi-turn request-mapping', () => {
        it('maps an assistant tool-call message into a model-role functionCall part, args parsed from the JSON args string', async () => {
            const http = new ScriptedHttpRequest([{ json: geminiText('ok') }]);

            await drain(
                createGateway(http).chat({
                    messages: [
                        { role: 'user', content: 'move it' },
                        {
                            role: 'assistant',
                            content: null,
                            toolCalls: [{ id: 'c1', name: 'move_node', args: '{"nodeId":"text-1"}' }],
                        },
                    ],
                    tools: [],
                })
            );

            const body = http.requests[0].body as Record<string, unknown>;
            const contents = body['contents'] as Array<Record<string, unknown>>;
            expect(contents[1]).toEqual({
                role: 'model',
                parts: [{ functionCall: { name: 'move_node', args: { nodeId: 'text-1' } } }],
            });
        });

        it('maps an assistant turn with both text and a tool call into a leading text part plus a functionCall part', async () => {
            const http = new ScriptedHttpRequest([{ json: geminiText('ok') }]);

            await drain(
                createGateway(http).chat({
                    messages: [
                        { role: 'user', content: 'move it' },
                        {
                            role: 'assistant',
                            content: "I'll move it now.",
                            toolCalls: [{ id: 'c1', name: 'move_node', args: '{"nodeId":"text-1"}' }],
                        },
                    ],
                    tools: [],
                })
            );

            const body = http.requests[0].body as Record<string, unknown>;
            const contents = body['contents'] as Array<Record<string, unknown>>;
            expect(contents[1]).toEqual({
                role: 'model',
                parts: [
                    { text: "I'll move it now." },
                    { functionCall: { name: 'move_node', args: { nodeId: 'text-1' } } },
                ],
            });
        });

        it('maps a tool-result message into a user-role functionResponse part, correlated by NAME recovered from the earlier assistant tool-call message', async () => {
            const http = new ScriptedHttpRequest([{ json: geminiText('ok') }]);

            await drain(
                createGateway(http).chat({
                    messages: [
                        { role: 'user', content: 'move it' },
                        {
                            role: 'assistant',
                            content: null,
                            toolCalls: [{ id: 'c1', name: 'move_node', args: '{}' }],
                        },
                        { role: 'tool', content: '{"ok":true}', toolCallId: 'c1' },
                    ],
                    tools: [],
                })
            );

            const body = http.requests[0].body as Record<string, unknown>;
            const contents = body['contents'] as Array<Record<string, unknown>>;
            // Gemini has no separate role for tool results — a functionResponse part is a *user*
            // turn, and it carries the function's NAME (recovered from the id-keyed lookup), not
            // the id itself — Gemini's wire format has no concept of a call id at all.
            expect(contents[2]).toEqual({
                role: 'user',
                parts: [{ functionResponse: { name: 'move_node', response: { ok: true } } }],
            });
        });

        it('produces the correct multi-turn body shape for a full multi-turn round trip (system + user + model functionCall + user functionResponse)', async () => {
            const http = new ScriptedHttpRequest([{ json: geminiText('ok') }]);

            await drain(
                createGateway(http).chat({
                    messages: [
                        { role: 'system', content: 'sys' },
                        { role: 'user', content: 'go' },
                        {
                            role: 'assistant',
                            content: null,
                            toolCalls: [{ id: 'c1', name: 'list_nodes', args: '{}' }],
                        },
                        { role: 'tool', content: '{"nodes":[]}', toolCallId: 'c1' },
                    ],
                    tools: [],
                })
            );

            const body = http.requests[0].body as Record<string, unknown>;
            expect(body['systemInstruction']).toEqual({ parts: [{ text: 'sys' }] });
            expect(body['contents']).toEqual([
                { role: 'user', parts: [{ text: 'go' }] },
                { role: 'model', parts: [{ functionCall: { name: 'list_nodes', args: {} } }] },
                { role: 'user', parts: [{ functionResponse: { name: 'list_nodes', response: { nodes: [] } } }] },
            ]);
        });

        it('throws a clear error — not a silent guess — when a tool-result toolCallId has no matching assistant tool-call entry earlier in the request', async () => {
            const gateway = createGateway(new ScriptedHttpRequest());

            await expect(
                drain(
                    gateway.chat({
                        messages: [{ role: 'tool', content: '{}', toolCallId: 'unknown-id' }],
                        tools: [],
                    })
                )
            ).rejects.toThrow(/no matching function-call name found for toolCallId "unknown-id"/);
        });
    });

    describe('response parsing on the turn immediately following a functionResponse', () => {
        const followUpRequest = () => ({
            messages: [
                { role: 'user' as const, content: 'go' },
                {
                    role: 'assistant' as const,
                    content: null,
                    toolCalls: [{ id: 'c1', name: 'list_nodes', args: '{}' }],
                },
                { role: 'tool' as const, content: '{}', toolCallId: 'c1' },
            ],
            tools: [],
        });

        it('parses a plain text response correctly', async () => {
            const http = new ScriptedHttpRequest([{ json: geminiText('Moved it.') }]);

            const chunks = await drain(createGateway(http).chat(followUpRequest()));

            expect(chunks).toEqual([
                { text: 'Moved it.' },
                { done: true, usage: withGeminiCost({ inputTokens: 12, outputTokens: 34 }) },
            ]);
        });

        it('parses a second functionCall response correctly', async () => {
            const http = new ScriptedHttpRequest([
                { json: geminiFunctionCall('move_node', { nodeId: 'text-1', by: { dx: 0, dy: 50 } }) },
            ]);

            const chunks = await drain(createGateway(http).chat(followUpRequest()));

            expect(chunks).toEqual([
                {
                    toolCall: {
                        id: 'gemini-call-1',
                        name: 'move_node',
                        argsDelta: '{"nodeId":"text-1","by":{"dx":0,"dy":50}}',
                    },
                },
                { done: true, usage: withGeminiCost({ inputTokens: 20, outputTokens: 8 }) },
            ]);
        });
    });

    describe('usage/cost mapping', () => {
        it('subtracts cachedContentTokenCount from promptTokenCount for inputTokens — never double-counted', async () => {
            const http = new ScriptedHttpRequest([
                {
                    json: {
                        candidates: [{ content: { parts: [{ text: 'ok' }] } }],
                        usageMetadata: {
                            promptTokenCount: 1000, // already includes the 300 cached below
                            cachedContentTokenCount: 300,
                            candidatesTokenCount: 50,
                        },
                    },
                },
            ]);

            const chunks = await drain(createGateway(http).chat(userSays('q')));
            const done = chunks.find(c => c.done);

            // 700, not 1000 — cachedContentTokenCount is a SUBSET of promptTokenCount (Google's own
            // context-caching docs), so it must be subtracted, never left in on top of cachedInputTokens.
            expect(done?.usage?.inputTokens).toBe(700);
            expect(done?.usage?.cachedInputTokens).toBe(300);
        });

        it('clamps inputTokens to 0 rather than going negative if cachedContentTokenCount ever exceeded promptTokenCount', async () => {
            const http = new ScriptedHttpRequest([
                {
                    json: {
                        candidates: [{ content: { parts: [{ text: 'ok' }] } }],
                        usageMetadata: { promptTokenCount: 100, cachedContentTokenCount: 150, candidatesTokenCount: 10 },
                    },
                },
            ]);

            const chunks = await drain(createGateway(http).chat(userSays('q')));
            const done = chunks.find(c => c.done);

            expect(done?.usage?.inputTokens).toBe(0);
        });

        it('maps thoughtsTokenCount to reasoningTokens, kept separate from candidatesTokenCount (visible output)', async () => {
            const http = new ScriptedHttpRequest([
                {
                    json: {
                        candidates: [{ content: { parts: [{ text: 'ok' }] } }],
                        usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 20, thoughtsTokenCount: 500 },
                    },
                },
            ]);

            const chunks = await drain(createGateway(http).chat(userSays('q')));
            const done = chunks.find(c => c.done);

            expect(done?.usage?.outputTokens).toBe(20);
            expect(done?.usage?.reasoningTokens).toBe(500);
        });

        it('maps toolUsePromptTokenCount to toolUseInputTokens WITHOUT folding it into inputTokens', async () => {
            const http = new ScriptedHttpRequest([
                {
                    json: {
                        candidates: [{ content: { parts: [{ text: 'ok' }] } }],
                        usageMetadata: {
                            promptTokenCount: 100,
                            candidatesTokenCount: 20,
                            toolUsePromptTokenCount: 75,
                        },
                    },
                },
            ]);

            const chunks = await drain(createGateway(http).chat(userSays('q')));
            const done = chunks.find(c => c.done);

            // Google's own docs: totalTokenCount = prompt + candidates + toolUsePrompt + thoughts —
            // four separate additive terms. toolUsePromptTokenCount is NOT nested inside
            // promptTokenCount, so inputTokens must stay the full 100, not 100 - 75.
            expect(done?.usage?.inputTokens).toBe(100);
            expect(done?.usage?.toolUseInputTokens).toBe(75);
        });

        it('passes providerTotalTokens through as the raw totalTokenCount, never recomputed locally', async () => {
            const http = new ScriptedHttpRequest([
                {
                    json: {
                        candidates: [{ content: { parts: [{ text: 'ok' }] } }],
                        usageMetadata: {
                            promptTokenCount: 100,
                            cachedContentTokenCount: 20,
                            candidatesTokenCount: 30,
                            thoughtsTokenCount: 10,
                            toolUsePromptTokenCount: 5,
                            totalTokenCount: 145, // 100 + 30 + 5 + 10 (per Google's own composition)
                        },
                    },
                },
            ]);

            const chunks = await drain(createGateway(http).chat(userSays('q')));
            const done = chunks.find(c => c.done);

            expect(done?.usage?.providerTotalTokens).toBe(145);
        });

        it('computes estimatedCost across every bucket (uncached + cached + output + reasoning + tool-use)', async () => {
            const http = new ScriptedHttpRequest([
                {
                    json: {
                        candidates: [{ content: { parts: [{ text: 'ok' }] } }],
                        usageMetadata: {
                            promptTokenCount: 1_000_000, // 700k uncached + 300k cached, after subtraction
                            cachedContentTokenCount: 300_000,
                            candidatesTokenCount: 100_000,
                            thoughtsTokenCount: 50_000,
                            toolUsePromptTokenCount: 10_000,
                        },
                    },
                },
            ]);

            const chunks = await drain(createGateway(http).chat(userSays('q')));
            const done = chunks.find(c => c.done);

            const pricing = getModelPricing('gemini', 'gemini-2.5-flash');
            if (!pricing?.cachedInputPerMillion) throw new Error('expected gemini-2.5-flash pricing with a cached rate');
            const expected =
                0.7 * pricing.inputPerMillion +
                0.3 * pricing.cachedInputPerMillion +
                0.1 * pricing.outputPerMillion +
                0.05 * pricing.outputPerMillion +
                0.01 * pricing.inputPerMillion;

            expect(done?.usage?.estimatedCost).toBeCloseTo(expected, 10);
            expect(done?.usage?.costSource).toBe('estimated');
        });

        it('returns estimatedCost: null (not a fabricated 0) for an unregistered model, while still reporting tokens', async () => {
            const http = new ScriptedHttpRequest([{ json: geminiText('ok') }]);
            const gateway = createGeminiToolLlmGateway({
                environment: createVirtualAgentEnvironment(),
                http,
                apiKey: API_KEY,
                model: 'gemini-does-not-exist',
            });

            const chunks = await drain(gateway.chat(userSays('q')));
            const done = chunks.find(c => c.done);

            expect(done?.usage?.inputTokens).toBe(12);
            expect(done?.usage?.estimatedCost).toBeNull();
            expect(done?.usage).not.toHaveProperty('costSource');
        });
    });

    it('honors model and baseUrl overrides (the proxy path)', async () => {
        const http = new ScriptedHttpRequest([{ json: geminiText('ok') }]);
        const gateway = createGeminiToolLlmGateway({
            environment: createVirtualAgentEnvironment(),
            http,
            apiKey: API_KEY,
            model: 'gemini-2.5-pro',
            baseUrl: 'https://proxy.example.com/gemini',
        });

        await drain(gateway.chat(userSays('q')));

        expect(http.requests[0].url).toBe('https://proxy.example.com/gemini/v1beta/models/gemini-2.5-pro:generateContent');
    });

    it('passes the abort signal through to the HTTP port', async () => {
        const http = new ScriptedHttpRequest([{ json: geminiText('ok') }]);
        const controller = new AbortController();

        await drain(createGateway(http).chat(userSays('q'), { signal: controller.signal }));

        expect(http.requests[0].signal).toBe(controller.signal);
    });

    it('throws on non-ok responses with the status but never the API key, and traces the error', async () => {
        const http = new ScriptedHttpRequest([{ status: 400, text: `bad key ${API_KEY}` }]);
        const trace = new BufferAgentTraceReporter();

        const attempt = drain(createGateway(http, trace).chat(userSays('q')));

        await expect(attempt).rejects.toThrow(/status 400.*bad key \[redacted\]/);
        await attempt.catch((error: Error) => expect(error.message).not.toContain(API_KEY));
        expect(trace.entries.some(entry => entry.level === 'error')).toBe(true);
        expect(JSON.stringify(trace.entries)).not.toContain(API_KEY);
    });

    it('throws when the response has no candidates, with no diagnostic metadata to show', async () => {
        const http = new ScriptedHttpRequest([{ json: { candidates: [] } }]);

        await expect(drain(createGateway(http).chat(userSays('q')))).rejects.toThrow(
            /no candidates or no usable content parts \(no diagnostic metadata present\)/
        );
    });

    it('surfaces promptFeedback.blockReason when candidates is empty', async () => {
        const http = new ScriptedHttpRequest([{ json: { candidates: [], promptFeedback: { blockReason: 'SAFETY' } } }]);

        await expect(drain(createGateway(http).chat(userSays('q')))).rejects.toThrow(
            /promptFeedback\.blockReason=SAFETY/
        );
    });

    it('surfaces a candidate finishReason when it has no usable content parts', async () => {
        const http = new ScriptedHttpRequest([{ json: { candidates: [{ finishReason: 'SAFETY' }] } }]);

        await expect(drain(createGateway(http).chat(userSays('q')))).rejects.toThrow(/finishReason=SAFETY/);
    });

    it('surfaces a candidate finishReason for a candidate with empty content.parts', async () => {
        const http = new ScriptedHttpRequest([
            { json: { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [] } }] } },
        ]);

        await expect(drain(createGateway(http).chat(userSays('q')))).rejects.toThrow(/finishReason=MAX_TOKENS/);
    });

    it('surfaces safety ratings safely as category:probability:blocked', async () => {
        const http = new ScriptedHttpRequest([
            {
                json: {
                    candidates: [
                        {
                            finishReason: 'SAFETY',
                            safetyRatings: [
                                { category: 'HARM_CATEGORY_HARASSMENT', probability: 'HIGH', blocked: true },
                                { category: 'HARM_CATEGORY_HATE_SPEECH', probability: 'NEGLIGIBLE' },
                            ],
                        },
                    ],
                    promptFeedback: {
                        safetyRatings: [{ category: 'HARM_CATEGORY_DANGEROUS_CONTENT', probability: 'LOW' }],
                    },
                },
            },
        ]);

        const attempt = drain(createGateway(http).chat(userSays('q')));

        await expect(attempt).rejects.toThrow(
            /candidate\.safetyRatings=\[HARM_CATEGORY_HARASSMENT:HIGH:blocked, HARM_CATEGORY_HATE_SPEECH:NEGLIGIBLE\]/
        );
        await expect(attempt.catch((error: Error) => error.message)).resolves.toMatch(
            /promptFeedback\.safetyRatings=\[HARM_CATEGORY_DANGEROUS_CONTENT:LOW\]/
        );
    });

    it('never leaks the API key through the no-candidates diagnostic error, even if the provider echoed it back', async () => {
        const http = new ScriptedHttpRequest([
            { json: { candidates: [], promptFeedback: { blockReason: `leaked ${API_KEY}` } } },
        ]);

        const attempt = drain(createGateway(http).chat(userSays('q')));

        await expect(attempt).rejects.toThrow(/leaked \[redacted\]/);
        await attempt.catch((error: Error) => expect(error.message).not.toContain(API_KEY));
    });

    it('traces request and response without leaking the key', async () => {
        const http = new ScriptedHttpRequest([{ json: geminiText('traced') }]);
        const trace = new BufferAgentTraceReporter();

        await drain(createGateway(http, trace).chat(userSays('q')));

        const messages = trace.entries.map(entry => entry.message);
        expect(messages).toContain('llm.gemini.request');
        expect(messages).toContain('llm.gemini.response');
        expect(JSON.stringify(trace.entries)).not.toContain(API_KEY);
    });

    // The full offline chain: a canned Gemini functionCall flows through the gateway's parsing
    // into a Chunk.toolCall, then through the real ToolExecutor + canvas tools, moving the node.
    it('canned functionCall response drives ToolExecutor to move the node (100,200) -> (200,200)', async () => {
        const binding = createInMemoryCanvasBinding({
            nodes: [makeNode('text-1', 100, 200, { type: 'text-input' })],
            edges: [],
        });
        const provider = [
            createNodeReadToolProvider(binding, createCatalogLookup([])),
            createNodeMoveToolProvider(binding),
        ];
        const executor = createToolExecutor();
        const config: AgentConfig = {
            id: 'locator-test',
            description: 'moves nodes',
            systemPrompt: 'move nodes on the canvas',
            tools: provider,
            grant: { canModifyCanvas: true },
        };

        const http = new ScriptedHttpRequest([
            { json: geminiFunctionCall('move_node', { nodeId: 'text-1', by: { dx: 100, dy: 0 } }) },
        ]);

        const chunks = await drain(
            createGateway(http).chat({
                messages: [{ role: 'user', content: 'Move the text input node 100px to the right.' }],
                tools: await executor.listTools(config),
            })
        );

        const toolCall = chunks.find(c => c.toolCall)?.toolCall;
        expect(toolCall?.name).toBe('move_node');

        const result = await executor.dispatch(
            config,
            { id: toolCall!.id, name: toolCall!.name, args: JSON.parse(toolCall!.argsDelta) },
            { canModifyCanvas: true }
        );

        expect(result.ok).toBe(true);
        expect(binding.readGraph().nodes[0].position).toEqual({ x: 200, y: 200 });
    });

});
