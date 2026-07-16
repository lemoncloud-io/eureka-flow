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
    it('declares itself as a text-only gemini-2.5-flash gateway', () => {
        const gateway = createGateway(new ScriptedHttpRequest());

        expect(gateway.capabilities).toEqual({ toolCalls: false });
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

    it('rejects tool definitions and tool messages while text-only', async () => {
        const gateway = createGateway(new ScriptedHttpRequest());

        await expect(
            drain(
                gateway.chat({
                    messages: [{ role: 'user', content: 'q' }],
                    tools: [{ name: 'move_node', description: 'move', parameters: { type: 'object' } }],
                })
            )
        ).rejects.toThrow(/text-only.*tool definitions/);

        await expect(
            drain(gateway.chat({ messages: [{ role: 'tool', content: '{}', toolCallId: 'c1' }], tools: [] }))
        ).rejects.toThrow(/text-only.*tool messages/);
    });

    it('throws on non-ok responses with the status but never the API key', async () => {
        const http = new ScriptedHttpRequest([{ status: 429, text: 'rate limited' }]);
        const trace = new BufferAgentTraceReporter();

        const attempt = drain(createGateway(http, trace).chat(userSays('q')));

        await expect(attempt).rejects.toThrow(/status 429.*rate limited/);
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

    it('throws when the response has no candidates', async () => {
        const http = new ScriptedHttpRequest([{ json: { candidates: [] } }]);

        await expect(drain(createGateway(http).chat(userSays('q')))).rejects.toThrow(/no candidates/);
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
