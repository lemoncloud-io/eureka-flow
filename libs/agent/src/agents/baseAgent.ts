import { createToolExecutor } from '../tools/toolExecutor';
import { errorMessage } from '../utils/errors';

import type { Agent, AgentConfig } from '../agent';
import type { ChatMessage, Chunk, LlmGateway } from '../llm/llmGateway';
import type { Message, SessionStore } from '../session/session';
import type { ToolCall, ToolExecutor, ToolResult } from '../tools/types';

/** Safety cap on think/act iterations per turn, if a subclass/caller doesn't set one. */
export const DEFAULT_MAX_ITERATIONS = 8;

/** Dependencies every agent needs to run a turn; a concrete agent extends this with its own seams. */
export interface BaseAgentDeps {
    gateway: LlmGateway;
    storage: SessionStore;
    flowId: string;
    /** Defaults to a fresh {@link createToolExecutor}. */
    executor?: ToolExecutor;
    /** Safety cap on think/act iterations per turn. */
    maxIterations?: number;
}

interface CollectedResponse {
    text: string;
    toolCalls: { id: string; name: string; args: unknown; rawArgs: string }[];
}

const safeJsonParse = (raw: string): unknown => {
    try {
        return JSON.parse(raw);
    } catch {
        return raw;
    }
};

/** Drain a chat stream into accumulated text + parsed tool calls. */
const collect = async (stream: AsyncIterable<Chunk>): Promise<CollectedResponse> => {
    let text = '';
    const order: string[] = [];
    const acc = new Map<string, { name: string; rawArgs: string }>();

    for await (const chunk of stream) {
        if (chunk.text) {
            text += chunk.text;
        }
        if (chunk.toolCall) {
            const { id, name, argsDelta } = chunk.toolCall;
            const existing = acc.get(id);
            if (existing) {
                existing.rawArgs += argsDelta;
            } else {
                order.push(id);
                acc.set(id, { name, rawArgs: argsDelta });
            }
        }
    }

    return {
        text,
        toolCalls: order.map(id => {
            const { name, rawArgs } = acc.get(id) as { name: string; rawArgs: string };
            return { id, name, args: safeJsonParse(rawArgs), rawArgs };
        }),
    };
};

/** Map the persisted transcript into the provider-neutral chat message list. */
const mapTranscript = (messages: Message[]): ChatMessage[] => {
    const chat: ChatMessage[] = [];
    for (const msg of messages) {
        if (msg.role === 'tool') {
            chat.push({ role: 'tool', content: msg.content ?? '', toolCallId: msg.toolCallId });
        } else if (msg.role === 'assistant' && msg.toolCalls?.length) {
            chat.push({
                role: 'assistant',
                content: msg.content ?? null,
                toolCalls: msg.toolCalls.map(tc => ({ id: tc.id, name: tc.name, args: tc.args })),
            });
        } else {
            chat.push({ role: msg.role, content: msg.content ?? null });
        }
    }
    return chat;
};

const resultToContent = (result: ToolResult): string =>
    result.ok ? JSON.stringify(result.data ?? { ok: true }) : JSON.stringify({ error: result.error });

/**
 * Generic think/act turn engine shared by every agent: loop model → dispatch tool calls → feed
 * results back, until no more tool calls or the safety cap trips. A subclass supplies an
 * {@link AgentConfig} and optional per-turn {@link buildContextMessages}.
 */
export abstract class BaseAgent implements Agent {
    protected readonly gateway: LlmGateway;
    protected readonly storage: SessionStore;
    protected readonly flowId: string;
    protected readonly executor: ToolExecutor;
    protected readonly maxIterations: number;
    /** Persona + tools + grant — what varies per agent. Supplied by the subclass. */
    protected readonly config: AgentConfig;

    /** Monotonic id counter for messages; seeded past the persisted transcript in {@link send}. */
    private seq = 0;
    private controller: AbortController | null = null;

