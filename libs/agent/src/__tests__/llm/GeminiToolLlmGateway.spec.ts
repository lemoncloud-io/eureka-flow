import { describe, expect, it } from 'vitest';

import { createInMemoryCanvasBinding } from '../../canvas/inMemoryCanvasBinding';
import { createCatalogLookup } from '../../catalog';
import { ScriptedHttpClient } from '../../http/ScriptedHttpClient';
import { createGeminiToolLlmGateway } from '../../llm/GeminiToolLlmGateway';
import { PRICING_CONFIG_VERSION, estimateCost, getModelPricing } from '../../llm/pricing';
import { LIST_NODES, MOVE_NODE } from '../../tools/nodeTools';
import { createToolExecutor } from '../../tools/toolExecutor';
import { toolset } from '../../tools/toolset';
import { createTracer, memorySink } from '../../trace';

import type { AgentConfig } from '../../agent';
import type { HttpClient } from '../../http';
import type { Chunk } from '../../llm/llmGateway';
import type { Tracer } from '../../trace';
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

const createGateway = (http: ScriptedHttpClient, tracer?: Tracer) =>
    createGeminiToolLlmGateway({ http, ...(tracer ? { tracer } : {}), now: () => 1000, apiKey: API_KEY });

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
        const gateway = createGateway(new ScriptedHttpClient());

        expect(gateway.capabilities).toEqual({ toolCalls: true });
        expect(gateway.provider).toBe('gemini');
        expect(gateway.model).toBe('gemini-2.5-flash');
    });

    it('authenticates via header, never the URL, and posts to generateContent', async () => {
        const http = new ScriptedHttpClient([{ json: geminiText('hi') }]);

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
        const http = new ScriptedHttpClient([{ json: geminiText('ok') }]);

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

    it("recursively converts an array-typed parameter's items schema, not just properties (schema.items branch)", async () => {
        const http = new ScriptedHttpClient([{ json: geminiText('ok') }]);

        await drain(
            createGateway(http).chat({
                messages: [{ role: 'user', content: 'tag it' }],
                tools: [
                    {
                        name: 'tag_node',
                        description: 'tag a node',
                        parameters: {
                            type: 'object',
                            properties: {
                                tags: { type: 'array', items: { type: 'string' } },
                            },
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
                        name: 'tag_node',
                        description: 'tag a node',
                        parameters: {
                            type: 'OBJECT',
                            properties: { tags: { type: 'ARRAY', items: { type: 'STRING' } } },
                        },
                    },
                ],
            },
        ]);
    });

    it("leaves an untyped (or unrecognized-type) schema field's `type` untouched — the uppercase-type conversion only applies to known JSON-Schema types", async () => {
        const http = new ScriptedHttpClient([{ json: geminiText('ok') }]);

        await drain(
            createGateway(http).chat({
                messages: [{ role: 'user', content: 'pick one' }],
                tools: [
                    {
                        name: 'pick_option',
                        description: 'pick from an enum with no declared type',
                        parameters: {
                            type: 'object',
                            properties: {
                                // No `type` field at all — valid JSON Schema (enum implies the type),
                                // but `toGeminiSchema` must not crash or invent an uppercase type for it.
                                choice: { enum: ['a', 'b'] },
                            },
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
                        name: 'pick_option',
                        description: 'pick from an enum with no declared type',
                        parameters: { type: 'OBJECT', properties: { choice: { enum: ['a', 'b'] } } },
                    },
                ],
            },
        ]);
    });

    it('maps system messages to systemInstruction and omits tools when none are given', async () => {
        const http = new ScriptedHttpClient([{ json: geminiText('ok') }]);

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

    it('maps a system message with null content to an empty string rather than dropping it or sending "null"', async () => {
        const http = new ScriptedHttpClient([{ json: geminiText('ok') }]);

        await drain(
            createGateway(http).chat({
                messages: [
                    { role: 'system', content: null },
                    { role: 'user', content: 'q' },
                ],
                tools: [],
            })
        );

        const body = http.requests[0].body as Record<string, unknown>;
        expect(body['systemInstruction']).toEqual({ parts: [{ text: '' }] });
    });

    it('omits generationConfig entirely from the request when no generation options are configured', async () => {
        const http = new ScriptedHttpClient([{ json: geminiText('ok') }]);

        await drain(createGateway(http).chat(userSays('q')));

        const body = http.requests[0].body as Record<string, unknown>;
        expect(body).not.toHaveProperty('generationConfig');
    });

    it('maps generation.temperature and generation.maxOutputTokens into generationConfig when configured', async () => {
        const http = new ScriptedHttpClient([{ json: geminiText('ok') }]);
        const gateway = createGeminiToolLlmGateway({
            http,
            apiKey: API_KEY,
            generation: { temperature: 0.3, maxOutputTokens: 128 },
        });

        await drain(gateway.chat(userSays('q')));

        const body = http.requests[0].body as Record<string, unknown>;
        expect(body['generationConfig']).toEqual({ temperature: 0.3, maxOutputTokens: 128 });
    });

    it('yields a text chunk then a done chunk carrying usage', async () => {
        const http = new ScriptedHttpClient([{ json: geminiText('the answer') }]);

        const chunks = await drain(createGateway(http).chat(userSays('q')));

        expect(chunks).toEqual([
            { text: 'the answer' },
            { done: true, usage: withGeminiCost({ inputTokens: 12, outputTokens: 34 }) },
        ]);
    });

    it('parses a functionCall part into a toolCall chunk (args object → JSON string argsDelta)', async () => {
        const http = new ScriptedHttpClient([
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

    it('defaults functionCall args to an empty object when the response omits args entirely', async () => {
        const http = new ScriptedHttpClient([
            {
                json: {
                    candidates: [{ content: { parts: [{ functionCall: { name: 'list_nodes' } }] } }],
                    usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2 },
                },
            },
        ]);

        const chunks = await drain(createGateway(http).chat(userSays('list them')));

        expect(chunks[0]).toEqual({ toolCall: { id: 'gemini-call-1', name: 'list_nodes', argsDelta: '{}' } });
    });

    describe('multi-turn request-mapping', () => {
        it('maps an assistant tool-call message into a model-role functionCall part, args parsed from the JSON args string', async () => {
            const http = new ScriptedHttpClient([{ json: geminiText('ok') }]);

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
            const http = new ScriptedHttpClient([{ json: geminiText('ok') }]);

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
            const http = new ScriptedHttpClient([{ json: geminiText('ok') }]);

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

        it('defaults a tool-result message with null content to an empty object payload', async () => {
            const http = new ScriptedHttpClient([{ json: geminiText('ok') }]);

            await drain(
                createGateway(http).chat({
                    messages: [
                        { role: 'user', content: 'move it' },
                        {
                            role: 'assistant',
                            content: null,
                            toolCalls: [{ id: 'c1', name: 'move_node', args: '{}' }],
                        },
                        { role: 'tool', content: null, toolCallId: 'c1' },
                    ],
                    tools: [],
                })
            );

            const body = http.requests[0].body as Record<string, unknown>;
            const contents = body['contents'] as Array<Record<string, unknown>>;
            expect(contents[2]).toEqual({
                role: 'user',
                parts: [{ functionResponse: { name: 'move_node', response: {} } }],
            });
        });

        it('wraps unparsable tool-result content in { content } rather than throwing (functionResponse payload fallback)', async () => {
            const http = new ScriptedHttpClient([{ json: geminiText('ok') }]);

            await drain(
                createGateway(http).chat({
                    messages: [
                        { role: 'user', content: 'move it' },
                        {
                            role: 'assistant',
                            content: null,
                            toolCalls: [{ id: 'c1', name: 'move_node', args: '{}' }],
                        },
                        { role: 'tool', content: 'not valid json', toolCallId: 'c1' },
                    ],
                    tools: [],
                })
            );

            const body = http.requests[0].body as Record<string, unknown>;
            const contents = body['contents'] as Array<Record<string, unknown>>;
            expect(contents[2]).toEqual({
                role: 'user',
                parts: [{ functionResponse: { name: 'move_node', response: { content: 'not valid json' } } }],
            });
        });

        it('wraps a tool-result content that parses to a JSON primitive (not an object) in { content }', async () => {
            // Valid JSON that parses successfully but yields a primitive, not an object — a
            // different path from the JSON.parse-throws case: this one takes the ternary's other
            // branch inside the try, never reaching the catch at all.
            const http = new ScriptedHttpClient([{ json: geminiText('ok') }]);

            await drain(
                createGateway(http).chat({
                    messages: [
                        { role: 'user', content: 'move it' },
                        {
                            role: 'assistant',
                            content: null,
                            toolCalls: [{ id: 'c1', name: 'move_node', args: '{}' }],
                        },
                        { role: 'tool', content: '"just a string"', toolCallId: 'c1' },
                    ],
                    tools: [],
                })
            );

            const body = http.requests[0].body as Record<string, unknown>;
            const contents = body['contents'] as Array<Record<string, unknown>>;
            expect(contents[2]).toEqual({
                role: 'user',
                parts: [{ functionResponse: { name: 'move_node', response: { content: 'just a string' } } }],
            });
        });

        it('throws when a tool-result message has no toolCallId at all — not just no match', async () => {
            const gateway = createGateway(new ScriptedHttpClient());

            await expect(
                drain(gateway.chat({ messages: [{ role: 'tool', content: '{}' }], tools: [] }))
            ).rejects.toThrow(/no matching function-call name found for toolCallId ""/);
        });

        it('maps an assistant message with no tool calls through the plain content mapping, falling back to empty text when content is null', async () => {
            // toolCalls is undefined (not just empty) here, so this is not a tool-call turn at all —
            // it must fall through to the same plain user/assistant mapping every other role uses.
            const http = new ScriptedHttpClient([{ json: geminiText('ok') }]);

            await drain(
                createGateway(http).chat({
                    messages: [
                        { role: 'user', content: 'go' },
                        { role: 'assistant', content: null },
                    ],
                    tools: [],
                })
            );

            const body = http.requests[0].body as Record<string, unknown>;
            const contents = body['contents'] as Array<Record<string, unknown>>;
            expect(contents[1]).toEqual({ role: 'model', parts: [{ text: '' }] });
        });

        it('produces the correct multi-turn body shape for a full multi-turn round trip (system + user + model functionCall + user functionResponse)', async () => {
            const http = new ScriptedHttpClient([{ json: geminiText('ok') }]);

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

        it('replays thoughtSignature on a functionCall part when the assistant tool-call carries one', async () => {
            // Gemini's "thinking" model family (3.x, and sometimes gemini-2.5-flash-lite) rejects a
            // replayed functionCall part that omits thoughtSignature with a 400 — confirmed live,
            // 2026-08-07 (see GeminiToolLlmGateway.ts's GeminiContentPart doc).
            const http = new ScriptedHttpClient([{ json: geminiText('ok') }]);

            await drain(
                createGateway(http).chat({
                    messages: [
                        { role: 'user', content: 'go' },
                        {
                            role: 'assistant',
                            content: null,
                            toolCalls: [
                                { id: 'c1', name: 'list_nodes', args: '{}', thoughtSignature: 'opaque-sig-abc' },
                            ],
                        },
                        { role: 'tool', content: '{"nodes":[]}', toolCallId: 'c1' },
                    ],
                    tools: [],
                })
            );

            const body = http.requests[0].body as Record<string, unknown>;
            const contents = body['contents'] as Array<Record<string, unknown>>;
            expect(contents[1]).toEqual({
                role: 'model',
                parts: [{ functionCall: { name: 'list_nodes', args: {} }, thoughtSignature: 'opaque-sig-abc' }],
            });
        });

        it('omits thoughtSignature on a replayed functionCall part when the assistant tool-call never had one', async () => {
            const http = new ScriptedHttpClient([{ json: geminiText('ok') }]);

            await drain(
                createGateway(http).chat({
                    messages: [
                        { role: 'user', content: 'go' },
                        { role: 'assistant', content: null, toolCalls: [{ id: 'c1', name: 'list_nodes', args: '{}' }] },
                        { role: 'tool', content: '{"nodes":[]}', toolCallId: 'c1' },
                    ],
                    tools: [],
                })
            );

            const body = http.requests[0].body as Record<string, unknown>;
            const contents = body['contents'] as Array<Record<string, unknown>>;
            const modelPart = (contents[1]['parts'] as Array<Record<string, unknown>>)[0];
            expect(modelPart).not.toHaveProperty('thoughtSignature');
        });

        it('keeps distinct thoughtSignatures on their own functionCall parts — never merged, swapped, or spread to a signature-less sibling', async () => {
            const http = new ScriptedHttpClient([{ json: geminiText('ok') }]);

            await drain(
                createGateway(http).chat({
                    messages: [
                        { role: 'user', content: 'go' },
                        {
                            role: 'assistant',
                            content: null,
                            toolCalls: [
                                { id: 'c1', name: 'list_nodes', args: '{}', thoughtSignature: 'opaque-sig-first' },
                                {
                                    id: 'c2',
                                    name: 'move_node',
                                    args: '{"nodeId":"text-1"}',
                                    thoughtSignature: 'opaque-sig-second',
                                },
                                { id: 'c3', name: 'list_nodes', args: '{}' },
                            ],
                        },
                        { role: 'tool', content: '{"nodes":[]}', toolCallId: 'c1' },
                        { role: 'tool', content: '{"ok":true}', toolCallId: 'c2' },
                        { role: 'tool', content: '{"nodes":[]}', toolCallId: 'c3' },
                    ],
                    tools: [],
                })
            );

            const body = http.requests[0].body as Record<string, unknown>;
            const contents = body['contents'] as Array<Record<string, unknown>>;
            expect(contents[1]).toEqual({
                role: 'model',
                parts: [
                    { functionCall: { name: 'list_nodes', args: {} }, thoughtSignature: 'opaque-sig-first' },
                    {
                        functionCall: { name: 'move_node', args: { nodeId: 'text-1' } },
                        thoughtSignature: 'opaque-sig-second',
                    },
                    { functionCall: { name: 'list_nodes', args: {} } },
                ],
            });
            // No signature ever lands on an unrelated part — the functionResponse user turns stay clean.
            for (const content of contents.slice(2)) {
                for (const part of content['parts'] as Array<Record<string, unknown>>) {
                    expect(part).not.toHaveProperty('thoughtSignature');
                }
            }
        });

        it('throws a clear error — not a silent guess — when a tool-result toolCallId has no matching assistant tool-call entry earlier in the request', async () => {
            const gateway = createGateway(new ScriptedHttpClient());

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
            const http = new ScriptedHttpClient([{ json: geminiText('Moved it.') }]);

            const chunks = await drain(createGateway(http).chat(followUpRequest()));

            expect(chunks).toEqual([
                { text: 'Moved it.' },
                { done: true, usage: withGeminiCost({ inputTokens: 12, outputTokens: 34 }) },
            ]);
        });

        it('parses a second functionCall response correctly', async () => {
            const http = new ScriptedHttpClient([
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

        it('captures thoughtSignature from a functionCall response part onto the yielded toolCall chunk', async () => {
            const http = new ScriptedHttpClient([
                {
                    json: {
                        candidates: [
                            {
                                content: {
                                    parts: [
                                        {
                                            functionCall: { name: 'move_node', args: { nodeId: 'text-1' } },
                                            thoughtSignature: 'opaque-sig-xyz',
                                        },
                                    ],
                                },
                            },
                        ],
                        usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 8 },
                    },
                },
            ]);

            const chunks = await drain(createGateway(http).chat(followUpRequest()));

            expect(chunks[0]).toEqual({
                toolCall: {
                    id: 'gemini-call-1',
                    name: 'move_node',
                    argsDelta: '{"nodeId":"text-1"}',
                    thoughtSignature: 'opaque-sig-xyz',
                },
            });
        });

        it('omits thoughtSignature on the yielded toolCall chunk when the response part never had one', async () => {
            const http = new ScriptedHttpClient([{ json: geminiFunctionCall('move_node', { nodeId: 'text-1' }) }]);

            const chunks = await drain(createGateway(http).chat(followUpRequest()));

            expect(chunks[0]).toEqual({
                toolCall: { id: 'gemini-call-1', name: 'move_node', argsDelta: '{"nodeId":"text-1"}' },
            });
        });

        it('captures distinct thoughtSignatures from parallel functionCall parts onto their own toolCall chunks', async () => {
            const http = new ScriptedHttpClient([
                {
                    json: {
                        candidates: [
                            {
                                content: {
                                    parts: [
                                        {
                                            functionCall: { name: 'list_nodes', args: {} },
                                            thoughtSignature: 'opaque-sig-first',
                                        },
                                        {
                                            functionCall: { name: 'move_node', args: { nodeId: 'text-1' } },
                                            thoughtSignature: 'opaque-sig-second',
                                        },
                                    ],
                                },
                            },
                        ],
                        usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 8 },
                    },
                },
            ]);

            const chunks = await drain(createGateway(http).chat(followUpRequest()));

            expect(chunks[0]).toEqual({
                toolCall: {
                    id: 'gemini-call-1',
                    name: 'list_nodes',
                    argsDelta: '{}',
                    thoughtSignature: 'opaque-sig-first',
                },
            });
            expect(chunks[1]).toEqual({
                toolCall: {
                    id: 'gemini-call-2',
                    name: 'move_node',
                    argsDelta: '{"nodeId":"text-1"}',
                    thoughtSignature: 'opaque-sig-second',
                },
            });
        });
    });

    // Regression coverage: the tool-call id counter must be scoped to the GATEWAY INSTANCE, not to
    // one `chat()` call — otherwise every turn restarts at `gemini-call-1`, and a later request's
    // `buildToolCallNameById` (which scans the WHOLE accumulated transcript) has two different
    // real calls sharing the same id, so the later one silently overwrites the earlier one's name
    // in the map. A stale tool-result message from the earlier call would then replay under the
    // WRONG function name.
    describe('tool-call id uniqueness across sequential chat() calls on the same gateway', () => {
        it('never reuses an id across 3 sequential turns on the same gateway instance', async () => {
            const http = new ScriptedHttpClient([
                { json: geminiFunctionCall('list_nodes', {}) },
                { json: geminiFunctionCall('move_node', { nodeId: 'text-1' }) },
                { json: geminiFunctionCall('list_nodes', {}) },
            ]);
            const gateway = createGateway(http);

            const turn1 = await drain(gateway.chat({ messages: [{ role: 'user', content: 'go' }], tools: [] }));
            const call1 = turn1[0];
            expect(call1).toEqual({ toolCall: { id: 'gemini-call-1', name: 'list_nodes', argsDelta: '{}' } });

            const turn2 = await drain(
                gateway.chat({
                    messages: [
                        { role: 'user', content: 'go' },
                        {
                            role: 'assistant',
                            content: null,
                            toolCalls: [{ id: 'gemini-call-1', name: 'list_nodes', args: '{}' }],
                        },
                        { role: 'tool', content: '{"nodes":[]}', toolCallId: 'gemini-call-1' },
                    ],
                    tools: [],
                })
            );
            const call2 = turn2[0];
            // Before the fix, this would ALSO be 'gemini-call-1' — colliding with turn 1's call.
            expect(call2).toEqual({
                toolCall: { id: 'gemini-call-2', name: 'move_node', argsDelta: '{"nodeId":"text-1"}' },
            });

            const turn3 = await drain(
                gateway.chat({
                    messages: [
                        { role: 'user', content: 'go' },
                        {
                            role: 'assistant',
                            content: null,
                            toolCalls: [{ id: 'gemini-call-1', name: 'list_nodes', args: '{}' }],
                        },
                        { role: 'tool', content: '{"nodes":[]}', toolCallId: 'gemini-call-1' },
                        {
                            role: 'assistant',
                            content: null,
                            toolCalls: [{ id: 'gemini-call-2', name: 'move_node', args: '{"nodeId":"text-1"}' }],
                        },
                        { role: 'tool', content: '{"ok":true}', toolCallId: 'gemini-call-2' },
                    ],
                    tools: [],
                })
            );
            const call3 = turn3[0];
            expect(call3).toEqual({ toolCall: { id: 'gemini-call-3', name: 'list_nodes', argsDelta: '{}' } });

            // The critical regression: turn 3's OWN outgoing request replays turn 1's and turn 2's
            // tool results — each `functionResponse` must resolve to the call it actually answers,
            // never overwritten by a later, differently-named call that happened to land on the
            // same id under the old per-call-scoped counter.
            const turn3Body = http.requests[2].body as Record<string, unknown>;
            const turn3Contents = turn3Body['contents'] as Array<Record<string, unknown>>;
            const functionResponseNames = turn3Contents
                .flatMap(c => c['parts'] as Array<Record<string, unknown>>)
                .filter(p => 'functionResponse' in p)
                .map(p => (p['functionResponse'] as { name: string }).name);
            expect(functionResponseNames).toEqual(['list_nodes', 'move_node']);
        });
    });

    describe('usage/cost mapping', () => {
        it('subtracts cachedContentTokenCount from promptTokenCount for inputTokens — never double-counted', async () => {
            const http = new ScriptedHttpClient([
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
            const http = new ScriptedHttpClient([
                {
                    json: {
                        candidates: [{ content: { parts: [{ text: 'ok' }] } }],
                        usageMetadata: {
                            promptTokenCount: 100,
                            cachedContentTokenCount: 150,
                            candidatesTokenCount: 10,
                        },
                    },
                },
            ]);

            const chunks = await drain(createGateway(http).chat(userSays('q')));
            const done = chunks.find(c => c.done);

            expect(done?.usage?.inputTokens).toBe(0);
        });

        it('maps thoughtsTokenCount to reasoningTokens, kept separate from candidatesTokenCount (visible output)', async () => {
            const http = new ScriptedHttpClient([
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
            const http = new ScriptedHttpClient([
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
            const http = new ScriptedHttpClient([
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
            const http = new ScriptedHttpClient([
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
            if (!pricing?.cachedInputPerMillion) {
                throw new Error('expected gemini-2.5-flash pricing with a cached rate');
            }
            const expected =
                0.7 * pricing.inputPerMillion +
                0.3 * pricing.cachedInputPerMillion +
                0.1 * pricing.outputPerMillion +
                0.05 * pricing.outputPerMillion +
                0.01 * pricing.inputPerMillion;

            expect(done?.usage?.estimatedCost).toBeCloseTo(expected, 10);
            expect(done?.usage?.costSource).toBe('estimated');
        });

        it('omits usage entirely from the done chunk when the response reports no usageMetadata at all', async () => {
            const http = new ScriptedHttpClient([
                { json: { candidates: [{ content: { parts: [{ text: 'ok' }] } }] } },
            ]);

            const chunks = await drain(createGateway(http).chat(userSays('q')));

            expect(chunks).toEqual([{ text: 'ok' }, { done: true }]);
        });

        it('reports only estimatedCost: null when usageMetadata is present but empty — every token field left undefined, not fabricated', async () => {
            const http = new ScriptedHttpClient([
                { json: { candidates: [{ content: { parts: [{ text: 'ok' }] } }], usageMetadata: {} } },
            ]);

            const chunks = await drain(createGateway(http).chat(userSays('q')));
            const done = chunks.find(c => c.done);

            expect(done?.usage).toEqual({ estimatedCost: null });
        });

        it('returns estimatedCost: null (not a fabricated 0) for an unregistered model, while still reporting tokens', async () => {
            const http = new ScriptedHttpClient([{ json: geminiText('ok') }]);
            const gateway = createGeminiToolLlmGateway({
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
        const http = new ScriptedHttpClient([{ json: geminiText('ok') }]);
        const gateway = createGeminiToolLlmGateway({
            http,
            apiKey: API_KEY,
            model: 'gemini-2.5-pro',
            baseUrl: 'https://proxy.example.com/gemini',
        });

        await drain(gateway.chat(userSays('q')));

        expect(http.requests[0].url).toBe(
            'https://proxy.example.com/gemini/v1beta/models/gemini-2.5-pro:generateContent'
        );
    });

    it('passes the abort signal through to the HTTP port', async () => {
        const http = new ScriptedHttpClient([{ json: geminiText('ok') }]);
        const controller = new AbortController();

        await drain(createGateway(http).chat(userSays('q'), { signal: controller.signal }));

        expect(http.requests[0].signal).toBe(controller.signal);
    });

    it('throws on non-ok responses with the status but never the API key, and traces the error', async () => {
        const http = new ScriptedHttpClient([{ status: 400, text: `bad key ${API_KEY}` }]);
        const sink = memorySink();
        const tracer = createTracer(sink);

        const attempt = drain(createGateway(http, tracer).chat(userSays('q')));

        await expect(attempt).rejects.toThrow(/status 400.*bad key \[redacted\]/);
        await attempt.catch((error: Error) => expect(error.message).not.toContain(API_KEY));
        expect(sink.records.some(entry => entry.level === 'error')).toBe(true);
        expect(JSON.stringify(sink.records)).not.toContain(API_KEY);
    });

    it('passes an error body through verbatim (no redaction) when apiKey is empty — nothing to scrub', async () => {
        // Guards the redactText early-return itself: without it, `value.split('').join(...)` would
        // splice '[redacted]' between every single character of the body, mangling it completely.
        const http = new ScriptedHttpClient([{ status: 403, text: 'no secret in this error body' }]);
        const gateway = createGeminiToolLlmGateway({
            http,
            apiKey: '',
        });

        await expect(drain(gateway.chat(userSays('q')))).rejects.toThrow(
            'Gemini request failed with status 403: no secret in this error body'
        );
    });

    it('falls back to an empty string when reading the non-ok response body itself fails (response.text() rejects)', async () => {
        const http: HttpClient = {
            request: async () => ({
                status: 500,
                ok: false,
                headers: {},
                json: async () => {
                    throw new Error('should not be called on the error path');
                },
                text: async () => {
                    throw new Error('body stream errored');
                },
            }),
        };
        const gateway = createGeminiToolLlmGateway({
            http,
            apiKey: API_KEY,
        });

        await expect(drain(gateway.chat(userSays('q')))).rejects.toThrow('Gemini request failed with status 500: ');
    });

    it('throws when the response has no candidates, with no diagnostic metadata to show', async () => {
        const http = new ScriptedHttpClient([{ json: { candidates: [] } }]);

        await expect(drain(createGateway(http).chat(userSays('q')))).rejects.toThrow(
            /no candidates or no usable content parts \(no diagnostic metadata present\)/
        );
    });

    it('surfaces promptFeedback.blockReason when candidates is empty', async () => {
        const http = new ScriptedHttpClient([{ json: { candidates: [], promptFeedback: { blockReason: 'SAFETY' } } }]);

        await expect(drain(createGateway(http).chat(userSays('q')))).rejects.toThrow(
            /promptFeedback\.blockReason=SAFETY/
        );
    });

    it('surfaces a candidate finishReason when it has no usable content parts', async () => {
        const http = new ScriptedHttpClient([{ json: { candidates: [{ finishReason: 'SAFETY' }] } }]);

        await expect(drain(createGateway(http).chat(userSays('q')))).rejects.toThrow(/finishReason=SAFETY/);
    });

    it('surfaces a candidate finishReason for a candidate with empty content.parts', async () => {
        const http = new ScriptedHttpClient([
            { json: { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [] } }] } },
        ]);

        await expect(drain(createGateway(http).chat(userSays('q')))).rejects.toThrow(/finishReason=MAX_TOKENS/);
    });

    it('surfaces safety ratings safely as category:probability:blocked', async () => {
        const http = new ScriptedHttpClient([
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
        const http = new ScriptedHttpClient([
            { json: { candidates: [], promptFeedback: { blockReason: `leaked ${API_KEY}` } } },
        ]);

        const attempt = drain(createGateway(http).chat(userSays('q')));

        await expect(attempt).rejects.toThrow(/leaked \[redacted\]/);
        await attempt.catch((error: Error) => expect(error.message).not.toContain(API_KEY));
    });

    it('traces request and response without leaking the key', async () => {
        const http = new ScriptedHttpClient([{ json: geminiText('traced') }]);
        const sink = memorySink();
        const tracer = createTracer(sink);

        await drain(createGateway(http, tracer).chat(userSays('q')));

        const messages = sink.records.map(entry => entry.name);
        expect(messages).toContain('llm.gemini.request');
        expect(messages).toContain('llm.gemini.response');
        expect(JSON.stringify(sink.records)).not.toContain(API_KEY);
    });

    it('omits usage from the traced response entry when the response has no usageMetadata at all', async () => {
        // trace?.debug(...) short-circuits its whole argument list when no trace reporter is
        // configured, so the object literal carrying this ternary is only evaluated when a real
        // reporter is wired — this test is what actually exercises its "no usage" branch.
        const http = new ScriptedHttpClient([{ json: { candidates: [{ content: { parts: [{ text: 'hi' }] } }] } }]);
        const sink = memorySink();
        const tracer = createTracer(sink);

        await drain(createGateway(http, tracer).chat(userSays('q')));

        const responseEntry = sink.records.find(entry => entry.name === 'llm.gemini.response');
        expect(responseEntry?.fields).not.toHaveProperty('usage');
    });

    // The full offline chain: a canned Gemini functionCall flows through the gateway's parsing
    // into a Chunk.toolCall, then through the real ToolExecutor + canvas tools, moving the node.
    it('canned functionCall response drives ToolExecutor to move the node (100,200) -> (200,200)', async () => {
        const binding = createInMemoryCanvasBinding({
            nodes: [makeNode('text-1', 100, 200, { type: 'text-input' })],
            edges: [],
        });
        const provider = [toolset({ binding, catalog: createCatalogLookup([]) }, [LIST_NODES, MOVE_NODE])];
        const executor = createToolExecutor();
        const config: AgentConfig = {
            id: 'locator-test',
            description: 'moves nodes',
            systemPrompt: 'move nodes on the canvas',
            tools: provider,
            grant: { canModifyCanvas: true },
        };

        const http = new ScriptedHttpClient([
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
