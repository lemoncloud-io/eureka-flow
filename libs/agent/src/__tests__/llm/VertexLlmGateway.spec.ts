import { describe, expect, it, vi } from 'vitest';

import { createVirtualAgentEnvironment } from '../../environment/createVirtualAgentEnvironment';
import { BufferAgentTraceReporter } from '../../environment/trace/traceReporters';
import { ScriptedHttpRequest } from '../../http/ScriptedHttpRequest';
import { createVertexLlmGateway } from '../../llm/GeminiLlmGateway';

import type { Chunk } from '../../llm/llmGateway';

// The Vertex gateway shares the Gemini core (body build, parse, usageMetadata mapping) and differs only in
// transport — the project/location endpoint and an OAuth2 Bearer token instead of x-goog-api-key. These
// offline tests (scripted HTTP) pin exactly that seam: URL shape, Bearer auth, token redaction, and that the
// identical usageMetadata still maps through. See docs/browser-agent/design/vertex-migration.md.

const TOKEN = 'ya29.super-secret-access-token';
const PROJECT = 'my-trial-project';

const vertexReply = (text: string) => ({
    candidates: [{ content: { parts: [{ text }] } }],
    usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 34, totalTokenCount: 60, cachedContentTokenCount: 8 },
});

const drain = async (stream: AsyncIterable<Chunk>): Promise<Chunk[]> => {
    const chunks: Chunk[] = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return chunks;
};

const userSays = (content: string) => ({ messages: [{ role: 'user' as const, content }], tools: [] });

