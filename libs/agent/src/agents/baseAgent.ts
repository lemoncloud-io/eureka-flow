import { createToolExecutor } from '../tools/toolExecutor';

import type { Agent, AgentConfig } from '../agent';
import type { ChatMessage, Chunk, LlmGateway } from '../llm/llmGateway';
import type { Message, Storage } from '../session/session';
import type { ToolCall, ToolExecutor, ToolResult } from '../tools/toolTypes';

/** Safety cap on think/act iterations per turn, if a subclass/caller doesn't set one. */
export const DEFAULT_MAX_ITERATIONS = 8;

/**
 * The dependencies every agent needs to run a turn — independent of what the agent actually
 * *does*. A concrete agent extends this with its own domain seams (e.g. the locator adds a
 * `binding`). See {@link BaseAgent}.
 */
export interface BaseAgentDeps {
    gateway: LlmGateway;
    storage: Storage;
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
 * The generic think/act turn engine shared by every concrete agent — the part that is the same
 * for all of them, so it is written once here. It owns the whole turn inside {@link send}: guard
 * concurrent sends, append the user message, then loop (ask the model → dispatch its tool calls →
 * feed the results back) until the model replies with no more tool calls, or a safety cap trips.
 *
 * A subclass supplies only what makes it *that* agent: an {@link AgentConfig} (persona + tools +
 * grant), passed up to the constructor, and — optionally — per-turn {@link buildContextMessages}.
 * Nothing here touches the DOM or a specific domain; the locator's canvas knowledge lives entirely
 * in its subclass.
 *
 * There is no draft and no approval gate in this version (spec 0002 §2.2) — a tool call is applied
 * the moment the executor routes it. That is why, unlike the flow-edit agent (spec 0001), the
 * {@link Agent} surface has no `resolvePlan`.
 */
export abstract class BaseAgent implements Agent {
    protected readonly gateway: LlmGateway;
    protected readonly storage: Storage;
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

    /**
     * Per-turn dynamic context, injected as system message(s) right after the persona and
     * recomputed on every iteration so the model always sees fresh state. The base agent has
     * none; the locator overrides this to seed the current node list (label/type/position).
     */
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
            // A turn is already in flight; ignore concurrent sends. The turn model is
            // single-active (spec §6.1); the Panel disables input while thinking.
            return;
        }
        const state = existing ?? storage.create(flowId);
        // Seed the id counter past any persisted transcript so ids stay unique after a
        // reload (a fresh agent instance restarts `seq` at 0).
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

                // The response finished draining; if the turn was aborted meanwhile, stop
                // before applying any of its moves (already-applied moves stay applied, §6.1).
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
                        // Patch the assistant message by stable reference — the array's last
                        // element is a tool message on the 2nd+ iteration.
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
            state.error = err instanceof Error ? err.message : String(err);
            storage.save(state);
        }
    }

    abort(): void {
        this.controller?.abort();
    }
}
