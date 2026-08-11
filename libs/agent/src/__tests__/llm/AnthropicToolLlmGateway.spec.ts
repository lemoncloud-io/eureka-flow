import { describe, expect, it } from 'vitest';

import { ScriptedHttpClient } from '../../http/ScriptedHttpClient';
import { createAnthropicToolLlmGateway } from '../../llm/AnthropicToolLlmGateway';
import { PRICING_CONFIG_VERSION, estimateCost, getModelPricing } from '../../llm/pricing';
import { createTracer, memorySink } from '../../trace';

import type { HttpClient } from '../../http';
import type { Chunk } from '../../llm/llmGateway';
import type { Tracer } from '../../trace';

const API_KEY = 'test-anthropic-key';

/** A canned Anthropic text reply. */
const anthropicText = (text: string) => ({
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 12, output_tokens: 34 },
});

/** A canned Anthropic tool_use reply. `input` is a parsed object (Anthropic's native shape). */
const anthropicToolUse = (id: string, name: string, input: unknown) => ({
    content: [{ type: 'tool_use', id, name, input }],
    stop_reason: 'tool_use',
    usage: { input_tokens: 20, output_tokens: 8 },
});

const createGateway = (http: ScriptedHttpClient, tracer?: Tracer) =>
    createAnthropicToolLlmGateway({ http, ...(tracer ? { tracer } : {}), now: () => 1000, apiKey: API_KEY });

/** Every offline test below uses the default model (`claude-haiku-4-5`, registered/priced in
 * pricing.ts), so every done chunk now also carries a computed `estimatedCost`/`costSource` —
 * expected here via the same `estimateCost` pricing.spec.ts verifies in isolation, not a
 * hand-typed literal that would silently drift from pricing.ts. */
const withAnthropicCost = (usage: { inputTokens: number; outputTokens: number }) => ({
    ...usage,
    estimatedCost: estimateCost('anthropic', 'claude-haiku-4-5', usage),
    costSource: 'estimated' as const,
    pricingVersion: PRICING_CONFIG_VERSION,
});

const drain = async (stream: AsyncIterable<Chunk>): Promise<Chunk[]> => {
    const chunks: Chunk[] = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return chunks;
};

const userSays = (content: string) => ({ messages: [{ role: 'user' as const, content }], tools: [] });

