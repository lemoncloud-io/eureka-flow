/**
 * An agent turn's lifecycle phase. The locator uses this subset because its moves apply
 * live, with no approval gate; more phases join as approval-gated agents are added.
 */
export type AgentPhase = 'idle' | 'thinking' | 'done' | 'error';

/** A single chat message the Panel renders from. */
export interface Message {
    id: string;
    role: 'user' | 'assistant' | 'tool' | 'system';
    content?: string;
    /**
     * Hidden context prepended to `content` ONLY when the message is sent to the model — never stored
     * in `content` and never shown in the panel. Carries the graph seed on a (re)seed turn (a fresh
     * conversation, or a continuation — reload or model switch), so the seed rides the user message
     * without leaking into the displayed transcript.
     */
    seedPrefix?: string;
    /** On assistant messages that call tools; `args` is the raw JSON string sent to the tool.
     * `thoughtSignature` — see `ChatMessage.toolCalls`'s doc in `llmGateway.ts`; persisted here so
     * it survives a reload and can be replayed back to Gemini on a later turn. Opaque; only Gemini's
     * "thinking" models currently populate it. */
    toolCalls?: { id: string; name: string; args: string; status: 'ok' | 'error'; thoughtSignature?: string }[];
    /** On tool-result messages: the assistant tool-call id this answers. */
    toolCallId?: string;
    ts: number;
}

/** The whole persisted turn state; the Panel is a pure function of it. */
export interface SessionState {
    flowId: string;
    messages: Message[];
    phase: AgentPhase;
    /** Set when `phase === 'error'`. */
    error?: string;
    /**
     * The orchestrator-instance epoch: 1 for a fresh conversation, incremented each time a NEW instance
     * continues an existing session (a reload or a model switch). Numbers the instance in the trace
     * (`orchestrator#N`) and marks a context boundary: the new epoch re-seeds the current graph and drops
     * the prior epoch's tool trace.
     */
    epoch?: number;
    /**
     * Context boundary: messages before this index are sent to the model as conversation only (their
     * tool-call/tool-result trace + now-stale graph seed dropped); messages at/after it are sent in full.
     * Advanced to the new turn at each epoch boundary. Default 0 (send all in full).
     */
    contextBaseIndex?: number;
}

/** Loads/creates/saves a session keyed by `flowId`. */
export interface SessionStore {
    load(flowId: string): SessionState | null;
    create(flowId: string): SessionState;
    save(state: SessionState): void;
}

export const emptySession = (flowId: string): SessionState => ({ flowId, messages: [], phase: 'idle' });

/**
 * A process-memory {@link SessionStore} — the default for tests and Node runs. The browser app
 * persists its session through an injected storage port instead.
 */
export const createInMemorySessionStore = (): SessionStore => {
    const sessions = new Map<string, SessionState>();
    return {
        load: (flowId: string) => sessions.get(flowId) ?? null,
        create: (flowId: string) => {
            const state = emptySession(flowId);
            sessions.set(flowId, state);
            return state;
        },
        save: (state: SessionState) => {
            sessions.set(state.flowId, state);
        },
    };
};
