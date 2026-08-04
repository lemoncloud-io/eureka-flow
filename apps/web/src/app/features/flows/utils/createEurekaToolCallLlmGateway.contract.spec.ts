import { createServer } from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import {
    createCatalogLookup,
    createInMemoryCanvasBinding,
    createNodeMoveToolProvider,
    createNodeReadToolProvider,
    createToolExecutor,
} from '@flows/agent';

import {
    EurekaToolCallHttpError,
    EurekaToolCallInvalidResponseError,
    EurekaToolCallNetworkError,
    EurekaToolCallProviderError,
    createEurekaToolCallLlmGateway,
} from './createEurekaToolCallLlmGateway';

import type { AgentConfig, ChatRequest, Chunk } from '@flows/agent';
import type { Server } from 'node:http';

/**
 * Contract-level tests for the browser production gateway. Every test that exercises the network
 * path spins up a real local HTTP server and points the gateway's `post` hook at it via a real
 * `fetch()` call — the request genuinely leaves the process and comes back over a real socket,
 * the same as it would against a deployed backend. Deliberately NOT `FakeGateway` and NOT a
 * `post` mock that returns canned data in memory without a network round trip — see
 * `docs/browser-agent/foundations/eureka-tool-calling-endpoint-contract.md` for why production
 * acceptance tests must not rely on `FakeGateway` alone.
 *
 * The endpoint itself does not exist yet (see the gateway's own module doc) — this file proves
 * the gateway's side of the contract against a scripted stand-in server, not against the real
 * eureka-flows-api backend or a real provider. Real-provider qualification (layer D) already
 * exists in `libs/agent` as `realLocatorScenarios.spec.ts` / `realProviderToolCall.spec.ts`,
 * env-gated on a real provider key — see `docs/browser-agent/foundations/production-readiness.md`
 * for the full test-layer map. The real-*backend* proof (this browser gateway against a deployed
 * eureka-flows-api) is `browserToolCalling.production.e2e.spec.ts` (this same `utils/` directory)
 * — a deploy-gated placeholder today, not a passing end-to-end test, until that endpoint is
 * actually deployed.
 */

interface RecordedRequest {
    method: string;
    url: string;
    headers: Record<string, string | string[] | undefined>;
    body: unknown;
}

const startTestServer = (
    handler: (req: RecordedRequest) => { status: number; body: unknown }
): Promise<{ server: Server; baseUrl: string; requests: RecordedRequest[] }> => {
    const requests: RecordedRequest[] = [];
    return new Promise(resolve => {
        const server = createServer((req, res) => {
            const chunks: Buffer[] = [];
            req.on('data', (chunk: Buffer) => chunks.push(chunk));
            req.on('end', () => {
                const rawBody = Buffer.concat(chunks).toString('utf8');
                const recorded: RecordedRequest = {
                    method: req.method ?? '',
                    url: req.url ?? '',
                    headers: req.headers,
                    body: rawBody ? JSON.parse(rawBody) : undefined,
                };
                requests.push(recorded);
                const { status, body } = handler(recorded);
                res.writeHead(status, { 'content-type': 'application/json' });
                res.end(JSON.stringify(body));
            });
        });
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            const port = typeof address === 'object' && address ? address.port : 0;
            resolve({ server, baseUrl: `http://127.0.0.1:${port}`, requests });
        });
    });
};

const stopServer = (server: Server): Promise<void> => new Promise(resolve => server.close(() => resolve()));

/** A real network call — genuine `fetch()` to the local test server — wrapped to the `{ data }`
 * shape the gateway's `post` hook expects, matching what `api.post`'s real `AxiosResponse`
 * structurally provides. Mirrors an Axios-style thrown error (`err.response.status`) on a non-2xx
 * status, since that's what the gateway's catch block is written against. */
