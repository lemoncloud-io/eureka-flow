import { tracingGateway } from '../llm/tracingGateway';
import { createToolExecutor } from '../tools/toolExecutor';
import { MESSAGE, NoopTracer, TURN_DONE, TURN_ERROR, TURN_START, TURN_STEP } from '../trace';
import { errorMessage } from '../utils/errors';

import type { Agent, AgentConfig } from '../agent';
import type { CanvasBinding } from '../canvas/canvasBinding';
import type { CatalogLookup } from '../catalog';
import type { ChatMessage, Chunk, LlmGateway } from '../llm/llmGateway';
import type { AgentGrant } from '../permissions';
import type { Message, SessionState, SessionStore } from '../session/session';
import type { ToolCall, ToolExecutor, ToolResult } from '../tools/types';
import type { TraceContext, Tracer } from '../trace';

/** Safety cap on think/act iterations per turn, if a subclass/caller doesn't set one. */
export const DEFAULT_MAX_ITERATIONS = 8;

/** Dependencies every agent needs to run a turn. */
export interface BaseAgentDeps {
    gateway: LlmGateway;
    storage: SessionStore;
    flowId: string;
    /** The live canvas seam every agent reads and (for writers) edits directly. */
    binding: CanvasBinding;
    /** The block catalog behind the read/config tools + validation. */
    catalog: CatalogLookup;
    /** The user's flow-role ceiling; the executor gates every capability tool against it, on top of each agent's own grant. */
    userPermissions: AgentGrant;
    /** Identity-bound tracer (from the spawner); default no-op. The agent wraps its own gateway/executor with it. */
    tracer?: Tracer;
    /** Defaults to a fresh {@link createToolExecutor}. */
    executor?: ToolExecutor;
    /** Safety cap on think/act iterations per turn. */
    maxIterations?: number;
    /** Override the persona defaults (id/description/systemPrompt/grant). Tools are fixed by the agent. */
    config?: Partial<Omit<AgentConfig, 'tools'>>;
}

/** One tool call drained from the stream: parsed `args` plus the `rawArgs` we persist. */
export interface CollectedToolCall {
    id: string;
    name: string;
    args: unknown;
    rawArgs: string;
}