describe('createAnthropicToolLlmGateway', () => {
    it('declares itself a tool-capable anthropic gateway with the default model', () => {
        const gateway = createGateway(new ScriptedHttpClient());

        expect(gateway.capabilities).toEqual({ toolCalls: true });
        expect(gateway.provider).toBe('anthropic');
        expect(gateway.model).toBe('claude-haiku-4-5');
    });

    it('posts to /v1/messages with x-api-key and anthropic-version headers (never Authorization)', async () => {
        const http = new ScriptedHttpClient([{ json: anthropicText('hi') }]);

        await drain(createGateway(http).chat(userSays('hello')));

        const request = http.requests[0];
        expect(request.method).toBe('POST');
        expect(request.url).toBe('https://api.anthropic.com/v1/messages');
        expect(request.url).not.toContain(API_KEY);
        expect(request.headers?.['x-api-key']).toBe(API_KEY);
        expect(request.headers?.['anthropic-version']).toBe('2023-06-01');
        expect(request.headers?.['authorization']).toBeUndefined();
    });

    it('always includes max_tokens, defaulting to 1024 when not specified', async () => {
        const http = new ScriptedHttpClient([{ json: anthropicText('hi') }]);

        await drain(createGateway(http).chat(userSays('hello')));

        const body = http.requests[0].body as Record<string, unknown>;
        expect(body['max_tokens']).toBe(1024);
    });

    it('honors a generation.maxOutputTokens override instead of the default', async () => {
        const http = new ScriptedHttpClient([{ json: anthropicText('hi') }]);
        const gateway = createAnthropicToolLlmGateway({
            http,
            apiKey: API_KEY,
            generation: { maxOutputTokens: 256 },
        });

        await drain(gateway.chat(userSays('hello')));

        const body = http.requests[0].body as Record<string, unknown>;
        expect(body['max_tokens']).toBe(256);
    });

    it('includes temperature on the request when generation.temperature is configured', async () => {
        const http = new ScriptedHttpClient([{ json: anthropicText('hi') }]);
        const gateway = createAnthropicToolLlmGateway({
            http,
            apiKey: API_KEY,
            generation: { temperature: 0.4 },
        });

        await drain(gateway.chat(userSays('hello')));

        const body = http.requests[0].body as Record<string, unknown>;
        expect(body['temperature']).toBe(0.4);
    });

    it('omits temperature entirely from the request when generation.temperature is not configured', async () => {
        const http = new ScriptedHttpClient([{ json: anthropicText('hi') }]);

        await drain(createGateway(http).chat(userSays('hello')));

        const body = http.requests[0].body as Record<string, unknown>;
        expect(body).not.toHaveProperty('temperature');
    });

    it('maps ToolDef into tools[].input_schema, passing the lowercase JSON Schema through unchanged', async () => {
        const http = new ScriptedHttpClient([{ json: anthropicText('ok') }]);

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
                name: 'move_node',
                description: 'move a node',
                input_schema: {
                    // Lowercase, unlike Gemini — no case conversion, straight passthrough.
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
        ]);
    });

    it('maps system messages to a top-level `system` field and omits tools when none are given', async () => {
        const http = new ScriptedHttpClient([{ json: anthropicText('ok') }]);

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
        expect(body['system']).toBe('be brief');
        expect(body['messages']).toEqual([{ role: 'user', content: 'q' }]);
        expect(body).not.toHaveProperty('tools');
    });

    it('maps a system message with null content to an empty string rather than dropping it or sending "null"', async () => {
        const http = new ScriptedHttpClient([{ json: anthropicText('ok') }]);

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
        expect(body['system']).toBe('');
    });

    it('yields a text chunk then a done chunk carrying usage', async () => {
        const http = new ScriptedHttpClient([{ json: anthropicText('the answer') }]);

        const chunks = await drain(createGateway(http).chat(userSays('q')));

        expect(chunks).toEqual([
            { text: 'the answer' },
            { done: true, usage: withAnthropicCost({ inputTokens: 12, outputTokens: 34 }) },
        ]);
    });

    it('parses a tool_use block into a toolCall chunk (input object → JSON string argsDelta)', async () => {
        const http = new ScriptedHttpClient([
            { json: anthropicToolUse('toolu_01abc', 'move_node', { nodeId: 'text-1', by: { dx: 100, dy: 0 } }) },
        ]);

        const chunks = await drain(createGateway(http).chat(userSays('move the text input 100 right')));

        expect(chunks).toEqual([
            {
                toolCall: {
                    id: 'toolu_01abc',
                    name: 'move_node',
                    argsDelta: '{"nodeId":"text-1","by":{"dx":100,"dy":0}}',
                },
            },
            { done: true, usage: withAnthropicCost({ inputTokens: 20, outputTokens: 8 }) },
        ]);
    });

    it('parses multiple content blocks: text followed by a tool_use in the same response', async () => {
        const http = new ScriptedHttpClient([
            {
                json: {
                    content: [
                        { type: 'text', text: "I'll move it now." },
                        { type: 'tool_use', id: 'toolu_02def', name: 'move_node', input: { nodeId: 'text-1' } },
                    ],
                    stop_reason: 'tool_use',
                },
            },
        ]);

        const chunks = await drain(createGateway(http).chat(userSays('move it')));

        expect(chunks).toEqual([
            { text: "I'll move it now." },
            { toolCall: { id: 'toolu_02def', name: 'move_node', argsDelta: '{"nodeId":"text-1"}' } },
            { done: true },
        ]);
    });

    describe('multi-turn request-mapping', () => {
        it('maps an assistant tool-call message into a tool_use content block, input parsed from the JSON args string', async () => {
            const http = new ScriptedHttpClient([{ json: anthropicText('ok') }]);

            await drain(
                createGateway(http).chat({
                    messages: [
                        { role: 'user', content: 'move it' },
                        {
                            role: 'assistant',
                            content: null,
                            toolCalls: [{ id: 'toolu_01abc', name: 'move_node', args: '{"nodeId":"text-1"}' }],
                        },
                    ],
                    tools: [],
                })
            );

            const body = http.requests[0].body as Record<string, unknown>;
            const messages = body['messages'] as Array<Record<string, unknown>>;
            expect(messages[1]).toEqual({
                role: 'assistant',
                content: [{ type: 'tool_use', id: 'toolu_01abc', name: 'move_node', input: { nodeId: 'text-1' } }],
            });
        });

        it('maps an assistant turn with both text and a tool call into a leading text block plus a tool_use block', async () => {
            const http = new ScriptedHttpClient([{ json: anthropicText('ok') }]);

            await drain(
                createGateway(http).chat({
                    messages: [
                        { role: 'user', content: 'move it' },
                        {
                            role: 'assistant',
                            content: "I'll move it now.",
                            toolCalls: [{ id: 'toolu_02def', name: 'move_node', args: '{"nodeId":"text-1"}' }],
                        },
                    ],
                    tools: [],
                })
            );

            const body = http.requests[0].body as Record<string, unknown>;
            const messages = body['messages'] as Array<Record<string, unknown>>;
            expect(messages[1]).toEqual({
                role: 'assistant',
                content: [
                    { type: 'text', text: "I'll move it now." },
                    { type: 'tool_use', id: 'toolu_02def', name: 'move_node', input: { nodeId: 'text-1' } },
                ],
            });
        });

        it('maps a tool-result message into a user message carrying a tool_result block, correlated by tool_use_id', async () => {
            const http = new ScriptedHttpClient([{ json: anthropicText('ok') }]);

            await drain(
                createGateway(http).chat({
                    messages: [
                        { role: 'user', content: 'move it' },
                        {
                            role: 'assistant',
                            content: null,
                            toolCalls: [{ id: 'toolu_01abc', name: 'move_node', args: '{}' }],
                        },
                        { role: 'tool', content: '{"ok":true}', toolCallId: 'toolu_01abc' },
                    ],
                    tools: [],
                })
            );

            const body = http.requests[0].body as Record<string, unknown>;
            const messages = body['messages'] as Array<Record<string, unknown>>;
            // Anthropic has no separate role: 'tool' — a tool result is a *user* message.
            expect(messages[2]).toEqual({
                role: 'user',
                content: [{ type: 'tool_result', tool_use_id: 'toolu_01abc', content: '{"ok":true}' }],
            });
        });

        it('maps a tool-result message with no toolCallId or content to empty-string fallbacks, never a literal "undefined" on the wire', async () => {
            const http = new ScriptedHttpClient([{ json: anthropicText('ok') }]);

            await drain(
                createGateway(http).chat({
                    messages: [
                        { role: 'user', content: 'go' },
                        { role: 'tool', content: null },
                    ],
                    tools: [],
                })
            );

            const body = http.requests[0].body as Record<string, unknown>;
            const messages = body['messages'] as Array<Record<string, unknown>>;
            expect(messages[1]).toEqual({
                role: 'user',
                content: [{ type: 'tool_result', tool_use_id: '', content: '' }],
            });
        });

        it('maps an assistant message with no tool calls through the plain content mapping, falling back to empty string when content is null', async () => {
            // toolCalls is undefined (not just empty) here, so this is not a tool-call turn at all —
            // it must fall through to the same plain user/assistant mapping every other role uses.
            const http = new ScriptedHttpClient([{ json: anthropicText('ok') }]);

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
            const messages = body['messages'] as Array<Record<string, unknown>>;
            expect(messages[1]).toEqual({ role: 'assistant', content: '' });
        });

        it('produces the correct multi-turn body shape for a full multi-turn round trip (system + user + assistant tool_use + tool_result)', async () => {
            const http = new ScriptedHttpClient([{ json: anthropicText('ok') }]);

            await drain(
                createGateway(http).chat({
                    messages: [
                        { role: 'system', content: 'sys' },
                        { role: 'user', content: 'go' },
                        {
                            role: 'assistant',
                            content: null,
                            toolCalls: [{ id: 'toolu_1', name: 'list_nodes', args: '{}' }],
                        },
                        { role: 'tool', content: '{"nodes":[]}', toolCallId: 'toolu_1' },
                    ],
                    tools: [],
                })
            );

            const body = http.requests[0].body as Record<string, unknown>;
            expect(body['system']).toBe('sys');
            expect(body['messages']).toEqual([
                { role: 'user', content: 'go' },
                { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_1', name: 'list_nodes', input: {} }] },
                { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: '{"nodes":[]}' }] },
            ]);
        });
    });

    describe('response parsing on the turn immediately following a tool_result', () => {
        const followUpRequest = () => ({
            messages: [
                { role: 'user' as const, content: 'go' },
                {
                    role: 'assistant' as const,
                    content: null,
                    toolCalls: [{ id: 'toolu_1', name: 'list_nodes', args: '{}' }],
                },
                { role: 'tool' as const, content: '{}', toolCallId: 'toolu_1' },
            ],
            tools: [],
        });

        it('parses a plain text response correctly', async () => {
            const http = new ScriptedHttpClient([{ json: anthropicText('Moved it.') }]);

            const chunks = await drain(createGateway(http).chat(followUpRequest()));

            expect(chunks).toEqual([
                { text: 'Moved it.' },
                { done: true, usage: withAnthropicCost({ inputTokens: 12, outputTokens: 34 }) },
            ]);
        });

        it('parses a second tool_use response correctly', async () => {
            const http = new ScriptedHttpClient([
                { json: anthropicToolUse('toolu_2', 'move_node', { nodeId: 'text-1', by: { dx: 0, dy: 50 } }) },
            ]);

            const chunks = await drain(createGateway(http).chat(followUpRequest()));

            expect(chunks).toEqual([
                {
                    toolCall: {
                        id: 'toolu_2',
                        name: 'move_node',
                        argsDelta: '{"nodeId":"text-1","by":{"dx":0,"dy":50}}',
                    },
                },
                { done: true, usage: withAnthropicCost({ inputTokens: 20, outputTokens: 8 }) },
            ]);
        });
    });

    it('honors model and baseUrl overrides (the proxy path)', async () => {
        const http = new ScriptedHttpClient([{ json: anthropicText('ok') }]);
        const gateway = createAnthropicToolLlmGateway({
            http,
            apiKey: API_KEY,
            model: 'claude-opus-4-8',
            baseUrl: 'https://proxy.example.com/anthropic',
        });

        await drain(gateway.chat(userSays('q')));

        expect(http.requests[0].url).toBe('https://proxy.example.com/anthropic/v1/messages');
        const body = http.requests[0].body as Record<string, unknown>;
        expect(body['model']).toBe('claude-opus-4-8');
    });

    describe('usage/cost mapping', () => {
        it('keeps cache_read_input_tokens and cache_creation_input_tokens separate, neither folded into inputTokens', async () => {
            // Unlike Gemini/OpenAI, Anthropic's own input_tokens is ALREADY exclusive of both cache
            // fields (Anthropic's own docs: total input = cache_read + cache_creation + input_tokens)
            // — so, unlike those two gateways, NO subtraction happens here; this is a direct mapping.
            const http = new ScriptedHttpClient([
                {
                    json: {
                        content: [{ type: 'text', text: 'ok' }],
                        stop_reason: 'end_turn',
                        usage: {
                            input_tokens: 100,
                            cache_read_input_tokens: 400,
                            cache_creation_input_tokens: 300,
                            output_tokens: 50,
                        },
                    },
                },
            ]);

            const chunks = await drain(createGateway(http).chat(userSays('q')));
            const done = chunks.find(c => c.done);

            expect(done?.usage?.inputTokens).toBe(100);
            expect(done?.usage?.cachedInputTokens).toBe(400);
            expect(done?.usage?.cacheWriteInputTokens).toBe(300);
        });

        it('reports different rates by keeping cache-read and cache-creation as genuinely separate pricing buckets (5m TTL requested)', async () => {
            const pricing = getModelPricing('anthropic', 'claude-haiku-4-5');
            if (!pricing?.cachedInputPerMillion || !pricing.cacheWritePerMillion) {
                throw new Error('expected claude-haiku-4-5 pricing with both cache rates');
            }
            // A real, meaningful difference — if these ever matched, this test (and the mapping's
            // whole reason for keeping the two fields apart) would be pointless.
            expect(pricing.cachedInputPerMillion).not.toBe(pricing.cacheWritePerMillion);

            const http = new ScriptedHttpClient([
                {
                    json: {
                        content: [{ type: 'text', text: 'ok' }],
                        stop_reason: 'end_turn',
                        usage: {
                            input_tokens: 0,
                            cache_read_input_tokens: 1_000_000,
                            cache_creation_input_tokens: 1_000_000,
                            output_tokens: 0,
                        },
                    },
                },
            ]);
            const gateway = createAnthropicToolLlmGateway({
                http,
                apiKey: API_KEY,
                cacheControl: { ttl: '5m' },
            });

            const chunks = await drain(gateway.chat(userSays('q')));
            const done = chunks.find(c => c.done);

            expect(done?.usage?.estimatedCost).toBeCloseTo(
                pricing.cachedInputPerMillion + pricing.cacheWritePerMillion,
                10
            );
            expect(done?.usage?.cacheWriteTtl).toBe('5m');
        });

        describe('cache-write TTL', () => {
            const cacheWriteUsage = (cacheCreationTokens: number) => ({
                content: [{ type: 'text', text: 'ok' }],
                stop_reason: 'end_turn',
                usage: {
                    input_tokens: 100,
                    cache_creation_input_tokens: cacheCreationTokens,
                    output_tokens: 50,
                },
            });

            it('sends an explicit top-level cache_control with ttl on the outgoing request when configured', async () => {
                const http = new ScriptedHttpClient([{ json: anthropicText('ok') }]);
                const gateway = createAnthropicToolLlmGateway({
                    http,
                    apiKey: API_KEY,
                    cacheControl: { ttl: '1h' },
                });

                await drain(gateway.chat(userSays('q')));

                const body = http.requests[0].body as Record<string, unknown>;
                expect(body['cache_control']).toEqual({ type: 'ephemeral', ttl: '1h' });
            });

            it('omits cache_control entirely from the request when cacheControl is not configured — no caching requested at all', async () => {
                const http = new ScriptedHttpClient([{ json: anthropicText('ok') }]);

                await drain(createGateway(http).chat(userSays('q')));

                const body = http.requests[0].body as Record<string, unknown>;
                expect(body).not.toHaveProperty('cache_control');
            });

            it('prices cache-write tokens at the 5-minute rate when the gateway explicitly requested a 5m TTL', async () => {
                const pricing = getModelPricing('anthropic', 'claude-haiku-4-5');
                if (!pricing?.cacheWritePerMillion) throw new Error('expected a 5m cache-write rate');
                const http = new ScriptedHttpClient([{ json: cacheWriteUsage(1_000_000) }]);
                const gateway = createAnthropicToolLlmGateway({
                    http,
                    apiKey: API_KEY,
                    cacheControl: { ttl: '5m' },
                });

                const chunks = await drain(gateway.chat(userSays('q')));
                const done = chunks.find(c => c.done);

                expect(done?.usage?.cacheWriteTtl).toBe('5m');
                expect(done?.usage?.cacheWriteInputTokens).toBe(1_000_000);
                const expected =
                    (100 / 1_000_000) * (getModelPricing('anthropic', 'claude-haiku-4-5')?.inputPerMillion ?? 0) +
                    (1_000_000 / 1_000_000) * pricing.cacheWritePerMillion +
                    (50 / 1_000_000) * (getModelPricing('anthropic', 'claude-haiku-4-5')?.outputPerMillion ?? 0);
                expect(done?.usage?.estimatedCost).toBeCloseTo(expected, 10);
            });

            it('prices cache-write tokens at the 1-hour rate — genuinely different from the 5-minute rate — when the gateway explicitly requested a 1h TTL', async () => {
                const pricing = getModelPricing('anthropic', 'claude-haiku-4-5');
                if (!pricing?.cacheWrite1hPerMillion || !pricing.cacheWritePerMillion) {
                    throw new Error('expected both cache-write rates to be configured');
                }
                expect(pricing.cacheWrite1hPerMillion).not.toBe(pricing.cacheWritePerMillion);

                const http = new ScriptedHttpClient([{ json: cacheWriteUsage(1_000_000) }]);
                const gateway = createAnthropicToolLlmGateway({
                    http,
                    apiKey: API_KEY,
                    cacheControl: { ttl: '1h' },
                });

                const chunks = await drain(gateway.chat(userSays('q')));
                const done = chunks.find(c => c.done);

                expect(done?.usage?.cacheWriteTtl).toBe('1h');
                const costWith1h = done?.usage?.estimatedCost;

                const http5m = new ScriptedHttpClient([{ json: cacheWriteUsage(1_000_000) }]);
                const gateway5m = createAnthropicToolLlmGateway({
                    http: http5m,
                    apiKey: API_KEY,
                    cacheControl: { ttl: '5m' },
                });
                const chunks5m = await drain(gateway5m.chat(userSays('q')));
                const costWith5m = chunks5m.find(c => c.done)?.usage?.estimatedCost;

                // Same token counts, different TTL — the resulting cost must genuinely differ, not
                // just carry a different label while silently using the same rate underneath.
                expect(costWith1h).not.toBeCloseTo(costWith5m as number, 5);
            });

            it('treats an omitted ttl as the documented 5-minute default when caching is requested at all', async () => {
                const pricing = getModelPricing('anthropic', 'claude-haiku-4-5');
                if (!pricing?.cacheWritePerMillion) throw new Error('expected a 5m cache-write rate');
                const http = new ScriptedHttpClient([{ json: cacheWriteUsage(1_000_000) }]);
                const gateway = createAnthropicToolLlmGateway({
                    http,
                    apiKey: API_KEY,
                    cacheControl: {}, // no ttl specified — Anthropic's own documented default is 5m
                });

                const chunks = await drain(gateway.chat(userSays('q')));
                const done = chunks.find(c => c.done);

                expect(done?.usage?.cacheWriteTtl).toBe('5m');
                expect(done?.usage?.estimatedCost).not.toBeNull();

                const body = http.requests[0].body as Record<string, unknown>;
                expect(body['cache_control']).toEqual({ type: 'ephemeral' });
            });

            it('returns estimatedCost: null when cache-write tokens are reported but no TTL was ever requested — never inferred from usage alone', async () => {
                const http = new ScriptedHttpClient([{ json: cacheWriteUsage(1_000_000) }]);
                // No cacheControl configured at all — this gateway never requested caching, so a
                // cache-write appearing in the response has no request-side TTL to attribute it to.
                const gateway = createAnthropicToolLlmGateway({
                    http,
                    apiKey: API_KEY,
                });

                const chunks = await drain(gateway.chat(userSays('q')));
                const done = chunks.find(c => c.done);

                expect(done?.usage?.cacheWriteInputTokens).toBe(1_000_000); // preserved as raw usage metadata
                expect(done?.usage?.cacheWriteTtl).toBe('unknown');
                expect(done?.usage?.estimatedCost).toBeNull();
            });

            it('does not let zero cache-write tokens block cost estimation, with or without a TTL configured', async () => {
                const http = new ScriptedHttpClient([{ json: cacheWriteUsage(0) }]);
                const gateway = createAnthropicToolLlmGateway({
                    http,
                    apiKey: API_KEY,
                    // No cacheControl — if 0 cache-write tokens incorrectly set cacheWriteTtl to
                    // 'unknown', this would wrongly null out the whole estimate.
                });

                const chunks = await drain(gateway.chat(userSays('q')));
                const done = chunks.find(c => c.done);

                expect(done?.usage?.cacheWriteInputTokens).toBe(0);
                expect(done?.usage).not.toHaveProperty('cacheWriteTtl');
                expect(done?.usage?.estimatedCost).not.toBeNull();
            });
        });

        it("leaves providerTotalTokens undefined — Anthropic's Messages API reports no raw total, never computed locally", async () => {
            const http = new ScriptedHttpClient([{ json: anthropicText('ok') }]);

            const chunks = await drain(createGateway(http).chat(userSays('q')));
            const done = chunks.find(c => c.done);

            expect(done?.usage).not.toHaveProperty('providerTotalTokens');
        });

        it('returns estimatedCost: null (not a fabricated 0) for an unregistered model, while still reporting tokens', async () => {
            const http = new ScriptedHttpClient([{ json: anthropicText('ok') }]);
            const gateway = createAnthropicToolLlmGateway({
                http,
                apiKey: API_KEY,
                model: 'claude-does-not-exist',
            });

            const chunks = await drain(gateway.chat(userSays('q')));
            const done = chunks.find(c => c.done);

            expect(done?.usage?.inputTokens).toBe(12);
            expect(done?.usage?.estimatedCost).toBeNull();
        });
    });

    it('passes the abort signal through to the HTTP port', async () => {
        const http = new ScriptedHttpClient([{ json: anthropicText('ok') }]);
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
        const gateway = createAnthropicToolLlmGateway({
            http,
            apiKey: '',
        });

        await expect(drain(gateway.chat(userSays('q')))).rejects.toThrow(
            'Anthropic request failed with status 403: no secret in this error body'
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
        const sink = memorySink();
        const tracer = createTracer(sink);
        const gateway = createAnthropicToolLlmGateway({
            http,
            tracer,
            apiKey: API_KEY,
        });

        await expect(drain(gateway.chat(userSays('q')))).rejects.toThrow('Anthropic request failed with status 500: ');
        expect(sink.records.some(entry => entry.level === 'error')).toBe(true);
    });

    it('defaults a tool_use block missing `input` to {} and reports no token counts when usage is a bare empty object', async () => {
        // A single deliberately minimal/degenerate response exercising several "field absent"
        // fallbacks at once: the tool_use content block carries no `input` field at all, and the
        // usage object is present but empty (no input_tokens/output_tokens/cache fields).
        const http = new ScriptedHttpClient([
            { json: { content: [{ type: 'tool_use', id: 'toolu_x', name: 'no_input_tool' }], usage: {} } },
        ]);

        const chunks = await drain(createGateway(http).chat(userSays('q')));

        expect(chunks).toEqual([
            { toolCall: { id: 'toolu_x', name: 'no_input_tool', argsDelta: '{}' } },
            { done: true, usage: { estimatedCost: null } },
        ]);
    });

    it('throws when the response has no content blocks', async () => {
        const http = new ScriptedHttpClient([{ json: { content: [] } }]);

        await expect(drain(createGateway(http).chat(userSays('q')))).rejects.toThrow(/no content blocks/);
    });

    it('traces request and response without leaking the key', async () => {
        const http = new ScriptedHttpClient([{ json: anthropicText('traced') }]);
        const sink = memorySink();
        const tracer = createTracer(sink);

        await drain(createGateway(http, tracer).chat(userSays('q')));

        const messages = sink.records.map(entry => entry.name);
        expect(messages).toContain('llm.anthropic.request');
        expect(messages).toContain('llm.anthropic.response');
        expect(JSON.stringify(sink.records)).not.toContain(API_KEY);
    });

    it('omits usage and includes actualModel on the traced response entry when the response has no usage but does report a model', async () => {
        // trace?.debug(...) short-circuits its whole argument list when no trace reporter is
        // configured, so the object literal carrying these two ternaries is only ever evaluated
        // when a real reporter is wired — this test is what actually exercises both of them.
        const http = new ScriptedHttpClient([
            { json: { content: [{ type: 'text', text: 'hi' }], model: 'claude-haiku-4-5-20251001' } },
        ]);
        const sink = memorySink();
        const tracer = createTracer(sink);

        await drain(createGateway(http, tracer).chat(userSays('q')));

        const responseEntry = sink.records.find(entry => entry.name === 'llm.anthropic.response');
        expect(responseEntry?.fields).not.toHaveProperty('usage');
        expect(responseEntry?.fields?.['actualModel']).toBe('claude-haiku-4-5-20251001');
    });
});

