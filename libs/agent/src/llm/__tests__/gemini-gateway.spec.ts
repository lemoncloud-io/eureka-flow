import { describe, expect, it } from 'vitest';

import { createVirtualAgentEnvironment } from '../../environment/createVirtualAgentEnvironment';
import { BufferAgentTraceReporter } from '../../environment/trace/traceReporters';
import { ScriptedHttpRequest } from '../../http/ScriptedHttpRequest';
import { createGeminiLlmGateway } from '../GeminiLlmGateway';

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

describe('createGeminiLlmGateway', () => {
    it('targets gemini-2.5-flash by default and authenticates via header, not URL', async () => {
        const http = new ScriptedHttpRequest([{ json: geminiReply('hi') }]);

        await createGateway(http).complete({ messages: [{ role: 'user', content: 'hello' }] });

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

        await createGateway(http).complete({
            messages: [
                { role: 'system', content: 'be brief' },
                { role: 'user', content: 'question' },
                { role: 'assistant', content: 'earlier answer' },
            ],
            temperature: 0.2,
            maxOutputTokens: 64,
        });

        const body = http.requests[0].body as Record<string, unknown>;
        expect(body['systemInstruction']).toEqual({ parts: [{ text: 'be brief' }] });
        expect(body['contents']).toEqual([
            { role: 'user', parts: [{ text: 'question' }] },
            { role: 'model', parts: [{ text: 'earlier answer' }] },
        ]);
        expect(body['generationConfig']).toEqual({ temperature: 0.2, maxOutputTokens: 64 });
    });

    it('returns text, provider, model, and mapped usage', async () => {
        const http = new ScriptedHttpRequest([{ json: geminiReply('the answer') }]);

        const result = await createGateway(http).complete({ messages: [{ role: 'user', content: 'q' }] });

        expect(result).toEqual({
            text: 'the answer',
            provider: 'gemini',
            model: 'gemini-2.5-flash',
            usage: { inputTokens: 12, outputTokens: 34 },
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

        await gateway.complete({ messages: [{ role: 'user', content: 'q' }] });

        expect(http.requests[0].url).toBe('https://proxy.internal/gemini/v1beta/models/gemini-2.5-pro:generateContent');
    });

    it('throws on non-ok responses with the status but never the API key', async () => {
        const http = new ScriptedHttpRequest([{ status: 429, text: 'rate limited' }]);
        const trace = new BufferAgentTraceReporter();

        const attempt = createGateway(http, trace).complete({ messages: [{ role: 'user', content: 'q' }] });

        await expect(attempt).rejects.toThrow(/status 429.*rate limited/);
        await attempt.catch((error: Error) => expect(error.message).not.toContain(API_KEY));
        expect(trace.entries.some(entry => entry.level === 'error')).toBe(true);
        expect(JSON.stringify(trace.entries)).not.toContain(API_KEY);
    });

    it('redacts the API key when an error body echoes it', async () => {
        const http = new ScriptedHttpRequest([{ status: 400, text: `bad key ${API_KEY}` }]);

        const attempt = createGateway(http).complete({ messages: [{ role: 'user', content: 'q' }] });

        await expect(attempt).rejects.toThrow(/status 400.*bad key \[redacted\]/);
        await attempt.catch((error: Error) => expect(error.message).not.toContain(API_KEY));
    });

    it('throws when the response has no candidates', async () => {
        const http = new ScriptedHttpRequest([{ json: { candidates: [] } }]);

        await expect(createGateway(http).complete({ messages: [{ role: 'user', content: 'q' }] })).rejects.toThrow(
            /no candidates/
        );
    });

    it('traces request and response without leaking the key', async () => {
        const http = new ScriptedHttpRequest([{ json: geminiReply('traced') }]);
        const trace = new BufferAgentTraceReporter();

        await createGateway(http, trace).complete({ messages: [{ role: 'user', content: 'q' }] });

        const messages = trace.entries.map(entry => entry.message);
        expect(messages).toContain('llm.gemini.request');
        expect(messages).toContain('llm.gemini.response');
        expect(JSON.stringify(trace.entries)).not.toContain(API_KEY);
    });
});