interface CollectedResponse {
    text: string;
    toolCalls: CollectedToolCall[];
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
    // Map keeps first-insertion order, so tool calls stay in emission order without a parallel array.
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
                acc.set(id, { name, rawArgs: argsDelta });
            }
        }
    }

    return {
        text,
        toolCalls: [...acc].map(([id, { name, rawArgs }]) => ({ id, name, args: safeJsonParse(rawArgs), rawArgs })),
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

/** Generic think/act turn engine shared by every agent: loop model → dispatch tool calls → feed results back until no more calls or the safety cap trips. */
export abstract class BaseAgent implements Agent {
    protected readonly gateway: LlmGateway;
    protected readonly storage: SessionStore;
    protected readonly flowId: string;
    /** The live canvas seam — subclasses read it in {@link buildContextMessages} + wire it into tools. */
    protected readonly binding: CanvasBinding;
    /** The block catalog — behind the read/config tools + validation. */
    protected readonly catalog: CatalogLookup;
    /** The current user's flow-role ceiling; passed to the executor on every dispatch. */
    protected readonly userPermissions: AgentGrant;
    protected readonly executor: ToolExecutor;
    protected readonly maxIterations: number;
    /** Persona + tools + grant — what varies per agent. The merge of the subclass `base` + `deps.config`. */
    protected readonly config: AgentConfig;

    /** Monotonic id counter for messages; seeded past the persisted transcript in {@link send}. */
    private seq = 0;
    private controller: AbortController | null = null;

    /** The identity-bound tracer (runId/agent id/flowPath), the base for each turn's context-bound child. */
    private readonly identityTracer: Tracer;
    /** Holds this agent's in-flight turn tracer (identity + turn); read by its own wrapped gateway/executor. */
    private readonly turnTracerHolder: { current: Tracer };

    /** @param base the subclass's persona defaults + fixed tools; `deps.config` overrides everything but `tools`. */
    constructor(deps: BaseAgentDeps, base: AgentConfig) {
        this.identityTracer = deps.tracer ?? NoopTracer;
        this.turnTracerHolder = { current: this.identityTracer };
        // Self-wrap: llm.* and tool.* carry the agent's identity + turn via the holder accessor, no re-wrapping.
        // (The canvas binding is wrapped upstream at injection — see subAgentRunner — so the child's tools see it too.)
        this.gateway = tracingGateway(deps.gateway, () => this.turnTracerHolder.current);
        this.storage = deps.storage;
        this.flowId = deps.flowId;
        this.binding = deps.binding;
        this.catalog = deps.catalog;
        this.userPermissions = deps.userPermissions;
        this.executor = deps.executor ?? createToolExecutor(() => this.turnTracerHolder.current);
        this.maxIterations = deps.maxIterations ?? DEFAULT_MAX_ITERATIONS;
        this.config = { ...base, ...(deps.config ?? {}), tools: base.tools };
    }

    /**
     * Static per-turn context injected right after the persona — recomputed each iteration. A SHORT-lived
     * specialist (2–3 turns) puts its live canvas here: re-sending it each turn is cheap and it cannot amortize
     * a get_graph pull. A LONG-lived agent (builder / orchestrator) keeps this stable — roster or schema only —
     * and seeds the volatile canvas ONCE via {@link initialUserPreamble}, then pulls on demand, so its growing
     * transcript stays a cacheable prefix.
     */
    protected buildContextMessages(): ChatMessage[] {
        return [];
    }

    /**
     * Prepended once to the first user message of a fresh conversation — the initial state an agent is handed
     * up front (seed-once + pull). Default none: a long-lived top-level agent (builder / orchestrator) seeds the
     * starting graph here and then pulls fresh state via get_graph; a short-lived block specialist carries no
     * get_graph and instead re-seeds its type-scoped canvas each turn via buildContextMessages.
     */
    protected initialUserPreamble(): string {
        return '';
    }

    /** Hook fired at each turn's start with its abort signal; a subclass that spawns children forwards it. */
    protected onTurnSignal(_signal: AbortSignal): void {
        // default: no children to forward to
    }

    private nextId(prefix: string): string {
        return `${prefix}-${this.flowId}-${(this.seq += 1)}`;
    }

    private stamp(): number {
        return Date.now();
    }

    /** Fired whenever the in-flight turn's tracer advances; a subclass that spawns children republishes it. */
    protected onTurnTracer(_tracer: Tracer): void {
        // default: no children to forward to
    }

    /** Context merged onto the identity tracer at the start of each send(); the root mints a runId here. */
    protected beginRunContext(): TraceContext {
        return {};
    }

    private setTurnTracer(tracer: Tracer): void {
        this.turnTracerHolder.current = tracer;
        this.onTurnTracer(tracer);
    }

    /** Emit the appended message as a `message` event on the current turn tracer (the readable transcript). */
    private emitMessage(msg: Message): void {
        this.turnTracerHolder.current.emit({
            name: MESSAGE,
            fields: {
                role: msg.role,
                content: msg.content ?? '',
                ...(msg.toolCalls ? { toolCalls: msg.toolCalls.map(tc => ({ name: tc.name, args: tc.args })) } : {}),
                ...(msg.toolCallId ? { toolCallId: msg.toolCallId } : {}),
            },
        });
    }

    /** Run one assistant message's tool calls and feed results back into the transcript. Serial by default; a subclass may override to run an independent batch concurrently. */
    protected async runToolCalls(
        calls: CollectedToolCall[],
        assistantMsg: Message,
        state: SessionState
    ): Promise<void> {
        for (const tc of calls) {
            const result = await this.dispatchCall(tc);
            this.recordToolResult(tc, result, assistantMsg, state);
        }
    }

    /** Route one tool call through the executor (validate → grant + user-permission gate → provider). Never throws. */
    protected dispatchCall(tc: CollectedToolCall): Promise<ToolResult> {
        const call: ToolCall = { id: tc.id, name: tc.name, args: tc.args };
        return this.executor.dispatch(this.config, call, this.userPermissions);
    }

    /** Patch the assistant tool-call status and append the tool-result message. */
    protected recordToolResult(
        tc: CollectedToolCall,
        result: ToolResult,
        assistantMsg: Message,
        state: SessionState
    ): void {
        const recorded = assistantMsg.toolCalls?.find(c => c.id === tc.id);
        if (recorded) {
            recorded.status = result.ok ? 'ok' : 'error';
        }
        const toolMsg: Message = {
            id: this.nextId('t'),
            role: 'tool',
            content: resultToContent(result),
            toolCallId: tc.id,
            ts: this.stamp(),
        };
        state.messages.push(toolMsg);
        this.storage.save(state);
        this.emitMessage(toolMsg);
    }

    async send(text: string, opts?: { signal?: AbortSignal }): Promise<void> {
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
        // Link a parent's signal (a spawned child) so the parent's abort() cancels this turn too.
        const external = opts?.signal;
        if (external) {
            if (external.aborted) this.controller.abort();
            else external.addEventListener('abort', () => this.controller?.abort(), { once: true });
        }
        this.onTurnSignal(signal);

        // One request = one runId (the root mints it via beginRunContext; children inherit their parent's).
        const runTracer = this.identityTracer.child(this.beginRunContext());
        this.setTurnTracer(runTracer);
        runTracer.emit({ name: TURN_START, fields: { graph: this.binding.readGraph() } });

        // Seed the initial state into the first user message of a fresh conversation; later turns pull current
        // state via get_graph, so the transcript stays append-only.
        const preamble = state.messages.length === 0 ? this.initialUserPreamble() : '';
        const userContent = preamble ? `${preamble}\n\n${text}` : text;
        const userMsg: Message = { id: this.nextId('u'), role: 'user', content: userContent, ts: this.stamp() };
        state.messages.push(userMsg);
        state.phase = 'thinking';
        state.error = undefined;
        storage.save(state);
        this.emitMessage(userMsg);

        const finishTurn = (name: string, extra: Record<string, unknown> = {}): void => {
            this.turnTracerHolder.current.emit({ name, fields: { graph: this.binding.readGraph(), ...extra } });
        };

        try {
            for (let i = 0; i < maxIterations; i += 1) {
                if (signal.aborted) {
                    state.phase = 'done';
                    storage.save(state);
                    finishTurn(TURN_DONE);
                    return;
                }

                this.setTurnTracer(runTracer.child({ turn: i }));
                this.turnTracerHolder.current.emit({ name: TURN_STEP, fields: { turn: i } });

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
                    finishTurn(TURN_DONE);
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
                    this.emitMessage(assistantMsg);

                    await this.runToolCalls(res.toolCalls, assistantMsg, state);
                    // The turn ends only on a message with no tool calls; keep looping.
                    continue;
                }

                // Final text only — the turn is complete.
                if (res.text) {
                    const finalMsg: Message = {
                        id: this.nextId('a'),
                        role: 'assistant',
                        content: res.text,
                        ts: this.stamp(),
                    };
                    state.messages.push(finalMsg);
                    this.emitMessage(finalMsg);
                }
                state.phase = 'done';
                storage.save(state);
                finishTurn(TURN_DONE);
                return;
            }

            state.phase = 'error';
            state.error = `${config.id}: exceeded ${maxIterations} reasoning iterations without finishing`;
            storage.save(state);
            finishTurn(TURN_ERROR, { error: state.error });
        } catch (err) {
            if (signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
                state.phase = 'done';
                storage.save(state);
                finishTurn(TURN_DONE);
                return;
            }
            state.phase = 'error';
            state.error = errorMessage(err);
            storage.save(state);
            finishTurn(TURN_ERROR, { error: state.error });
        }
    }

    abort(): void {
        this.controller?.abort();
    }
}
