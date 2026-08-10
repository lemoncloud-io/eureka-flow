import { describe, expect, it } from 'vitest';

import { createInMemoryCanvasBinding } from '../../canvas/inMemoryCanvasBinding';
import { createCatalogLookup } from '../../catalog';
import { createVirtualAgentEnvironment } from '../../environment/createVirtualAgentEnvironment';
import { BufferAgentTraceReporter } from '../../environment/trace/traceReporters';
import { ScriptedHttpRequest } from '../../http/ScriptedHttpRequest';
import { createOpenAiLlmGateway } from '../../llm/OpenAiLlmGateway';
import { PRICING_CONFIG_VERSION, estimateCost, getModelPricing } from '../../llm/pricing';
import { LIST_NODES, MOVE_NODE } from '../../tools/nodeTools';
import { createToolExecutor } from '../../tools/toolExecutor';
import { toolset } from '../../tools/toolset';

import type { AgentConfig } from '../../agent';
import type { HttpRequestSupportable } from '../../http';
import type { Chunk } from '../../llm/llmGateway';
import type { NodeData } from '@lemoncloud/eureka-flows-api';

const API_KEY = 'test-openai-key';

/** A canned OpenAI text reply. */
const openAiText = (content: string) => ({
    choices: [{ message: { role: 'assistant', content } }],
    usage: { prompt_tokens: 12, completion_tokens: 34 },
});

/** A canned OpenAI tool-call reply (content null, one function call). `args` is a JSON string. */
const openAiToolCall = (id: string, name: string, args: string) => ({
    choices: [
        {
            message: {
                role: 'assistant',
                content: null,
                tool_calls: [{ id, type: 'function', function: { name, arguments: args } }],
            },
        },
    ],
    usage: { prompt_tokens: 20, completion_tokens: 8 },
});

const createGateway = (http: ScriptedHttpRequest, traceReporter?: BufferAgentTraceReporter) =>
    createOpenAiLlmGateway({
        environment: createVirtualAgentEnvironment({ ...(traceReporter ? { traceReporter } : {}), now: () => 1000 }),
        http,
        apiKey: API_KEY,
    });

/** Every offline test below uses the default model (`gpt-4o-mini`, registered/priced in
 * pricing.ts) with no baseUrl override (direct OpenAI), so every done chunk now also carries a
 * computed `estimatedCost`/`costSource` — expected here via the same `estimateCost`
 * pricing.spec.ts verifies in isolation, not a hand-typed literal that would silently drift. */
