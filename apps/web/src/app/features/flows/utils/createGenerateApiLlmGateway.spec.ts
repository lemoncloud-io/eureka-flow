import { describe, expect, it, vi } from 'vitest';

import { createGenerateApiLlmGateway } from './createGenerateApiLlmGateway';

import type {
    CreateGenerateApiLlmGatewayOptions,
    GenerateConnectionSnapshot,
    GeneratePostFn,
    GenerateReceiver,
    GenerateResponse,
} from './createGenerateApiLlmGateway';
import type { ChatRequest, Chunk } from '@flows/agent';

const READY_CONNECTION: GenerateConnectionSnapshot = {
    isConnected: true,
    connectionId: 'conn-1',
    generateReceiver: null, // set per-test
};

/** A fake receiver: records the requestId, runs `fire` (the POST), then resolves with a scripted result. */
const makeFakeReceiver = (
    resolveWith: GenerateResponse
): { receiver: GenerateReceiver<GenerateResponse>; waits: { requestId: string }[] } => {
    const waits: { requestId: string }[] = [];
    const receiver: GenerateReceiver<GenerateResponse> = {
        wait: async (requestId, fire) => {
            waits.push({ requestId });
            await fire();
            return resolveWith;
        },
    };
    return { receiver, waits };
};

const drain = async (stream: AsyncIterable<Chunk>): Promise<Chunk[]> => {
    const chunks: Chunk[] = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return chunks;
};

const textResponse = (text: string): GenerateResponse => ({ output: { content: text } });

const createGateway = (
    overrides: Partial<CreateGenerateApiLlmGatewayOptions> & { connection?: Partial<GenerateConnectionSnapshot> },
    post: GeneratePostFn
) => {
    const connection: GenerateConnectionSnapshot = { ...READY_CONNECTION, ...overrides.connection };
    return createGenerateApiLlmGateway({ getConnection: () => connection, post, ...overrides });
};

const userSays = (content: string): ChatRequest => ({ messages: [{ role: 'user', content }], tools: [] });
const wsGateway = (resolveWith: GenerateResponse, post = vi.fn().mockResolvedValue(undefined)) => {
    const { receiver, waits } = makeFakeReceiver(resolveWith);
    return { gateway: createGateway({ connection: { generateReceiver: receiver } }, post), post, waits };
};