const makeRealPost = (baseUrl: string) => async (url: string, body: unknown, config: { signal?: AbortSignal }) => {
    const response = await fetch(`${baseUrl}${url}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        ...(config.signal ? { signal: config.signal } : {}),
    });
    if (!response.ok) {
        const err = new Error(`HTTP ${response.status}`) as Error & { response?: { status: number } };
        err.response = { status: response.status };
        throw err;
    }
    return { data: await response.json() };
};

const drain = async (stream: AsyncIterable<Chunk>): Promise<Chunk[]> => {
    const chunks: Chunk[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    return chunks;
};

const CHAT_REQUEST: ChatRequest = {
    messages: [{ role: 'user', content: 'move it' }],
    tools: [
        {
            name: 'move_node',
            description: 'move a node',
            parameters: { type: 'object', properties: { nodeId: { type: 'string' } }, required: ['nodeId'] },
        },
    ],
};

let activeServer: Server | undefined;

afterEach(async () => {
    if (activeServer) {
        await stopServer(activeServer);
        activeServer = undefined;
    }
});

describe('createEurekaToolCallLlmGateway — request serialization', () => {
    it('sends provider, requestedModel, messages, and tools verbatim, plus a generated requestId', async () => {
        const { server, baseUrl, requests } = await startTestServer(() => ({
            status: 200,
            body: { requestId: 'irrelevant', chunks: [{ done: true }] },
        }));
        activeServer = server;

        const gateway = createEurekaToolCallLlmGateway({
            provider: 'openai',
            requestedModel: 'gpt-4o-mini',
            endpointPath: '/llm/tool-calls',
            post: makeRealPost(baseUrl),
        });

        await drain(gateway.chat(CHAT_REQUEST));

        expect(requests).toHaveLength(1);
        expect(requests[0].method).toBe('POST');
        expect(requests[0].url).toBe('/llm/tool-calls');
        const body = requests[0].body as Record<string, unknown>;
        expect(body['provider']).toBe('openai');
        expect(body['requestedModel']).toBe('gpt-4o-mini');
        expect(body['messages']).toEqual(CHAT_REQUEST.messages);
        expect(body['tools']).toEqual(CHAT_REQUEST.tools);
        expect(typeof body['requestId']).toBe('string');
        expect((body['requestId'] as string).length).toBeGreaterThan(0);
    });

    it('preserves the full JSON Schema on each tool definition, not just name/description', async () => {
        const { server, baseUrl, requests } = await startTestServer(() => ({
            status: 200,
            body: { requestId: 'x', chunks: [{ done: true }] },
        }));
        activeServer = server;
        const gateway = createEurekaToolCallLlmGateway({
            provider: 'openai',
            requestedModel: 'gpt-4o-mini',
            post: makeRealPost(baseUrl),
        });

        await drain(gateway.chat(CHAT_REQUEST));

        const body = requests[0].body as { tools: unknown[] };
        expect(body.tools[0]).toEqual(CHAT_REQUEST.tools[0]);
    });

    it('includes generation options when provided, omits the field entirely otherwise', async () => {
        const { server, baseUrl, requests } = await startTestServer(() => ({
            status: 200,
            body: { requestId: 'x', chunks: [{ done: true }] },
        }));
        activeServer = server;
        const withGeneration = createEurekaToolCallLlmGateway({
            provider: 'openai',
            requestedModel: 'gpt-4o-mini',
            post: makeRealPost(baseUrl),
            generation: { temperature: 0.2 },
        });
        await drain(withGeneration.chat(CHAT_REQUEST));
        expect((requests[0].body as Record<string, unknown>)['generation']).toEqual({ temperature: 0.2 });

        const withoutGeneration = createEurekaToolCallLlmGateway({
            provider: 'openai',
            requestedModel: 'gpt-4o-mini',
            post: makeRealPost(baseUrl),
        });
        await drain(withoutGeneration.chat(CHAT_REQUEST));
        expect(requests[1].body as Record<string, unknown>).not.toHaveProperty('generation');
    });
});

describe('createEurekaToolCallLlmGateway — secret absence', () => {
    it('never sends anything resembling an API key — the gateway never holds one to send', async () => {
        const { server, baseUrl, requests } = await startTestServer(() => ({
            status: 200,
            body: { requestId: 'x', chunks: [{ done: true }] },
        }));
        activeServer = server;
        const gateway = createEurekaToolCallLlmGateway({
            provider: 'openai',
            requestedModel: 'gpt-4o-mini',
            post: makeRealPost(baseUrl),
        });

        await drain(gateway.chat(CHAT_REQUEST));

        const raw = JSON.stringify(requests[0]).toLowerCase();
        expect(raw).not.toMatch(/sk-[a-z0-9]/);
        expect(raw).not.toContain('apikey');
        expect(raw).not.toContain('api_key');
        expect(raw).not.toContain('authorization');
        expect(raw).not.toContain('bearer');
    });
});

describe('createEurekaToolCallLlmGateway — response handling', () => {
    it('yields normalized chunks exactly as returned, preserving text/toolCall/usage/actualModel', async () => {
        const chunks: Chunk[] = [
            { text: 'moving it' },
            { toolCall: { id: 'c1', name: 'move_node', argsDelta: '{"nodeId":"text-1"}' } },
            {
                done: true,
                usage: { inputTokens: 12, outputTokens: 4, providerReportedCost: 0.0001 },
                actualModel: 'gpt-4o-mini-2024-07-18',
            },
        ];
        const { server, baseUrl } = await startTestServer(() => ({ status: 200, body: { requestId: 'x', chunks } }));
        activeServer = server;
        const gateway = createEurekaToolCallLlmGateway({
            provider: 'openai',
            requestedModel: 'gpt-4o-mini',
            post: makeRealPost(baseUrl),
        });

        const received = await drain(gateway.chat(CHAT_REQUEST));
        expect(received).toEqual(chunks);
    });

    it('rejects a 2xx response that does not match the contract, without partially trusting it', async () => {
        const { server, baseUrl } = await startTestServer(() => ({ status: 200, body: { unexpected: 'shape' } }));
        activeServer = server;
        const gateway = createEurekaToolCallLlmGateway({
            provider: 'openai',
            requestedModel: 'gpt-4o-mini',
            post: makeRealPost(baseUrl),
        });

        await expect(drain(gateway.chat(CHAT_REQUEST))).rejects.toBeInstanceOf(EurekaToolCallInvalidResponseError);
    });

    it('rejects a response whose chunks array contains a malformed entry', async () => {
        const { server, baseUrl } = await startTestServer(() => ({
            status: 200,
            body: { requestId: 'x', chunks: [{ toolCall: { id: 'c1' } }] }, // missing name/argsDelta
        }));
        activeServer = server;
        const gateway = createEurekaToolCallLlmGateway({
            provider: 'openai',
            requestedModel: 'gpt-4o-mini',
            post: makeRealPost(baseUrl),
        });

        await expect(drain(gateway.chat(CHAT_REQUEST))).rejects.toBeInstanceOf(EurekaToolCallInvalidResponseError);
    });

    it('maps a well-formed error response to EurekaToolCallProviderError, preserving the code', async () => {
        const { server, baseUrl } = await startTestServer(() => ({
            status: 200,
            body: {
                requestId: 'x',
                error: { code: 'model_not_allowed', message: 'requestedModel is not on the production allowlist' },
            },
        }));
        activeServer = server;
        const gateway = createEurekaToolCallLlmGateway({
            provider: 'openai',
            requestedModel: 'gpt-5.6-preview',
            post: makeRealPost(baseUrl),
        });

        const err = await drain(gateway.chat(CHAT_REQUEST)).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(EurekaToolCallProviderError);
        expect((err as EurekaToolCallProviderError).code).toBe('model_not_allowed');
    });

    it('maps a non-2xx HTTP response to EurekaToolCallHttpError with the real status', async () => {
        const { server, baseUrl } = await startTestServer(() => ({ status: 500, body: { message: 'boom' } }));
        activeServer = server;
        const gateway = createEurekaToolCallLlmGateway({
            provider: 'openai',
            requestedModel: 'gpt-4o-mini',
            post: makeRealPost(baseUrl),
        });

        const err = await drain(gateway.chat(CHAT_REQUEST)).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(EurekaToolCallHttpError);
        expect((err as EurekaToolCallHttpError).status).toBe(500);
    });

    it('maps a real connection failure (nothing listening) to EurekaToolCallNetworkError', async () => {
        const gateway = createEurekaToolCallLlmGateway({
            provider: 'openai',
            requestedModel: 'gpt-4o-mini',
            // Port 1 is a privileged, essentially-never-listening port — a genuine connection
            // failure, not a mock throwing a canned error.
            post: makeRealPost('http://127.0.0.1:1'),
        });

        const err = await drain(gateway.chat(CHAT_REQUEST)).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(EurekaToolCallNetworkError);
    });
});

describe('createEurekaToolCallLlmGateway — cancellation', () => {
    it('honors an already-aborted signal instead of completing the request', async () => {
        const { server, baseUrl } = await startTestServer(() => ({
            status: 200,
            body: { requestId: 'x', chunks: [{ done: true }] },
        }));
        activeServer = server;
        const gateway = createEurekaToolCallLlmGateway({
            provider: 'openai',
            requestedModel: 'gpt-4o-mini',
            post: makeRealPost(baseUrl),
        });

        const controller = new AbortController();
        controller.abort();

        await expect(drain(gateway.chat(CHAT_REQUEST, { signal: controller.signal }))).rejects.toMatchObject({
            name: 'AbortError',
        });
    });
});

describe('createEurekaToolCallLlmGateway — capabilities', () => {
    it('declares itself tool-capable', () => {
        const gateway = createEurekaToolCallLlmGateway({ provider: 'openai', requestedModel: 'gpt-4o-mini' });
        expect(gateway.capabilities).toEqual({ toolCalls: true });
    });
});

describe('createEurekaToolCallLlmGateway — ToolExecutor + canvas integration (real HTTP boundary)', () => {
    it('a structured move_node call from the (scripted) HTTP boundary dispatches through the real ToolExecutor and mutates the real canvas binding', async () => {
        const { server, baseUrl } = await startTestServer(() => ({
            status: 200,
            body: {
                requestId: 'x',
                chunks: [
                    { toolCall: { id: 'call-1', name: 'move_node', argsDelta: '{"nodeId":"text-1","by":{"dx":100,"dy":0}}' } },
                    { done: true, usage: { inputTokens: 20, outputTokens: 8 }, actualModel: 'gpt-4o-mini' },
                ],
            },
        }));
        activeServer = server;

        const binding = createInMemoryCanvasBinding({
            nodes: [{ id: 'text-1', type: 'text-input', position: { x: 100, y: 200 } }],
            edges: [],
        });
        const executor = createToolExecutor();
        const emptyCatalog = createCatalogLookup([]);
        const gateway = createEurekaToolCallLlmGateway({
            provider: 'openai',
            requestedModel: 'gpt-4o-mini',
            post: makeRealPost(baseUrl),
        });

        // The request travels the real network path (a genuine POST to the local test server);
        // only the response body is scripted, matching how every other real-key-eligible runner
        // in this codebase proves gateway wiring offline before a live key is ever involved.
        const chunks = await drain(gateway.chat(CHAT_REQUEST));

        const toolCall = chunks.find(c => c.toolCall)?.toolCall;
        expect(toolCall).toBeDefined();
        const args = JSON.parse(toolCall?.argsDelta ?? '{}') as { nodeId: string; by: { dx: number; dy: number } };

        const config: AgentConfig = {
            id: 'contract-test-agent',
            description: 'moves nodes on the canvas',
            systemPrompt: 'You move nodes on a visual canvas by calling the provided tools.',
            tools: [createNodeReadToolProvider(binding, emptyCatalog), createNodeMoveToolProvider(binding)],
            grant: { canModifyCanvas: true },
        };
        const dispatchResult = await executor.dispatch(
            config,
            { id: toolCall?.id ?? '', name: toolCall?.name ?? '', args },
            { canModifyCanvas: true, canEditConfig: true, canEditStructure: true, canRun: true }
        );

        expect(dispatchResult.ok).toBe(true);
        expect(binding.readGraph().nodes[0].position).toEqual({ x: 200, y: 200 });
    });
});