const withOpenAiCost = (usage: { inputTokens: number; outputTokens: number }) => ({
    ...usage,
    estimatedCost: estimateCost('openai', 'gpt-4o-mini', usage),
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

const makeNode = (id: string, x: number, y: number, extra: Partial<NodeData> = {}): NodeData => ({
    id,
    type: 'test',
    position: { x, y },
    ...extra,
});

describe('createOpenAiLlmGateway', () => {
    it('declares itself a tool-capable openai gateway with the default model', () => {
        const gateway = createGateway(new ScriptedHttpRequest());

        expect(gateway.capabilities).toEqual({ toolCalls: true });
        expect(gateway.provider).toBe('openai');
        expect(gateway.model).toBe('gpt-4o-mini');
    });

    it('authenticates via the Authorization header, never the URL, and posts to /chat/completions', async () => {
        const http = new ScriptedHttpRequest([{ json: openAiText('hi') }]);

        await drain(createGateway(http).chat(userSays('hello')));

        const request = http.requests[0];
        expect(request.method).toBe('POST');
        expect(request.url).toBe('https://api.openai.com/v1/chat/completions');
        expect(request.url).not.toContain(API_KEY);
        expect(request.headers?.['authorization']).toBe(`Bearer ${API_KEY}`);
    });

    it('maps system/user/assistant/tool messages and tool definitions into the OpenAI request shape', async () => {
        const http = new ScriptedHttpRequest([{ json: openAiText('ok') }]);

        await drain(
            createGateway(http).chat({
                messages: [
                    { role: 'system', content: 'be brief' },
                    { role: 'user', content: 'move it' },
                    {
                        role: 'assistant',
                        content: null,
                        toolCalls: [{ id: 'c1', name: 'move_node', args: '{"nodeId":"n1"}' }],
                    },
                    { role: 'tool', content: '{"ok":true}', toolCallId: 'c1' },
                ],
                tools: [
                    { name: 'move_node', description: 'move a node', parameters: { type: 'object', properties: {} } },
                ],
            })
        );

        const body = http.requests[0].body as Record<string, unknown>;
        expect(body['messages']).toEqual([
            { role: 'system', content: 'be brief' },
            { role: 'user', content: 'move it' },
            {
                role: 'assistant',
                content: null,
                tool_calls: [
                    { id: 'c1', type: 'function', function: { name: 'move_node', arguments: '{"nodeId":"n1"}' } },
                ],
            },
            { role: 'tool', content: '{"ok":true}', tool_call_id: 'c1' },
        ]);
        expect(body['tools']).toEqual([
            {
                type: 'function',
                function: {
                    name: 'move_node',
                    description: 'move a node',
                    parameters: { type: 'object', properties: {} },
                },
            },
        ]);
        expect(body['tool_choice']).toBe('auto');
    });

    it('maps a tool-result message with null content to an empty string rather than null', async () => {
        const http = new ScriptedHttpRequest([{ json: openAiText('ok') }]);

        await drain(
            createGateway(http).chat({
                messages: [
                    { role: 'user', content: 'go' },
                    { role: 'assistant', content: null, toolCalls: [{ id: 'c1', name: 'move_node', args: '{}' }] },
                    { role: 'tool', content: null, toolCallId: 'c1' },
                ],
                tools: [],
            })
        );

        const body = http.requests[0].body as Record<string, unknown>;
        const messages = body['messages'] as Array<Record<string, unknown>>;
        expect(messages[2]).toEqual({ role: 'tool', content: '', tool_call_id: 'c1' });
    });

    it('maps a plain (non-tool, non-tool-call) message with null content through as null on the wire, never coerced to a string', async () => {
        const http = new ScriptedHttpRequest([{ json: openAiText('ok') }]);

        await drain(createGateway(http).chat({ messages: [{ role: 'user', content: null }], tools: [] }));

        const body = http.requests[0].body as Record<string, unknown>;
        expect(body['messages']).toEqual([{ role: 'user', content: null }]);
    });

    it('never forwards a thoughtSignature to OpenAI — the request body stays byte-identical to a signature-less replay', async () => {
        // `thoughtSignature` is a Gemini-only continuation token (see ChatMessage.toolCalls's doc
        // in llmGateway.ts). A transcript that passed through a Gemini turn can legitimately carry
        // one on the shared ChatMessage shape; the OpenAI wire mapping must drop it entirely.
        const buildRequest = (thoughtSignature?: string) => ({
            messages: [
                { role: 'user' as const, content: 'go' },
                {
                    role: 'assistant' as const,
                    content: null,
                    toolCalls: [
                        {
                            id: 'c1',
                            name: 'list_nodes',
                            args: '{}',
                            ...(thoughtSignature !== undefined ? { thoughtSignature } : {}),
                        },
                    ],
                },
                { role: 'tool' as const, content: '{"nodes":[]}', toolCallId: 'c1' },
            ],
            tools: [],
        });
        const http = new ScriptedHttpRequest([{ json: openAiText('ok') }, { json: openAiText('ok') }]);
        const gateway = createGateway(http);

        await drain(gateway.chat(buildRequest('opaque-sig-abc')));
        await drain(gateway.chat(buildRequest()));

        expect(JSON.stringify(http.requests[0].body)).toBe(JSON.stringify(http.requests[1].body));
        expect(JSON.stringify(http.requests[0].body)).not.toContain('opaque-sig-abc');
        expect(JSON.stringify(http.requests[0].body)).not.toContain('thoughtSignature');
    });

    it('omits tools and tool_choice when the request carries no tools', async () => {
        const http = new ScriptedHttpRequest([{ json: openAiText('ok') }]);

        await drain(createGateway(http).chat(userSays('q')));

        const body = http.requests[0].body as Record<string, unknown>;
        expect(body).not.toHaveProperty('tools');
        expect(body).not.toHaveProperty('tool_choice');
    });

    it('maps generation params into temperature and max_tokens', async () => {
        const http = new ScriptedHttpRequest([{ json: openAiText('ok') }]);
        const gateway = createOpenAiLlmGateway({
            environment: createVirtualAgentEnvironment(),
            http,
            apiKey: API_KEY,
            generation: { temperature: 0.2, maxOutputTokens: 64 },
        });

        await drain(gateway.chat(userSays('q')));

        const body = http.requests[0].body as Record<string, unknown>;
        expect(body['temperature']).toBe(0.2);
        expect(body['max_tokens']).toBe(64);
    });

    it('sends reasoning_effort only when explicitly configured', async () => {
        // Needed for OpenAI's gpt-5.6 family, which rejects a tools-bearing /v1/chat/completions
        // request unless reasoning_effort is explicitly 'none' (confirmed live, 2026-08-07) — every
        // other model has no such requirement, so this must stay opt-in, never a default.
        const http = new ScriptedHttpRequest([{ json: openAiText('ok') }]);
        const gateway = createOpenAiLlmGateway({
            environment: createVirtualAgentEnvironment(),
            http,
            apiKey: API_KEY,
            generation: { reasoningEffort: 'none' },
        });

        await drain(gateway.chat(userSays('q')));

        const body = http.requests[0].body as Record<string, unknown>;
        expect(body['reasoning_effort']).toBe('none');
    });

    it('omits reasoning_effort when not configured', async () => {
        const http = new ScriptedHttpRequest([{ json: openAiText('ok') }]);

        await drain(createGateway(http).chat(userSays('q')));

        const body = http.requests[0].body as Record<string, unknown>;
        expect(body).not.toHaveProperty('reasoning_effort');
    });

    it('yields a text chunk then a done chunk carrying usage', async () => {
        const http = new ScriptedHttpRequest([{ json: openAiText('the answer') }]);

        const chunks = await drain(createGateway(http).chat(userSays('q')));

        expect(chunks).toEqual([
            { text: 'the answer' },
            { done: true, usage: withOpenAiCost({ inputTokens: 12, outputTokens: 34 }) },
        ]);
    });

    it("carries the response body's model as actualModel on the done chunk when the provider reports it", async () => {
        // Matters most through OpenRouter, where a route like `openrouter/free` can be served by
        // a different underlying model than requested — never assumed equal to the request's model.
        const http = new ScriptedHttpRequest([
            { json: { ...openAiText('ok'), model: 'meta-llama/llama-3.1-8b-instruct:free' } },
        ]);
        const gateway = createOpenAiLlmGateway({
            environment: createVirtualAgentEnvironment(),
            http,
            apiKey: API_KEY,
            model: 'openrouter/free',
            baseUrl: 'https://openrouter.ai/api/v1',
        });

        const chunks = await drain(gateway.chat(userSays('q')));

        const done = chunks.find(c => c.done);
        expect(done?.actualModel).toBe('meta-llama/llama-3.1-8b-instruct:free');
    });

    it('omits actualModel when the response body carries no model field — never fabricates one', async () => {
        const http = new ScriptedHttpRequest([{ json: openAiText('ok') }]);

        const chunks = await drain(createGateway(http).chat(userSays('q')));

        const done = chunks.find(c => c.done);
        expect(done).not.toHaveProperty('actualModel');
    });

    it('parses a tool-call response (content null) into a toolCall chunk, no error on empty content', async () => {
        const http = new ScriptedHttpRequest([
            { json: openAiToolCall('call_1', 'move_node', '{"nodeId":"text-1","by":{"dx":100,"dy":0}}') },
        ]);

        const chunks = await drain(createGateway(http).chat(userSays('move the text input 100 right')));

        expect(chunks).toEqual([
            { toolCall: { id: 'call_1', name: 'move_node', argsDelta: '{"nodeId":"text-1","by":{"dx":100,"dy":0}}' } },
            { done: true, usage: withOpenAiCost({ inputTokens: 20, outputTokens: 8 }) },
        ]);
    });

    it('honors model and baseUrl overrides (the OpenRouter / proxy path)', async () => {
        const http = new ScriptedHttpRequest([{ json: openAiText('ok') }]);
        const gateway = createOpenAiLlmGateway({
            environment: createVirtualAgentEnvironment(),
            http,
            apiKey: API_KEY,
            model: 'openai/gpt-4o-mini',
            baseUrl: 'https://openrouter.ai/api/v1',
        });

        await drain(gateway.chat(userSays('q')));

        expect(http.requests[0].url).toBe('https://openrouter.ai/api/v1/chat/completions');
        expect((http.requests[0].body as Record<string, unknown>)['model']).toBe('openai/gpt-4o-mini');
    });

    it('omits usage entirely from the done chunk when the response reports no usage at all', async () => {
        const http = new ScriptedHttpRequest([
            { json: { choices: [{ message: { role: 'assistant', content: 'hi' } }] } },
        ]);

        const chunks = await drain(createGateway(http).chat(userSays('q')));

        expect(chunks).toEqual([{ text: 'hi' }, { done: true }]);
    });

    describe('usage/cost mapping', () => {
        it('reports only estimatedCost: null when the response provides a bare empty usage object — every token field left undefined, not fabricated', async () => {
            const http = new ScriptedHttpRequest([
                { json: { choices: [{ message: { role: 'assistant', content: 'ok' } }], usage: {} } },
            ]);

            const chunks = await drain(createGateway(http).chat(userSays('q')));
            const done = chunks.find(c => c.done);

            expect(done?.usage).toEqual({ estimatedCost: null });
        });

        it('subtracts prompt_tokens_details.cached_tokens from prompt_tokens for inputTokens — never double-counted', async () => {
            const http = new ScriptedHttpRequest([
                {
                    json: {
                        choices: [{ message: { role: 'assistant', content: 'ok' } }],
                        usage: {
                            prompt_tokens: 1000, // already includes the 400 cached below
                            prompt_tokens_details: { cached_tokens: 400 },
                            completion_tokens: 50,
                        },
                    },
                },
            ]);

            const chunks = await drain(createGateway(http).chat(userSays('q')));
            const done = chunks.find(c => c.done);

            expect(done?.usage?.inputTokens).toBe(600);
            expect(done?.usage?.cachedInputTokens).toBe(400);
        });

        it('also subtracts prompt_tokens_details.cache_write_tokens from prompt_tokens', async () => {
            const http = new ScriptedHttpRequest([
                {
                    json: {
                        choices: [{ message: { role: 'assistant', content: 'ok' } }],
                        usage: {
                            prompt_tokens: 1000,
                            prompt_tokens_details: { cached_tokens: 200, cache_write_tokens: 300 },
                            completion_tokens: 50,
                        },
                    },
                },
            ]);

            const chunks = await drain(createGateway(http).chat(userSays('q')));
            const done = chunks.find(c => c.done);

            expect(done?.usage?.inputTokens).toBe(500); // 1000 - 200 - 300
            expect(done?.usage?.cachedInputTokens).toBe(200);
            expect(done?.usage?.cacheWriteInputTokens).toBe(300);
        });

        it('returns estimatedCost: null when nonzero cache_write_tokens make the calculation ambiguous, while still preserving it as raw usage metadata', async () => {
            // OpenAI's own guide documents cache_write_tokens as a subset of prompt_tokens (its
            // own worked example: 2,006 prompt_tokens = 1,920 cached_tokens + 0 cache_write_tokens
            // + the rest uncached) — but OpenAI has ALSO confirmed a real billing bug where
            // cached_tokens + cache_write_tokens summed to nearly double prompt_tokens for
            // "certain types of requests" (community.openai.com/t/question-about-gpt-5-6-api-
            // cache-read-write-token-billing/1386256, confirmed by OpenAI staff, refunds issued).
            // Since that report never pinned down exactly which request types were affected, any
            // nonzero cache_write_tokens is treated as ambiguous for cost purposes — never
            // silently priced using an inclusion relationship OpenAI's own system has gotten
            // wrong in production.
            const http = new ScriptedHttpRequest([
                {
                    json: {
                        choices: [{ message: { role: 'assistant', content: 'ok' } }],
                        usage: {
                            prompt_tokens: 1_000_000,
                            prompt_tokens_details: { cached_tokens: 200_000, cache_write_tokens: 100_000 },
                            completion_tokens: 50_000,
                        },
                    },
                },
            ]);

            const chunks = await drain(createGateway(http).chat(userSays('q')));
            const done = chunks.find(c => c.done);

            // Raw usage metadata is still preserved, untouched — only the cost figure is withheld.
            expect(done?.usage?.inputTokens).toBe(700_000);
            expect(done?.usage?.cachedInputTokens).toBe(200_000);
            expect(done?.usage?.cacheWriteInputTokens).toBe(100_000);
            expect(done?.usage?.outputTokens).toBe(50_000);

            expect(done?.usage?.estimatedCost).toBeNull();
            expect(done?.usage).not.toHaveProperty('costSource');
        });

        it('still computes a normal estimatedCost when cache_write_tokens is absent or exactly 0 (the unambiguous case)', async () => {
            const http = new ScriptedHttpRequest([
                {
                    json: {
                        choices: [{ message: { role: 'assistant', content: 'ok' } }],
                        usage: {
                            prompt_tokens: 1000,
                            prompt_tokens_details: { cached_tokens: 200, cache_write_tokens: 0 },
                            completion_tokens: 50,
                        },
                    },
                },
            ]);

            const chunks = await drain(createGateway(http).chat(userSays('q')));
            const done = chunks.find(c => c.done);

            expect(done?.usage?.estimatedCost).not.toBeNull();
            expect(done?.usage?.costSource).toBe('estimated');
        });

        it('subtracts completion_tokens_details.reasoning_tokens from completion_tokens for outputTokens — never double-counted', async () => {
            const http = new ScriptedHttpRequest([
                {
                    json: {
                        choices: [{ message: { role: 'assistant', content: 'ok' } }],
                        usage: {
                            prompt_tokens: 50,
                            completion_tokens: 1000, // already includes the 700 reasoning below
                            completion_tokens_details: { reasoning_tokens: 700 },
                        },
                    },
                },
            ]);

            const chunks = await drain(createGateway(http).chat(userSays('q')));
            const done = chunks.find(c => c.done);

            expect(done?.usage?.outputTokens).toBe(300);
            expect(done?.usage?.reasoningTokens).toBe(700);
        });

        it('clamps outputTokens to 0 rather than going negative if reasoning_tokens ever exceeded completion_tokens', async () => {
            const http = new ScriptedHttpRequest([
                {
                    json: {
                        choices: [{ message: { role: 'assistant', content: 'ok' } }],
                        usage: {
                            prompt_tokens: 50,
                            completion_tokens: 100,
                            completion_tokens_details: { reasoning_tokens: 150 },
                        },
                    },
                },
            ]);

            const chunks = await drain(createGateway(http).chat(userSays('q')));
            const done = chunks.find(c => c.done);

            expect(done?.usage?.outputTokens).toBe(0);
        });

        it('passes providerTotalTokens through as the raw total_tokens, never recomputed locally', async () => {
            const http = new ScriptedHttpRequest([
                {
                    json: {
                        choices: [{ message: { role: 'assistant', content: 'ok' } }],
                        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
                    },
                },
            ]);

            const chunks = await drain(createGateway(http).chat(userSays('q')));
            const done = chunks.find(c => c.done);

            expect(done?.usage?.providerTotalTokens).toBe(150);
        });

        it('computes estimatedCost for a direct OpenAI call against pricing.ts', async () => {
            const http = new ScriptedHttpRequest([
                {
                    json: {
                        choices: [{ message: { role: 'assistant', content: 'ok' } }],
                        usage: { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 },
                    },
                },
            ]);

            const chunks = await drain(createGateway(http).chat(userSays('q')));
            const done = chunks.find(c => c.done);

            const pricing = getModelPricing('openai', 'gpt-4o-mini');
            if (!pricing) throw new Error('expected gpt-4o-mini to be priced');
            expect(done?.usage?.estimatedCost).toBeCloseTo(pricing.inputPerMillion + pricing.outputPerMillion, 10);
            expect(done?.usage?.costSource).toBe('estimated');
        });

        it("prefers OpenRouter's provider-reported usage.cost over a local estimate", async () => {
            const http = new ScriptedHttpRequest([
                {
                    json: {
                        choices: [{ message: { role: 'assistant', content: 'ok' } }],
                        usage: { prompt_tokens: 100, completion_tokens: 50, cost: 0.00012345 },
                    },
                },
            ]);
            const gateway = createOpenAiLlmGateway({
                environment: createVirtualAgentEnvironment(),
                http,
                apiKey: API_KEY,
                model: 'openrouter/free',
                baseUrl: 'https://openrouter.ai/api/v1',
            });

            const chunks = await drain(gateway.chat(userSays('q')));
            const done = chunks.find(c => c.done);

            expect(done?.usage?.providerReportedCost).toBe(0.00012345);
            expect(done?.usage?.costSource).toBe('provider-reported');
            // The provider-reported figure is authoritative — never overwritten by a local guess.
            expect(done?.usage).not.toHaveProperty('estimatedCost');
        });

        it('treats a provider-reported cost of exactly 0 as a real, present value — distinct from no cost field at all', async () => {
            const http = new ScriptedHttpRequest([
                {
                    json: {
                        choices: [{ message: { role: 'assistant', content: 'ok' } }],
                        usage: { prompt_tokens: 100, completion_tokens: 50, cost: 0 },
                    },
                },
            ]);
            const gateway = createOpenAiLlmGateway({
                environment: createVirtualAgentEnvironment(),
                http,
                apiKey: API_KEY,
                model: 'openrouter/free',
                baseUrl: 'https://openrouter.ai/api/v1',
            });

            const chunks = await drain(gateway.chat(userSays('q')));
            const done = chunks.find(c => c.done);

            // A real, reported "$0.00" (e.g. a genuine free-tier route) — present and provider-reported,
            // never conflated with "the provider didn't tell us" (which stays undefined, see below).
            expect(done?.usage).toHaveProperty('providerReportedCost');
            expect(done?.usage?.providerReportedCost).toBe(0);
            expect(done?.usage?.costSource).toBe('provider-reported');
        });

        it('never locally estimates cost for a baseUrl-overridden call with no provider-reported cost (OpenRouter/DeepSeek/Qwen/GLM all reuse this gateway, none share OpenAI pricing)', async () => {
            const http = new ScriptedHttpRequest([
                {
                    json: {
                        choices: [{ message: { role: 'assistant', content: 'ok' } }],
                        usage: { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 }, // no usage.cost
                    },
                },
            ]);
            const gateway = createOpenAiLlmGateway({
                environment: createVirtualAgentEnvironment(),
                http,
                apiKey: API_KEY,
                model: 'openrouter/free',
                baseUrl: 'https://openrouter.ai/api/v1',
            });

            const chunks = await drain(gateway.chat(userSays('q')));
            const done = chunks.find(c => c.done);

            // Tokens are still reported honestly — only cost estimation is withheld.
            expect(done?.usage?.inputTokens).toBe(1_000_000);
            expect(done?.usage).not.toHaveProperty('estimatedCost');
            expect(done?.usage).not.toHaveProperty('providerReportedCost');
            expect(done?.usage).not.toHaveProperty('costSource');
        });

        it('returns estimatedCost: null (not a fabricated 0) for a direct-OpenAI call to an unregistered model', async () => {
            const http = new ScriptedHttpRequest([{ json: openAiText('ok') }]);
            const gateway = createOpenAiLlmGateway({
                environment: createVirtualAgentEnvironment(),
                http,
                apiKey: API_KEY,
                model: 'gpt-does-not-exist',
            });

            const chunks = await drain(gateway.chat(userSays('q')));
            const done = chunks.find(c => c.done);

            expect(done?.usage?.inputTokens).toBe(12);
            expect(done?.usage?.estimatedCost).toBeNull();
        });
    });

    it('passes the abort signal through to the HTTP port', async () => {
        const http = new ScriptedHttpRequest([{ json: openAiText('ok') }]);
        const controller = new AbortController();

        await drain(createGateway(http).chat(userSays('q'), { signal: controller.signal }));

        expect(http.requests[0].signal).toBe(controller.signal);
    });

    it('throws on non-ok responses with the status but never the API key, and traces the error', async () => {
        const http = new ScriptedHttpRequest([{ status: 401, text: `invalid key ${API_KEY}` }]);
        const trace = new BufferAgentTraceReporter();

        const attempt = drain(createGateway(http, trace).chat(userSays('q')));

        await expect(attempt).rejects.toThrow(/status 401.*invalid key \[redacted\]/);
        await attempt.catch((error: Error) => expect(error.message).not.toContain(API_KEY));
        expect(trace.entries.some(entry => entry.level === 'error')).toBe(true);
        expect(JSON.stringify(trace.entries)).not.toContain(API_KEY);
    });

    it('passes an error body through verbatim (no redaction) when apiKey is empty — nothing to scrub', async () => {
        // Guards the redactText early-return itself: without it, `value.split('').join(...)` would
        // splice '[redacted]' between every single character of the body, mangling it completely.
        const http = new ScriptedHttpRequest([{ status: 403, text: 'no secret in this error body' }]);
        const gateway = createOpenAiLlmGateway({
            environment: createVirtualAgentEnvironment(),
            http,
            apiKey: '',
        });

        await expect(drain(gateway.chat(userSays('q')))).rejects.toThrow(
            'OpenAI request failed with status 403: no secret in this error body'
        );
    });

    it('falls back to an empty string when reading the non-ok response body itself fails (response.text() rejects)', async () => {
        const http: HttpRequestSupportable = {
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
        const gateway = createOpenAiLlmGateway({
            environment: createVirtualAgentEnvironment(),
            http,
            apiKey: API_KEY,
        });

        await expect(drain(gateway.chat(userSays('q')))).rejects.toThrow('OpenAI request failed with status 500: ');
    });

    it('throws when the response has no choices', async () => {
        const http = new ScriptedHttpRequest([{ json: { choices: [] } }]);

        await expect(drain(createGateway(http).chat(userSays('q')))).rejects.toThrow(/no choices/);
    });

    it('traces request and response without leaking the key', async () => {
        const http = new ScriptedHttpRequest([{ json: openAiText('traced') }]);
        const trace = new BufferAgentTraceReporter();

        await drain(createGateway(http, trace).chat(userSays('q')));

        const messages = trace.entries.map(entry => entry.message);
        expect(messages).toContain('llm.openai.request');
        expect(messages).toContain('llm.openai.response');
        expect(JSON.stringify(trace.entries)).not.toContain(API_KEY);
    });

    it('omits usage from the traced response entry when the response has no usage at all', async () => {
        // trace?.debug(...) short-circuits its whole argument list when no trace reporter is
        // configured, so the object literal carrying this ternary is only evaluated when a real
        // reporter is wired — this test is what actually exercises its "no usage" branch.
        const http = new ScriptedHttpRequest([
            { json: { choices: [{ message: { role: 'assistant', content: 'hi' } }] } },
        ]);
        const trace = new BufferAgentTraceReporter();

        await drain(createGateway(http, trace).chat(userSays('q')));

        const responseEntry = trace.entries.find(entry => entry.message === 'llm.openai.response');
        expect(responseEntry?.json).not.toHaveProperty('usage');
    });

    // The full offline chain: a canned OpenAI tool-call response flows through the gateway's
    // parsing into a Chunk.toolCall, then through the real ToolExecutor + canvas tools, and
    // moves the node — the same bar the real env-gated test proves against a live provider,
    // but deterministic (no key, no network).
    it('canned tool-call response drives ToolExecutor to move the node (100,200) -> (200,200)', async () => {
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

        const http = new ScriptedHttpRequest([
            { json: openAiToolCall('call_1', 'move_node', '{"nodeId":"text-1","by":{"dx":100,"dy":0}}') },
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