describe('createGenerateApiLlmGateway', () => {
    it('declares itself tool-capable', () => {
        const { gateway } = wsGateway(textResponse('x'));
        expect(gateway.capabilities).toEqual({ toolCalls: true });
    });

    describe('readiness guard', () => {
        it('throws when a connection id exists but the socket is not connected', async () => {
            const { receiver } = makeFakeReceiver(textResponse('x'));
            const gateway = createGateway({ connection: { isConnected: false, generateReceiver: receiver } }, vi.fn());
            await expect(drain(gateway.chat(userSays('hi')))).rejects.toThrow(/not connected/);
        });

        it('throws when a connection id exists but no receiver is registered', async () => {
            const gateway = createGateway({ connection: { generateReceiver: null } }, vi.fn());
            await expect(drain(gateway.chat(userSays('hi')))).rejects.toThrow(/no generate receiver/);
        });
    });

    describe('socket delivery (transport=1)', () => {
        it('waits on the receiver (keyed on the request id) before posting to /runs/0/generate', async () => {
            const order: string[] = [];
            const receiver: GenerateReceiver<GenerateResponse> = {
                wait: async (requestId, fire) => {
                    order.push(`wait:${requestId}`);
                    await fire();
                    return textResponse('ok');
                },
            };
            const post = vi.fn().mockImplementation(async () => order.push('post'));
            const gateway = createGateway({ connection: { generateReceiver: receiver } }, post);

            await drain(gateway.chat(userSays('hi')));

            const requestId = post.mock.calls[0][1].requestId;
            expect(order).toEqual([`wait:${requestId}`, 'post']);
            expect(post.mock.calls[0][0]).toBe('/runs/0/generate');
            expect(post.mock.calls[0][2]).toMatchObject({ params: { connection: 'conn-1', transport: 1 } });
        });

        it('passes the AbortSignal through to post', async () => {
            const { gateway, post } = wsGateway(textResponse('ok'));
            const controller = new AbortController();

            await drain(gateway.chat(userSays('hi'), { signal: controller.signal }));

            expect(post.mock.calls[0][2].signal).toBe(controller.signal);
        });

        it('throws AbortError if the signal is aborted by the time the receiver resolves', async () => {
            const controller = new AbortController();
            const receiver: GenerateReceiver<GenerateResponse> = {
                wait: async (_requestId, fire) => {
                    await fire();
                    controller.abort();
                    return textResponse('ok');
                },
            };
            const gateway = createGateway(
                { connection: { generateReceiver: receiver } },
                vi.fn().mockResolvedValue(undefined)
            );

            await expect(drain(gateway.chat(userSays('hi'), { signal: controller.signal }))).rejects.toThrow(/Aborted/);
        });
    });

    describe('HTTP-only delivery (no connection id)', () => {
        it('posts with no connection/transport params and reads the completed body', async () => {
            const post = vi.fn().mockResolvedValue({ data: textResponse('http') });
            const gateway = createGateway(
                { connection: { isConnected: false, connectionId: null, generateReceiver: null } },
                post
            );

            expect(await drain(gateway.chat(userSays('hi')))).toEqual([{ text: 'http' }, { done: true }]);
            expect(post.mock.calls[0][2]).toEqual({ params: {} });
        });
    });

    describe('request mapping', () => {
        it('maps a single user message to a plain string prompt and always includes messages + tools + requestId', async () => {
            const { gateway, post } = wsGateway(textResponse('ok'));
            const req: ChatRequest = {
                messages: [{ role: 'user', content: 'hello there' }],
                tools: [{ name: 'move_node', description: 'move', parameters: { type: 'object' } }],
            };

            await drain(gateway.chat(req));

            const body = post.mock.calls[0][1];
            expect(body.prompt).toBe('hello there');
            expect(body.messages).toEqual(req.messages);
            expect(body.tools).toEqual(req.tools);
            expect(typeof body.requestId).toBe('string');
        });

        it('maps multi-turn user/assistant messages to GenerateContent[], assistant as model role', async () => {
            const { gateway, post } = wsGateway(textResponse('ok'));

            await drain(
                gateway.chat({
                    messages: [
                        { role: 'user', content: 'question' },
                        { role: 'assistant', content: 'earlier answer' },
                        { role: 'user', content: 'follow-up' },
                    ],
                    tools: [],
                })
            );

            expect(post.mock.calls[0][1].prompt).toEqual({
                content: [
                    { role: 'user', parts: [{ text: 'question' }] },
                    { role: 'model', parts: [{ text: 'earlier answer' }] },
                    { role: 'user', parts: [{ text: 'follow-up' }] },
                ],
            });
        });

        it('joins system messages, honors model + temperature, and defaults the model', async () => {
            const withOverrides = (opts: Partial<CreateGenerateApiLlmGatewayOptions>) => {
                const { receiver } = makeFakeReceiver(textResponse('ok'));
                const post = vi.fn().mockResolvedValue(undefined);
                return { gateway: createGateway({ connection: { generateReceiver: receiver }, ...opts }, post), post };
            };

            const tuned = withOverrides({ model: 'gemini-2.5-pro', generation: { temperature: 0.3 } });
            await drain(
                tuned.gateway.chat({
                    messages: [
                        { role: 'system', content: 'be brief' },
                        { role: 'system', content: 'answer in English' },
                        { role: 'user', content: 'hi' },
                    ],
                    tools: [],
                })
            );
            const tunedBody = tuned.post.mock.calls[0][1];
            expect(tunedBody.system).toBe('be brief\n\nanswer in English');
            expect(tunedBody.model).toBe('gemini-2.5-pro');
            expect(tunedBody.config).toEqual({ temperature: 0.3 });

            const def = withOverrides({});
            await drain(def.gateway.chat(userSays('hi')));
            expect(def.post.mock.calls[0][1].model).toBe('gemini-2.5-flash');
        });
    });

    describe('response mapping', () => {
        it('maps a text response to a text chunk then a done chunk with usage', async () => {
            const { gateway } = wsGateway({
                output: { content: 'the answer' },
                usage: { promptToken: 12, completionToken: 34, totalToken: 46 },
            });

            expect(await drain(gateway.chat(userSays('hi')))).toEqual([
                { text: 'the answer' },
                { done: true, usage: { inputTokens: 12, outputTokens: 34 } },
            ]);
        });

        it('omits usage and an empty text chunk when the response has neither', async () => {
            const { gateway } = wsGateway(textResponse(''));
            expect(await drain(gateway.chat(userSays('hi')))).toEqual([{ done: true }]);
        });

        it('emits returned tool calls (a tool-only turn needs no output.content)', async () => {
            const { gateway, post, waits } = wsGateway({
                output: {} as GenerateResponse['output'],
                toolCalls: [{ id: 'call-1', name: 'move_node', args: { nodeId: 'n1' } }],
            });

            const chunks = await drain(
                gateway.chat({
                    messages: [{ role: 'user', content: 'Move the node.' }],
                    tools: [{ name: 'move_node', description: 'Move a node', parameters: { type: 'object' } }],
                })
            );

            expect(waits).toEqual([{ requestId: post.mock.calls[0][1].requestId }]);
            expect(chunks).toEqual([
                { toolCall: { id: 'call-1', name: 'move_node', argsDelta: '{"nodeId":"n1"}' } },
                { done: true },
            ]);
        });

        it('throws when output.content is a non-text object (image result)', async () => {
            const { gateway } = wsGateway({ output: { content: { data: 'data:image/png;base64,abc' } } });
            await expect(drain(gateway.chat(userSays('hi')))).rejects.toThrow(/not text/);
        });

        it('throws when there is neither content nor tool calls', async () => {
            const { gateway } = wsGateway({ output: {} } as unknown as GenerateResponse);
            await expect(drain(gateway.chat(userSays('hi')))).rejects.toThrow(/missing output.content/);
        });
    });
});