    constructor(deps: BaseAgentDeps, config: AgentConfig) {
        this.gateway = deps.gateway;
        this.storage = deps.storage;
        this.flowId = deps.flowId;
        this.executor = deps.executor ?? createToolExecutor();
        this.maxIterations = deps.maxIterations ?? DEFAULT_MAX_ITERATIONS;
        this.config = config;
    }

    /** Per-turn dynamic context injected as system message(s) after the persona, recomputed each iteration. */
    protected buildContextMessages(): ChatMessage[] {
        return [];
    }

    private nextId(prefix: string): string {
        return `${prefix}-${this.flowId}-${(this.seq += 1)}`;
    }

    private stamp(): number {
        return Date.now();
    }

    async send(text: string): Promise<void> {
        const { storage, flowId, gateway, executor, config, maxIterations } = this;

        const existing = storage.load(flowId);
        if (existing?.phase === 'thinking') {
            // A turn is already in flight; ignore concurrent sends.
            return;
        }
        const state = existing ?? storage.create(flowId);
        // Seed the id counter past the persisted transcript so ids stay unique after a reload.
        this.seq = Math.max(this.seq, state.messages.length);
        this.controller = new AbortController();
        const { signal } = this.controller;

        state.messages.push({ id: this.nextId('u'), role: 'user', content: text, ts: this.stamp() });
        state.phase = 'thinking';
        state.error = undefined;
        storage.save(state);

        try {
            for (let i = 0; i < maxIterations; i += 1) {
                if (signal.aborted) {
                    state.phase = 'done';
                    storage.save(state);
                    return;
                }

                const chatMessages: ChatMessage[] = [
                    { role: 'system', content: config.systemPrompt },
                    ...this.buildContextMessages(),
                    ...mapTranscript(state.messages),
                ];
                const tools = await executor.listTools(config);
                const res = await collect(gateway.chat({ messages: chatMessages, tools, stream: true }, { signal }));

                // If the turn was aborted while draining, stop before applying any of its moves.
                if (signal.aborted) {
                    state.phase = 'done';
                    storage.save(state);
                    return;
                }

                if (res.toolCalls.length > 0) {
                    const assistantMsg: Message = {
                        id: this.nextId('a'),
                        role: 'assistant',
                        content: res.text || undefined,
                        toolCalls: res.toolCalls.map(tc => ({
                            id: tc.id,
                            name: tc.name,
                            args: tc.rawArgs,
                            status: 'ok',
                        })),
                        ts: this.stamp(),
                    };
                    state.messages.push(assistantMsg);
                    storage.save(state);

                    for (const tc of res.toolCalls) {
                        const call: ToolCall = { id: tc.id, name: tc.name, args: tc.args };
                        const result = await executor.dispatch(config, call);
                        // Patch the assistant message by stable reference (it is no longer the array's last element).
                        const recorded = assistantMsg.toolCalls?.find(c => c.id === tc.id);
                        if (recorded) {
                            recorded.status = result.ok ? 'ok' : 'error';
                        }
                        state.messages.push({
                            id: this.nextId('t'),
                            role: 'tool',
                            content: resultToContent(result),
                            toolCallId: tc.id,
                            ts: this.stamp(),
                        });
                        storage.save(state);
                    }
                    continue;
                }

                // Final text only — the turn is complete.
                if (res.text) {
                    state.messages.push({
                        id: this.nextId('a'),
                        role: 'assistant',
                        content: res.text,
                        ts: this.stamp(),
                    });
                }
                state.phase = 'done';
                storage.save(state);
                return;
            }

            state.phase = 'error';
            state.error = `${config.id}: exceeded ${maxIterations} reasoning iterations without finishing`;
            storage.save(state);
        } catch (err) {
            if (signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
                state.phase = 'done';
                storage.save(state);
                return;
            }
            state.phase = 'error';
            state.error = errorMessage(err);
            storage.save(state);
        }
    }

    abort(): void {
        this.controller?.abort();
    }
}