describe('createAnthropicToolLlmGateway: actualModel (payload.model)', () => {
    it('a text response with a valid top-level model reports it as actualModel on the done chunk', async () => {
        const http = new ScriptedHttpClient([
            { json: { ...anthropicText('hi'), model: 'claude-haiku-4-5-20251001' } },
        ]);

        const chunks = await drain(createGateway(http).chat(userSays('q')));

        const done = chunks.find(c => c.done);
        expect(done?.actualModel).toBe('claude-haiku-4-5-20251001');
    });

    it('a tool-call response with a valid top-level model reports it as actualModel on the done chunk', async () => {
        const http = new ScriptedHttpClient([
            {
                json: {
                    ...anthropicToolUse('toolu_01abc', 'move_node', { nodeId: 'text-1' }),
                    model: 'claude-sonnet-5-20260815',
                },
            },
        ]);

        const chunks = await drain(createGateway(http).chat(userSays('move it')));

        const done = chunks.find(c => c.done);
        expect(done?.actualModel).toBe('claude-sonnet-5-20260815');
        // The tool-call chunk itself is unaffected — actualModel only ever appears on `done`.
        const toolCallChunk = chunks.find(c => c.toolCall);
        expect(toolCallChunk).not.toHaveProperty('actualModel');
    });

    it('a two-turn tool-result flow reports actualModel on BOTH turns’ done chunks — never lost across a round trip', async () => {
        const http = new ScriptedHttpClient([
            { json: { ...anthropicToolUse('toolu_1', 'list_nodes', {}), model: 'claude-haiku-4-5-20251001' } },
            { json: { ...anthropicText('Moved it.'), model: 'claude-haiku-4-5-20251001' } },
        ]);
        const gateway = createGateway(http);

        const firstChunks = await drain(gateway.chat(userSays('go')));
        expect(firstChunks.find(c => c.done)?.actualModel).toBe('claude-haiku-4-5-20251001');

        const secondChunks = await drain(
            gateway.chat({
                messages: [
                    { role: 'user', content: 'go' },
                    {
                        role: 'assistant',
                        content: null,
                        toolCalls: [{ id: 'toolu_1', name: 'list_nodes', args: '{}' }],
                    },
                    { role: 'tool', content: '{"nodes":[]}', toolCallId: 'toolu_1' },
                ],
                tools: [],
            })
        );
        expect(secondChunks.find(c => c.done)?.actualModel).toBe('claude-haiku-4-5-20251001');
    });

    it('a missing top-level model leaves actualModel undefined — never fabricated from the requested model', async () => {
        const http = new ScriptedHttpClient([{ json: anthropicText('hi') }]); // no `model` field at all

        const chunks = await drain(createGateway(http).chat(userSays('q')));

        const done = chunks.find(c => c.done);
        expect(done).not.toHaveProperty('actualModel');
    });

    it('an empty-string top-level model leaves actualModel undefined', async () => {
        const http = new ScriptedHttpClient([{ json: { ...anthropicText('hi'), model: '' } }]);

        const chunks = await drain(createGateway(http).chat(userSays('q')));

        expect(chunks.find(c => c.done)).not.toHaveProperty('actualModel');
    });

    it('a non-string top-level model (malformed response) leaves actualModel undefined rather than throwing or coercing', async () => {
        const http = new ScriptedHttpClient([{ json: { ...anthropicText('hi'), model: 12345 } }]);

        const chunks = await drain(createGateway(http).chat(userSays('q')));

        expect(chunks.find(c => c.done)).not.toHaveProperty('actualModel');
    });

    it('reporting actualModel changes nothing else about text/tool-call/usage/error parsing (no regression)', async () => {
        const http = new ScriptedHttpClient([
            {
                json: {
                    ...anthropicToolUse('toolu_1', 'move_node', { nodeId: 'text-1' }),
                    model: 'claude-haiku-4-5-20251001',
                },
            },
        ]);

        const chunks = await drain(createGateway(http).chat(userSays('move it')));

        expect(chunks).toEqual([
            { toolCall: { id: 'toolu_1', name: 'move_node', argsDelta: '{"nodeId":"text-1"}' } },
            {
                done: true,
                usage: withAnthropicCost({ inputTokens: 20, outputTokens: 8 }),
                actualModel: 'claude-haiku-4-5-20251001',
            },
        ]);
    });

    it('requestedModel (the gateway’s own `model`) and actualModel stay independently reported and can differ', async () => {
        const http = new ScriptedHttpClient([
            { json: { ...anthropicText('hi'), model: 'claude-haiku-4-5-20251001' } },
        ]);
        const gateway = createGateway(http);

        expect(gateway.model).toBe('claude-haiku-4-5'); // the bare alias requested
        const chunks = await drain(gateway.chat(userSays('q')));
        expect(chunks.find(c => c.done)?.actualModel).toBe('claude-haiku-4-5-20251001'); // the pinned snapshot served
        expect(gateway.model).not.toBe(chunks.find(c => c.done)?.actualModel);
    });
});
