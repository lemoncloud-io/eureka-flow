import { describe, expect, it } from 'vitest';

import { createVirtualAgentEnvironment } from '../../environment/createVirtualAgentEnvironment';
import { BufferAgentTraceReporter } from '../../environment/trace/traceReporters';
import { ScriptedHttpRequest } from '../../http/ScriptedHttpRequest';
import { createGeminiLlmGateway } from '../../llm/GeminiLlmGateway';

import type { Chunk } from '../../llm/llmGateway';

const API_KEY = 'test-gemini-key';

const geminiReply = (text: string) => ({
    candidates: [{ content: { parts: [{ text }] } }],
    usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 34 },
});

const createGateway = (http: ScriptedHttpRequest, traceReporter?: BufferAgentTraceReporter) =>
    createGeminiLlmGateway({
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

describe('createGeminiLlmGateway', () => {
    it('declares itself as a tool-capable gemini-2.5-flash gateway', () => {
        const gateway = createGateway(new ScriptedHttpRequest());

        expect(gateway.capabilities).toEqual({ toolCalls: true });
        expect(gateway.provider).toBe('gemini');
        expect(gateway.model).toBe('gemini-2.5-flash');
    });

    it('authenticates via header, never the URL', async () => {
        const http = new ScriptedHttpRequest([{ json: geminiReply('hi') }]);

        await drain(createGateway(http).chat(userSays('hello')));

        const request = http.requests[0];
        expect(request.method).toBe('POST');
        expect(request.url).toBe(
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'
        );
        expect(request.url).not.toContain(API_KEY);
        expect(request.headers?.['x-goog-api-key']).toBe(API_KEY);
    });

    it('maps system messages to systemInstruction and assistant turns to the model role', async () => {
        const http = new ScriptedHttpRequest([{ json: geminiReply('ok') }]);
        const gateway = createGeminiLlmGateway({
            environment: createVirtualAgentEnvironment(),
            http,
            apiKey: API_KEY,
            generation: { temperature: 0.2, maxOutputTokens: 64 },
        });

        await drain(
            gateway.chat({
                messages: [
                    { role: 'system', content: 'be brief' },
                    { role: 'user', content: 'question' },
                    { role: 'assistant', content: 'earlier answer' },
                ],
                tools: [],
            })
        );

        const body = http.requests[0].body as Record<string, unknown>;
        expect(body['systemInstruction']).toEqual({ parts: [{ text: 'be brief' }] });
        expect(body['contents']).toEqual([
            { role: 'user', parts: [{ text: 'question' }] },
            { role: 'model', parts: [{ text: 'earlier answer' }] },
        ]);
        expect(body['generationConfig']).toEqual({ temperature: 0.2, maxOutputTokens: 64 });
    });

    it('yields one text chunk then a done chunk carrying usage', async () => {
        const http = new ScriptedHttpRequest([{ json: geminiReply('the answer') }]);

        const chunks = await drain(createGateway(http).chat(userSays('q')));

        expect(chunks).toEqual([{ text: 'the answer' }, { done: true, usage: { inputTokens: 12, outputTokens: 34 } }]);
    });

    // Regression coverage: the producer must emit the canonical UsageInfo field names
    // (`providerTotalTokens`/`cachedInputTokens`), not the non-existent `totalTokens`/`cachedTokens`
    // it emitted before the fix — every real consumer (wireLog.ts, verificationMetrics.ts,
    // metering.ts) reads the canonical names and would otherwise silently receive `undefined`.
    describe('usage field mapping', () => {
        it('providerTotalTokens survives under its canonical name, not "totalTokens"', async () => {
            const http = new ScriptedHttpRequest([
                {
                    json: {
                        candidates: [{ content: { parts: [{ text: 'ok' }] } }],
                        usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 34, totalTokenCount: 46 },
                    },
                },
            ]);

            const chunks = await drain(createGateway(http).chat(userSays('q')));

            const done = chunks.find(c => c.done);
            expect(done?.usage).toEqual({ inputTokens: 12, outputTokens: 34, providerTotalTokens: 46 });
            expect(done?.usage).not.toHaveProperty('totalTokens');
        });

        it('cachedInputTokens survives under its canonical name, and inputTokens excludes it (never double-counted)', async () => {
            const http = new ScriptedHttpRequest([
                {
                    json: {
                        candidates: [{ content: { parts: [{ text: 'ok' }] } }],
                        usageMetadata: {
                            promptTokenCount: 1000, // already includes the 300 cached below
                            candidatesTokenCount: 50,
                            cachedContentTokenCount: 300,
                        },
                    },
                },
            ]);

            const chunks = await drain(createGateway(http).chat(userSays('q')));

            const done = chunks.find(c => c.done);
            expect(done?.usage).toEqual({ inputTokens: 700, outputTokens: 50, cachedInputTokens: 300 });
            expect(done?.usage).not.toHaveProperty('cachedTokens');
        });

        it('thinking/reasoning token cost baked into totalTokenCount is not accidentally lost', async () => {
            // Gemini's totalTokenCount is prompt + candidates + toolUsePrompt + thoughts, four
            // additive terms — here it is deliberately larger than promptTokenCount +
            // candidatesTokenCount alone, simulating hidden thinking-token cost. metering.ts derives
            // "visible output + thinking" as `providerTotalTokens - inputTokens`, so a producer that
            // silently dropped or recomputed the total (rather than passing it through as reported)
            // would erase that hidden cost from every downstream cost/metering consumer.
            const http = new ScriptedHttpRequest([
                {
                    json: {
                        candidates: [{ content: { parts: [{ text: 'ok' }] } }],
                        usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 34, totalTokenCount: 90 },
                    },
                },
            ]);

            const chunks = await drain(createGateway(http).chat(userSays('q')));

            const done = chunks.find(c => c.done);
            expect(done?.usage?.providerTotalTokens).toBe(90);
            expect(done?.usage?.providerTotalTokens).toBeGreaterThan(
                (done?.usage?.inputTokens ?? 0) + (done?.usage?.outputTokens ?? 0)
            );
        });

        it('omits providerTotalTokens/cachedInputTokens entirely when the provider does not report them, never fabricating 0', async () => {
            const http = new ScriptedHttpRequest([{ json: geminiReply('the answer') }]);

            const chunks = await drain(createGateway(http).chat(userSays('q')));

            const done = chunks.find(c => c.done);
            expect(done?.usage).not.toHaveProperty('providerTotalTokens');
            expect(done?.usage).not.toHaveProperty('cachedInputTokens');
        });
    });

    it('honors model and baseUrl overrides (the proxy path)', async () => {
        const http = new ScriptedHttpRequest([{ json: geminiReply('ok') }]);
        const gateway = createGeminiLlmGateway({
            environment: createVirtualAgentEnvironment(),
            http,
            apiKey: API_KEY,
            model: 'gemini-2.5-pro',
            baseUrl: 'https://proxy.internal/gemini',
        });

        await drain(gateway.chat(userSays('q')));

        expect(http.requests[0].url).toBe('https://proxy.internal/gemini/v1beta/models/gemini-2.5-pro:generateContent');
    });

    it('passes the abort signal through to the HTTP port', async () => {
        const http = new ScriptedHttpRequest([{ json: geminiReply('ok') }]);
        const controller = new AbortController();

        await drain(createGateway(http).chat(userSays('q'), { signal: controller.signal }));

        expect(http.requests[0].signal).toBe(controller.signal);
    });

    it('advertises tools as Gemini functionDeclarations', async () => {
        const http = new ScriptedHttpRequest([{ json: geminiReply('ok') }]);

        await drain(
            createGateway(http).chat({
                messages: [{ role: 'user', content: 'move it' }],
                tools: [
                    {
                        name: 'move_node',
                        description: 'move a node',
                        parameters: {
                            type: 'object',
                            properties: { nodeId: { type: 'string' } },
                            required: ['nodeId'],
                        },
                    },
                ],
            })
        );

        expect((http.requests[0].body as Record<string, unknown>)['tools']).toEqual([
            {
                functionDeclarations: [
                    {
                        name: 'move_node',
                        description: 'move a node',
                        parameters: {
                            type: 'object',
                            properties: { nodeId: { type: 'string' } },
                            required: ['nodeId'],
                        },
                    },
                ],
            },
        ]);
    });

    it('maps prior tool calls/results to functionCall/functionResponse parts (name recovered by id)', async () => {
        const http = new ScriptedHttpRequest([{ json: geminiReply('done') }]);

        await drain(
            createGateway(http).chat({
                messages: [
                    { role: 'user', content: 'move n1' },
                    {
                        role: 'assistant',
                        content: null,
                        toolCalls: [{ id: 'call-1', name: 'move_node', args: '{"nodeId":"n1"}' }],
                    },
                    // Tool messages carry only the call id; the function name is recovered from the assistant call.
                    { role: 'tool', content: '{"ok":true}', toolCallId: 'call-1' },
                ],
                tools: [{ name: 'move_node', description: 'move', parameters: { type: 'object' } }],
            })
        );

        expect((http.requests[0].body as Record<string, unknown>)['contents']).toEqual([
            { role: 'user', parts: [{ text: 'move n1' }] },
            { role: 'model', parts: [{ functionCall: { name: 'move_node', args: { nodeId: 'n1' } } }] },
            { role: 'user', parts: [{ functionResponse: { name: 'move_node', response: { ok: true } } }] },
        ]);
    });

    it('groups parallel tool results into ONE user content (response count must match the model turn)', async () => {
        // A model turn with N functionCalls must be answered by a single user turn with N functionResponses
        // (the response-part count must match the call-part count). So two parallel calls come back grouped
        // into one user turn, not split across two.
        const http = new ScriptedHttpRequest([{ json: geminiReply('done') }]);

        await drain(
            createGateway(http).chat({
                messages: [
                    { role: 'user', content: 'add two' },
                    {
                        role: 'assistant',
                        content: null,
                        toolCalls: [
                            { id: 'c1', name: 'add_node', args: '{"type":"a"}' },
                            { id: 'c2', name: 'add_node', args: '{"type":"b"}' },
                        ],
                    },
                    { role: 'tool', content: '{"nodeId":"n1"}', toolCallId: 'c1' },
                    { role: 'tool', content: '{"nodeId":"n2"}', toolCallId: 'c2' },
                ],
                tools: [{ name: 'add_node', description: 'add', parameters: { type: 'object' } }],
            })
        );

        expect((http.requests[0].body as Record<string, unknown>)['contents']).toEqual([
            { role: 'user', parts: [{ text: 'add two' }] },
            {
                role: 'model',
                parts: [
                    { functionCall: { name: 'add_node', args: { type: 'a' } } },
                    { functionCall: { name: 'add_node', args: { type: 'b' } } },
                ],
            },
            {
                role: 'user',
                parts: [
                    { functionResponse: { name: 'add_node', response: { nodeId: 'n1' } } },
                    { functionResponse: { name: 'add_node', response: { nodeId: 'n2' } } },
                ],
            },
        ]);
    });

    it('coalesces a trailing user turn into the tool-result content (role alternation is preserved)', async () => {
        // A trailing user text turn that follows the tool results must merge into the SAME user content
        // (functionResponse parts + a text part), preserving role alternation (no two consecutive user
        // contents) and the response-count invariant.
        const http = new ScriptedHttpRequest([{ json: geminiReply('done') }]);

        await drain(
            createGateway(http).chat({
                messages: [
                    { role: 'user', content: 'add one' },
                    {
                        role: 'assistant',
                        content: null,
                        toolCalls: [{ id: 'c1', name: 'add_node', args: '{"type":"a"}' }],
                    },
                    { role: 'tool', content: '{"nodeId":"n1"}', toolCallId: 'c1' },
                    { role: 'user', content: 'Current canvas: n1' },
                ],
                tools: [{ name: 'add_node', description: 'add', parameters: { type: 'object' } }],
            })
        );

        expect((http.requests[0].body as Record<string, unknown>)['contents']).toEqual([
            { role: 'user', parts: [{ text: 'add one' }] },
            { role: 'model', parts: [{ functionCall: { name: 'add_node', args: { type: 'a' } } }] },
            {
                role: 'user',
                parts: [
                    { functionResponse: { name: 'add_node', response: { nodeId: 'n1' } } },
                    { text: 'Current canvas: n1' },
                ],
            },
        ]);
    });

    it('streams a response functionCall as a toolCall chunk (synthesized id), then done', async () => {
        const args = { nodeId: 'n1', by: { dx: 20, dy: 0 } };
        const http = new ScriptedHttpRequest([
            {
                json: {
                    candidates: [{ content: { parts: [{ functionCall: { name: 'move_node', args } }] } }],
                    usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 7 },
                },
            },
        ]);

        const chunks = await drain(
            createGateway(http).chat({
                messages: [{ role: 'user', content: 'nudge n1 right' }],
                tools: [{ name: 'move_node', description: 'move', parameters: { type: 'object' } }],
            })
        );

        expect(chunks).toEqual([
            { toolCall: { id: 'gemini-call-1', name: 'move_node', argsDelta: JSON.stringify(args) } },
            { done: true, usage: { inputTokens: 5, outputTokens: 7 } },
        ]);
    });

    it('throws on a non-retryable non-ok response with the status but never the API key', async () => {
        // 400 is not retryable (unlike 429/503), so it throws on the first response — the immediate-throw path.
        const http = new ScriptedHttpRequest([{ status: 400, text: 'bad request' }]);
        const trace = new BufferAgentTraceReporter();

        const attempt = drain(createGateway(http, trace).chat(userSays('q')));

        await expect(attempt).rejects.toThrow(/status 400.*bad request/);
        await attempt.catch((error: Error) => expect(error.message).not.toContain(API_KEY));
        expect(trace.entries.some(entry => entry.level === 'error')).toBe(true);
        expect(JSON.stringify(trace.entries)).not.toContain(API_KEY);
    });

    it('redacts the API key when an error body echoes it', async () => {
        const http = new ScriptedHttpRequest([{ status: 400, text: `bad key ${API_KEY}` }]);

        const attempt = drain(createGateway(http).chat(userSays('q')));

        await expect(attempt).rejects.toThrow(/status 400.*bad key \[redacted\]/);
        await attempt.catch((error: Error) => expect(error.message).not.toContain(API_KEY));
    });

    it('retries an empty response once, then recovers', async () => {
        const http = new ScriptedHttpRequest([{ json: { candidates: [] } }, { json: geminiReply('recovered') }]);

        const chunks = await drain(createGateway(http).chat(userSays('q')));

        expect(chunks).toEqual([{ text: 'recovered' }, { done: true, usage: { inputTokens: 12, outputTokens: 34 } }]);
        expect(http.requests).toHaveLength(2); // one empty, one retry that recovered
    });

    it('throws when every attempt has no content parts (surfacing the reason)', async () => {
        const http = new ScriptedHttpRequest([{ json: { candidates: [] } }, { json: { candidates: [] } }]);

        await expect(drain(createGateway(http).chat(userSays('q')))).rejects.toThrow(/no content parts.*no candidates/);
        expect(http.requests).toHaveLength(2); // retried once before giving up
    });

    it('treats an empty STOP candidate as a clean empty finish — no retry, no throw', async () => {
        // gemini-2.5-flash sometimes ends a turn with a STOP candidate carrying no content parts: the model
        // deliberately said nothing and made no tool call. That is a legitimate empty turn, not a failure —
        // end it cleanly (the agent loop stops on a no-tool-call turn) instead of retrying (pointless at
        // temperature 0) or throwing. A `blockReason` or MAX_TOKENS empty is still degenerate and retried.
        const http = new ScriptedHttpRequest([{ json: { candidates: [{ finishReason: 'STOP' }] } }]);

        const chunks = await drain(createGateway(http).chat(userSays('q')));

        expect(chunks).toEqual([{ done: true }]);
        expect(http.requests).toHaveLength(1); // not retried
    });

    it('maps generation.thinkingBudget to generationConfig.thinkingConfig', async () => {
        const http = new ScriptedHttpRequest([{ json: geminiReply('ok') }]);
        const gateway = createGeminiLlmGateway({
            environment: createVirtualAgentEnvironment(),
            http,
            apiKey: API_KEY,
            generation: { thinkingBudget: 0 },
        });

        await drain(gateway.chat(userSays('q')));

        expect((http.requests[0].body as Record<string, unknown>)['generationConfig']).toEqual({
            thinkingConfig: { thinkingBudget: 0 },
        });
    });

    it('traces request and response without leaking the key', async () => {
        const http = new ScriptedHttpRequest([{ json: geminiReply('traced') }]);
        const trace = new BufferAgentTraceReporter();

        await drain(createGateway(http, trace).chat(userSays('q')));

        const messages = trace.entries.map(entry => entry.message);
        expect(messages).toContain('llm.gemini.request');
        expect(messages).toContain('llm.gemini.response');
        expect(JSON.stringify(trace.entries)).not.toContain(API_KEY);
    });
});
