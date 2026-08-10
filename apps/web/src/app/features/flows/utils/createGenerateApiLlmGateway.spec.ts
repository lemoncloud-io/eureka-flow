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

/** A fake receiver: runs `fire` (the POST), then resolves/rejects with a scripted result. */
const makeFakeReceiver = (
    resolveWith: GenerateResponse | (() => Promise<GenerateResponse>)
): { receiver: GenerateReceiver<GenerateResponse>; waits: { correlationId: string }[] } => {
    const waits: { correlationId: string }[] = [];
    const receiver: GenerateReceiver<GenerateResponse> = {
        wait: async (correlationId, fire) => {
            waits.push({ correlationId });
            await fire();
            return typeof resolveWith === 'function' ? resolveWith() : resolveWith;
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
    return createGenerateApiLlmGateway({
        getConnection: () => connection,
        post,
        ...overrides,
    });
};

const userSays = (content: string): ChatRequest => ({ messages: [{ role: 'user', content }], tools: [] });

describe('createGenerateApiLlmGateway', () => {
    it('declares itself text-only', () => {
        const { receiver } = makeFakeReceiver(textResponse('x'));
        const gateway = createGateway({ connection: { generateReceiver: receiver } }, vi.fn());
        expect(gateway.capabilities).toEqual({ toolCalls: false });
    });

    describe('readiness guard', () => {
        it('throws a clear error when the socket is not connected', async () => {
            const { receiver } = makeFakeReceiver(textResponse('x'));
            const gateway = createGateway({ connection: { isConnected: false, generateReceiver: receiver } }, vi.fn());
            await expect(drain(gateway.chat(userSays('hi')))).rejects.toThrow(/not connected/);
        });

        it('preserves the legacy error when connectionId is missing', async () => {
            const post = vi.fn().mockResolvedValue({ data: textResponse('http') });
            const gateway = createGateway(
                { connection: { isConnected: false, connectionId: null, generateReceiver: null } },
                post
            );

            await expect(drain(gateway.chat(userSays('hi')))).rejects.toThrow(/not connected/);
            expect(post).not.toHaveBeenCalled();
        });

        it('preserves the legacy no-connectionId error after the socket reports connected', async () => {
            const post = vi.fn();
            const gateway = createGateway(
                { connection: { isConnected: true, connectionId: null, generateReceiver: null } },
                post
            );

            await expect(drain(gateway.chat(userSays('hi')))).rejects.toThrow(/no connectionId/);
            expect(post).not.toHaveBeenCalled();
        });

        it('uses the HTTP response for tool calls when connectionId is missing', async () => {
            const post = vi.fn().mockResolvedValue({ data: textResponse('http') });
            const gateway = createGateway(
                { toolCalls: true, connection: { isConnected: false, connectionId: null, generateReceiver: null } },
                post
            );

            expect(await drain(gateway.chat(userSays('hi')))).toEqual([{ text: 'http' }, { done: true }]);
            expect(post.mock.calls[0][2]).toEqual({ params: {} });
        });

        it('throws a clear error when the generate receiver is missing', async () => {
            const gateway = createGateway({ connection: { generateReceiver: null } }, vi.fn());
            await expect(drain(gateway.chat(userSays('hi')))).rejects.toThrow(/no generate receiver/);
        });
    });

    describe('request mapping', () => {
        it('maps a single user message to a plain string prompt', async () => {
            const { receiver } = makeFakeReceiver(textResponse('ok'));
            const post = vi.fn().mockResolvedValue(undefined);
            const gateway = createGateway({ connection: { generateReceiver: receiver } }, post);

            await drain(gateway.chat(userSays('hello there')));

            const body = post.mock.calls[0][1];
            expect(body.prompt).toBe('hello there');
        });

        it('maps multi-turn user/assistant messages to GenerateContent[], assistant as model role', async () => {
            const { receiver } = makeFakeReceiver(textResponse('ok'));
            const post = vi.fn().mockResolvedValue(undefined);
            const gateway = createGateway({ connection: { generateReceiver: receiver } }, post);

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

            const body = post.mock.calls[0][1];
            expect(body.prompt).toEqual({
                content: [
                    { role: 'user', parts: [{ text: 'question' }] },
                    { role: 'model', parts: [{ text: 'earlier answer' }] },
                    { role: 'user', parts: [{ text: 'follow-up' }] },
                ],
            });
        });

        it('joins system messages with \\n\\n into GenerateRequestBody.system', async () => {
            const { receiver } = makeFakeReceiver(textResponse('ok'));
            const post = vi.fn().mockResolvedValue(undefined);
            const gateway = createGateway({ connection: { generateReceiver: receiver } }, post);

            await drain(
                gateway.chat({
                    messages: [
                        { role: 'system', content: 'be brief' },
                        { role: 'system', content: 'answer in English' },
                        { role: 'user', content: 'hi' },
                    ],
                    tools: [],
                })
            );

            const body = post.mock.calls[0][1];
            expect(body.system).toBe('be brief\n\nanswer in English');
        });

        it('maps temperature into config.temperature and honors a model override', async () => {
            const { receiver } = makeFakeReceiver(textResponse('ok'));
            const post = vi.fn().mockResolvedValue(undefined);
            const gateway = createGateway(
                {
                    connection: { generateReceiver: receiver },
                    model: 'gemini-2.5-pro',
                    generation: { temperature: 0.3 },
                },
                post
            );

            await drain(gateway.chat(userSays('hi')));

            const body = post.mock.calls[0][1];
            expect(body.model).toBe('gemini-2.5-pro');
            expect(body.config).toEqual({ temperature: 0.3 });
        });

        it('defaults the model to gemini-2.5-flash', async () => {
            const { receiver } = makeFakeReceiver(textResponse('ok'));
            const post = vi.fn().mockResolvedValue(undefined);
            const gateway = createGateway({ connection: { generateReceiver: receiver } }, post);

            await drain(gateway.chat(userSays('hi')));

            expect(post.mock.calls[0][1].model).toBe('gemini-2.5-flash');
        });
    });

    describe('transport', () => {
        it('calls the receiver before post (receiver wraps the trigger) and posts to /runs/0/generate', async () => {
            const order: string[] = [];
            const receiver: GenerateReceiver<GenerateResponse> = {
                wait: async (correlationId, fire) => {
                    order.push(`wait:${correlationId}`);
                    await fire();
                    return textResponse('ok');
                },
            };
            const post = vi.fn().mockImplementation(async () => {
                order.push('post');
            });
            const gateway = createGateway({ connection: { generateReceiver: receiver } }, post);

            await drain(gateway.chat(userSays('hi')));

            expect(order).toEqual(['wait:conn-1', 'post']);
            expect(post.mock.calls[0][0]).toBe('/runs/0/generate');
            expect(post.mock.calls[0][1]).not.toHaveProperty('requestId');
        });

        it('includes connection and transport=1 in post params', async () => {
            const { receiver } = makeFakeReceiver(textResponse('ok'));
            const post = vi.fn().mockResolvedValue(undefined);
            const gateway = createGateway({ connection: { generateReceiver: receiver } }, post);

            await drain(gateway.chat(userSays('hi')));

            expect(post.mock.calls[0][2]).toMatchObject({ params: { connection: 'conn-1', transport: 1 } });
        });

        it('passes the AbortSignal through to post', async () => {
            const { receiver } = makeFakeReceiver(textResponse('ok'));
            const post = vi.fn().mockResolvedValue(undefined);
            const gateway = createGateway({ connection: { generateReceiver: receiver } }, post);
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

    describe('response mapping', () => {
        it('maps a text response to a text chunk then a done chunk with usage', async () => {
            const { receiver } = makeFakeReceiver({
                output: { content: 'the answer' },
                usage: { promptToken: 12, completionToken: 34, totalToken: 46 },
            });
            const gateway = createGateway(
                { connection: { generateReceiver: receiver } },
                vi.fn().mockResolvedValue(undefined)
            );

            const chunks = await drain(gateway.chat(userSays('hi')));

            expect(chunks).toEqual([
                { text: 'the answer' },
                { done: true, usage: { inputTokens: 12, outputTokens: 34 } },
            ]);
        });

        it('omits usage on the done chunk when the response has none', async () => {
            const { receiver } = makeFakeReceiver({ output: { content: 'ok' } });
            const gateway = createGateway(
                { connection: { generateReceiver: receiver } },
                vi.fn().mockResolvedValue(undefined)
            );

            const chunks = await drain(gateway.chat(userSays('hi')));

            expect(chunks).toEqual([{ text: 'ok' }, { done: true }]);
        });

        it('preserves an empty text chunk in legacy mode', async () => {
            const { receiver } = makeFakeReceiver(textResponse(''));
            const gateway = createGateway(
                { connection: { generateReceiver: receiver } },
                vi.fn().mockResolvedValue(undefined)
            );

            expect(await drain(gateway.chat(userSays('hi')))).toEqual([{ text: '' }, { done: true }]);
        });

        it('throws a text-only error when output.content is an object (image result)', async () => {
            const { receiver } = makeFakeReceiver({ output: { content: { data: 'data:image/png;base64,abc' } } });
            const gateway = createGateway(
                { connection: { generateReceiver: receiver } },
                vi.fn().mockResolvedValue(undefined)
            );

            await expect(drain(gateway.chat(userSays('hi')))).rejects.toThrow(/text-only/);
        });

        it('throws a clear error when output.content is missing', async () => {
            const { receiver } = makeFakeReceiver({ output: {} } as unknown as GenerateResponse);
            const gateway = createGateway(
                { connection: { generateReceiver: receiver } },
                vi.fn().mockResolvedValue(undefined)
            );

            await expect(drain(gateway.chat(userSays('hi')))).rejects.toThrow(/missing output.content/);
        });
    });

    it('sends tools through run generate and emits returned tool calls when enabled', async () => {
        const { receiver, waits } = makeFakeReceiver({
            output: { content: '' },
            toolCalls: [{ id: 'call-1', name: 'move_node', args: { nodeId: 'n1' } }],
        });
        const post = vi.fn().mockResolvedValue(undefined);
        const gateway = createGateway({ toolCalls: true, connection: { generateReceiver: receiver } }, post);
        const request: ChatRequest = {
            messages: [{ role: 'user', content: 'Move the node.' }],
            tools: [{ name: 'move_node', description: 'Move a node', parameters: { type: 'object' } }],
        };

        const chunks = await drain(gateway.chat(request));

        expect(gateway.capabilities).toEqual({ toolCalls: true });
        expect(post.mock.calls[0][0]).toBe('/runs/0/generate');
        expect(post.mock.calls[0][1]).toMatchObject({ messages: request.messages, tools: request.tools });
        expect(waits).toEqual([{ correlationId: post.mock.calls[0][1].requestId }]);
        expect(chunks).toEqual([
            { toolCall: { id: 'call-1', name: 'move_node', argsDelta: '{"nodeId":"n1"}' } },
            { done: true },
        ]);
    });

    describe('tool rejection (text-only)', () => {
        it('rejects requests carrying tool definitions', async () => {
            const { receiver } = makeFakeReceiver(textResponse('ok'));
            const gateway = createGateway(
                { connection: { generateReceiver: receiver } },
                vi.fn().mockResolvedValue(undefined)
            );

            await expect(
                drain(
                    gateway.chat({
                        messages: [{ role: 'user', content: 'hi' }],
                        tools: [{ name: 'move_node', description: 'move', parameters: { type: 'object' } }],
                    })
                )
            ).rejects.toThrow(/text-only.*tool definitions/);
        });

        it('rejects requests carrying tool messages', async () => {
            const { receiver } = makeFakeReceiver(textResponse('ok'));
            const gateway = createGateway(
                { connection: { generateReceiver: receiver } },
                vi.fn().mockResolvedValue(undefined)
            );

            await expect(
                drain(
                    gateway.chat({
                        messages: [{ role: 'tool', content: '{}', toolCallId: 'c1' }],
                        tools: [],
                    })
                )
            ).rejects.toThrow(/text-only.*tool messages/);
        });

        it('rejects requests carrying assistant tool calls', async () => {
            const { receiver } = makeFakeReceiver(textResponse('ok'));
            const gateway = createGateway(
                { connection: { generateReceiver: receiver } },
                vi.fn().mockResolvedValue(undefined)
            );

            await expect(
                drain(
                    gateway.chat({
                        messages: [
                            {
                                role: 'assistant',
                                content: null,
                                toolCalls: [{ id: 'c1', name: 'move_node', args: '{}' }],
                            },
                        ],
                        tools: [],
                    })
                )
            ).rejects.toThrow(/text-only.*tool messages/);
        });
    });
});
