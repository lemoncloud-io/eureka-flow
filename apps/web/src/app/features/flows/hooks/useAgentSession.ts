import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { Agent, SessionState, Storage } from '@flows/agent';

// Per-flow session persistence (SPEC 0002 §6.4 / 0001 §6.6): the transcript is kept in
// localStorage keyed by flowId so it survives a page reload and re-opening the flow. Best-effort
// — storage errors are swallowed, and a stale `thinking` phase (a turn that didn't survive the
// reload) is cleared so the panel isn't stuck and the next send isn't blocked by the guard.
const SESSION_KEY_PREFIX = 'flow-agent-session:';
const keyFor = (flowId: string): string => `${SESSION_KEY_PREFIX}${flowId}`;

const readPersistedSession = (flowId: string): SessionState | null => {
    try {
        const raw = localStorage.getItem(keyFor(flowId));
        if (!raw) {
            return null;
        }
        const state = JSON.parse(raw) as SessionState;
        return state.phase === 'thinking' ? { ...state, phase: 'idle' } : state;
    } catch {
        return null;
    }
};

const writePersistedSession = (state: SessionState): void => {
    try {
        localStorage.setItem(keyFor(state.flowId), JSON.stringify(state));
    } catch {
        // best-effort: ignore quota / serialization / unavailable-storage errors.
    }
};

/** An agent plus lifecycle controls: (re)enable its state writes, or stop and silence it. */
interface AgentInstance {
    agent: Agent;
    /** Re-enable state writes. Called on mount to survive StrictMode's remount. */
    arm: () => void;
    /** Stop the agent and silence its late `save` writes. Called on replace/unmount. */
    dispose: () => void;
}

export interface UseAgentSessionArgs {
    flowId: string;
    /**
     * Build the agent over the hook's persisted, panel-re-rendering {@link Storage}. Must be
     * stable for a given (flowId + agent inputs): wrap it in `useCallback` keyed on those inputs
     * so the agent is rebuilt exactly when they change (flow switch, gateway/binding swap).
     */
    createAgent: (storage: Storage) => Agent;
}

export interface UseAgentSessionResult {
    session: SessionState | null;
    send: (text: string) => void;
    abort: () => void;
}

/**
 * The generic React binding shared by every in-browser agent: it owns a per-flow session store
 * (backed by localStorage, so it survives a page reload / re-opening the flow — §6.4) and
 * re-renders on every `save` — the one-way render loop from the spec (Panel emits `send` → the
 * agent writes `SessionState` → store → Panel; §6.4). What agent it drives is the caller's only
 * choice, made through `createAgent`; nothing here is locator-specific.
 *
 * The agent (and its storage) are rebuilt when `createAgent` changes. Crucially, the outgoing
 * agent is **aborted and silenced** when it is replaced or the panel unmounts, so an in-flight
 * turn from flow A can't mutate flow B's canvas or clobber its transcript, and the LLM stream is
 * freed.
 */
export const useAgentSession = ({ flowId, createAgent }: UseAgentSessionArgs): UseAgentSessionResult => {
    const [session, setSession] = useState<SessionState | null>(null);

    const instance = useMemo<AgentInstance>(() => {
        // Hydrate the agent's working copy from this flow's persisted transcript (null if none).
        let current: SessionState | null = readPersistedSession(flowId);
        // `alive` gates state writes: once disposed, a superseded agent's late `save`
        // (e.g. its abort/finalize) can no longer touch the new flow's session.
        let alive = true;
        // Snapshot with fresh object identities so React re-renders on each save.
        const snapshot = (s: SessionState): SessionState => ({
            ...s,
            messages: s.messages.map(m => ({ ...m, toolCalls: m.toolCalls?.map(tc => ({ ...tc })) })),
        });
        const storage: Storage = {
            load: () => current,
            create: id => {
                current = { flowId: id, messages: [], phase: 'idle' };
                return current;
            },
            save: s => {
                current = s;
                writePersistedSession(s);
                if (alive) {
                    setSession(snapshot(s));
                }
            },
        };
        const agent = createAgent(storage);
        return {
            agent,
            arm: () => {
                alive = true;
            },
            dispose: () => {
                alive = false;
                agent.abort();
            },
        };
    }, [flowId, createAgent]);

    // When the agent changes (flow switch / first mount / reload), rehydrate the visible
    // transcript from this flow's persisted session (null if none) — so the prior conversation
    // reappears and the previous flow's messages are never shown under the new flow. React's
    // adjust-state-during-render pattern: a pure localStorage read + setState, no side effects.
    const prevRef = useRef<AgentInstance | null>(null);
    if (prevRef.current !== instance) {
        prevRef.current = instance;
        setSession(readPersistedSession(flowId));
    }

    // Arm on mount, tear down on replace (flow switch) / unmount. This is a *layout* effect
    // on purpose: its cleanup runs synchronously at commit (before paint), so on a flow switch
    // the outgoing agent is silenced+aborted before any in-flight stream chunk can resolve and
    // clobber the new flow's panel through the shared `setSession` (a passive effect would run
    // after paint, leaving that window open). `arm()` on setup re-enables writes, which also
    // makes the whole thing survive StrictMode's mount→unmount→remount — without it the
    // simulated unmount's dispose (alive=false) would keep the transcript invisible all session.
    useLayoutEffect(() => {
        instance.arm();
        return instance.dispose;
    }, [instance]);

    const send = useCallback(
        (text: string) => {
            const trimmed = text.trim();
            if (trimmed) {
                void instance.agent.send(trimmed);
            }
        },
        [instance]
    );

    const abort = useCallback(() => instance.agent.abort(), [instance]);

    return { session, send, abort };
};