describe('createVertexLlmGateway', () => {
    it('declares itself as a tool-capable vertex gateway', () => {
        const gateway = createVertexLlmGateway({
            environment: createVirtualAgentEnvironment(),
            http: new ScriptedHttpRequest(),
            project: PROJECT,
            getAccessToken: () => TOKEN,
        });

        expect(gateway.capabilities).toEqual({ toolCalls: true });
        expect(gateway.provider).toBe('vertex');
        expect(gateway.model).toBe('gemini-2.5-flash');
    });

    it('POSTs the project/location endpoint with a Bearer token, never the token in the URL', async () => {
        const http = new ScriptedHttpRequest([{ json: vertexReply('hi') }]);
        const gateway = createVertexLlmGateway({
            environment: createVirtualAgentEnvironment(),
            http,
            project: PROJECT,
            location: 'us-central1',
            getAccessToken: () => TOKEN,
        });

        await drain(gateway.chat(userSays('hello')));

        const request = http.requests[0];
        expect(request.method).toBe('POST');
        expect(request.url).toBe(
            'https://us-central1-aiplatform.googleapis.com/v1/projects/my-trial-project/locations/us-central1/publishers/google/models/gemini-2.5-flash:generateContent'
        );
        expect(request.url).not.toContain(TOKEN);
        expect(request.headers?.['Authorization']).toBe(`Bearer ${TOKEN}`);
        expect(request.headers?.['x-goog-api-key']).toBeUndefined(); // NOT the Developer API auth
    });

    it("defaults location to 'global' → the aiplatform.googleapis.com host with a /locations/global path", async () => {
        const http = new ScriptedHttpRequest([{ json: vertexReply('hi') }]);
        const gateway = createVertexLlmGateway({
            environment: createVirtualAgentEnvironment(),
            http,
            project: PROJECT,
            getAccessToken: () => TOKEN,
        });

        await drain(gateway.chat(userSays('hello')));

        expect(http.requests[0].url).toBe(
            'https://aiplatform.googleapis.com/v1/projects/my-trial-project/locations/global/publishers/google/models/gemini-2.5-flash:generateContent'
        );
    });

    it('fetches a fresh token once per chat() call — so an expiring token can refresh', async () => {
        const http = new ScriptedHttpRequest([{ json: vertexReply('a') }, { json: vertexReply('b') }]);
        let n = 0;
        const getAccessToken = vi.fn(async () => `token-${(n += 1)}`);
        const gateway = createVertexLlmGateway({
            environment: createVirtualAgentEnvironment(),
            http,
            project: PROJECT,
            getAccessToken,
        });

        await drain(gateway.chat(userSays('one')));
        await drain(gateway.chat(userSays('two')));

        expect(getAccessToken).toHaveBeenCalledTimes(2); // per chat(), not once at construction
        expect(http.requests[0].headers?.['Authorization']).toBe('Bearer token-1');
        expect(http.requests[1].headers?.['Authorization']).toBe('Bearer token-2');
    });

    it('redacts the access token from an error body before it surfaces', async () => {
        const http = new ScriptedHttpRequest([{ status: 403, text: `PERMISSION_DENIED for ${TOKEN} on the project` }]);
        const gateway = createVertexLlmGateway({
            environment: createVirtualAgentEnvironment(),
            http,
            project: PROJECT,
            getAccessToken: () => TOKEN,
        });

        let err: unknown;
        try {
            await drain(gateway.chat(userSays('q')));
        } catch (e) {
            err = e;
        }

        expect(String(err)).toContain('status 403');
        expect(String(err)).not.toContain(TOKEN); // the secret never leaks…
        expect(String(err)).toContain('[redacted]'); // …it is scrubbed
    });

    it('maps the (identical) usageMetadata onto the done-chunk usage', async () => {
        const http = new ScriptedHttpRequest([{ json: vertexReply('hi') }]);
        const gateway = createVertexLlmGateway({
            environment: createVirtualAgentEnvironment(),
            http,
            project: PROJECT,
            getAccessToken: () => TOKEN,
        });

        const chunks = await drain(gateway.chat(userSays('q')));

        const done = chunks.find(c => c.done);
        expect(done?.usage).toEqual({ inputTokens: 12, outputTokens: 34, totalTokens: 60, cachedTokens: 8 });
    });

    it('traces request and response without leaking the token', async () => {
        const http = new ScriptedHttpRequest([{ json: vertexReply('traced') }]);
        const trace = new BufferAgentTraceReporter();
        const gateway = createVertexLlmGateway({
            environment: createVirtualAgentEnvironment({ traceReporter: trace }),
            http,
            project: PROJECT,
            getAccessToken: () => TOKEN,
        });

        await drain(gateway.chat(userSays('q')));

        expect(JSON.stringify(trace.entries)).not.toContain(TOKEN);
    });

    it('retries a 429 with backoff, then succeeds', async () => {
        const http = new ScriptedHttpRequest([
            { status: 429, text: 'RESOURCE_EXHAUSTED' },
            { json: vertexReply('ok') },
        ]);
        const gateway = createVertexLlmGateway({
            environment: createVirtualAgentEnvironment(),
            http,
            project: PROJECT,
            getAccessToken: () => TOKEN,
            retry: { maxAttempts: 4, baseDelayMs: 1 }, // tiny base so the test stays fast
        });

        const chunks = await drain(gateway.chat(userSays('q')));

        expect(http.requests).toHaveLength(2); // 429, then a successful retry
        expect(chunks.find(c => c.done)?.usage?.totalTokens).toBe(60); // the retry's response flowed through
    });

    it('gives up after maxAttempts on a persistent 429 and throws (token still redacted)', async () => {
        const http = new ScriptedHttpRequest([
            { status: 429, text: `busy ${TOKEN}` },
            { status: 429, text: `busy ${TOKEN}` },
        ]);
        const gateway = createVertexLlmGateway({
            environment: createVirtualAgentEnvironment(),
            http,
            project: PROJECT,
            getAccessToken: () => TOKEN,
            retry: { maxAttempts: 2, baseDelayMs: 1 },
        });

        let err: unknown;
        try {
            await drain(gateway.chat(userSays('q')));
        } catch (e) {
            err = e;
        }

        expect(http.requests).toHaveLength(2); // initial + 1 retry, then gives up
        expect(String(err)).toContain('status 429');
        expect(String(err)).not.toContain(TOKEN);
    });
});
