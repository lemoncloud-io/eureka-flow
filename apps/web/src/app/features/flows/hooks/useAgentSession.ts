import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { Agent, AgentStorageSupportable, SessionState, SessionStore, Tracer } from '@flows/agent';

/** The narrow persistence slice this hook needs — just the two JSON ops, per ISP. */
type SessionPersistence = Pick<AgentStorageSupportable, 'getJson' | 'setJson'>;

// Per-flow session persistence through the injected storage port (survives reload).
// Best-effort: storage errors are swallowed, and a stale `thinking` phase is cleared so the panel isn't stuck.
const SESSION_KEY_PREFIX = 'session:';
const keyFor = (flowId: string): string => `${SESSION_KEY_PREFIX}${flowId}`;

const sanitizePersisted = (state: SessionState): SessionState =>
    state.phase === 'thinking' ? { ...state, phase: 'idle' } : state;

/** An agent plus lifecycle controls: (re)enable its state writes, or stop and silence it. */
interface AgentInstance {
    agent: Agent;
    /** Re-enable state writes. Called on mount to survive StrictMode's remount. */
    arm: () => void;
    /** Stop the agent and silence its late `save` writes. Called on replace/unmount. */
    dispose: () => void;
    /** Read the persisted session and apply it if nothing has happened yet. Always resolves (read errors swallowed). */
    hydrate: () => Promise<void>;
    /** The live working copy's phase after a turn settles — lets tracing tell done from errored. */
    getPhase: () => SessionState['phase'] | null;
}

export interface UseAgentSessionArgs {
    flowId: string;
    /** Session persistence port (survives reload). */
    persistence: SessionPersistence;
    /** Tracer for run-lifecycle events (agent.run.start/done/error). */
    tracer: Tracer;
    /** Build the agent over the hook's {@link SessionStore}. Wrap in `useCallback` so it's stable per (flowId + agent inputs). */
    createAgent: (storage: SessionStore) => Agent;
}

export interface UseAgentSessionResult {
    session: SessionState | null;
    send: (text: string) => void;
    abort: () => void;
}

/**
 * The generic React binding shared by every in-browser agent: owns a per-flow session store
 * (persisted through the Agent Environment, survives reload) and re-renders on every `save`
 * (Panel emits `send` → agent writes SessionState → store → Panel). The agent it drives is the
 * caller's choice via `createAgent`; nothing here is locator-specific. `send` is gated on async
 * hydration, and the outgoing agent is aborted + silenced on flow switch / unmount.
 */
export const useAgentSession = ({
    flowId,
    persistence,
    tracer,
    createAgent,
}: UseAgentSessionArgs): UseAgentSessionResult => {
    const [session, setSession] = useState<SessionState | null>(null);

    const instance = useMemo<AgentInstance>(() => {
        // The agent's working copy; hydrated asynchronously from the environment storage below.
        let current: SessionState | null = null;
        // `alive` gates state writes: a disposed agent's late `save` can't touch the new flow's session.
        let alive = true;
        // Snapshot with fresh object identities so React re-renders on each save.
        const snapshot = (s: SessionState): SessionState => ({
            ...s,
            messages: s.messages.map(m => ({ ...m, toolCalls: m.toolCalls?.map(tc => ({ ...tc })) })),
        });
        const storage: SessionStore = {
            load: () => current,
            create: id => {
                current = { flowId: id, messages: [], phase: 'idle' };
                return current;
            },
            save: s => {
                current = s;
                // Real run data through the injected storage port (best-effort, like before).
                void persistence.setJson(keyFor(s.flowId), s).catch(() => undefined);
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
            // Applied only while live and nothing has produced state yet; invoked from an effect (pure memo through StrictMode).
            hydrate: async () => {
                try {
                    const persisted = await persistence.getJson<SessionState>(keyFor(flowId));
                    if (alive && current === null && persisted) {
                        const restored = sanitizePersisted(persisted);
                        current = restored;
                        setSession(snapshot(restored));
                    }
                } catch {
                    // best-effort: ignore read errors, leave the transcript empty.
                }
            },
            getPhase: () => current?.phase ?? null,
        };
    }, [flowId, persistence, tracer, createAgent]);

    // `send` is blocked until this instance's transcript has been read; flipped true by the hydration effect below.
    const [hydrated, setHydrated] = useState(false);

    // On agent change (flow switch / mount / reload) clear the visible transcript immediately so the
    // previous flow's messages never show under the new flow (React adjust-state-during-render).
    const prevRef = useRef<AgentInstance | null>(null);
    if (prevRef.current !== instance) {
        prevRef.current = instance;
        setSession(null);
        setHydrated(false);
    }

    // A *layout* effect on purpose: cleanup runs before paint, so on a flow switch the outgoing agent
    // is silenced+aborted before an in-flight chunk can clobber the new panel via `setSession`.
    // `arm()` on setup re-enables writes so this survives StrictMode's mount→unmount→remount.
    useLayoutEffect(() => {
        instance.arm();
        return instance.dispose;
    }, [instance]);

    // Hydrate after arm (passive effect), then open the `send` gate. `cancelled` keeps a superseded
    // instance's read from flipping the gate; `hydrate` always resolves, so the gate always opens.
    useEffect(() => {
        let cancelled = false;
        void instance.hydrate().finally(() => {
            if (!cancelled) {
                setHydrated(true);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [instance]);

    const send = useCallback(
        (text: string) => {
            const trimmed = text.trim();
            // Block until the transcript has been read, so an early send can't spawn a fresh session over an unread one.
            if (!trimmed || !hydrated) {
                return;
            }
            // BaseAgent.send resolves after the whole turn (failures become session.error, not a reject),
            // so read the settled phase to tell done from errored. Only flowId + outcome are traced — never secrets.
            const runError = () => tracer.emit({ name: 'agent.run.error', level: 'error', fields: { flowId } });
            tracer.emit({ name: 'agent.run.start', level: 'info', fields: { flowId } });
            void instance.agent.send(trimmed).then(
                () =>
                    instance.getPhase() === 'error'
                        ? runError()
                        : tracer.emit({ name: 'agent.run.done', level: 'info', fields: { flowId } }),
                () => runError()
            );
        },
        [instance, tracer, flowId, hydrated]
    );

    const abort = useCallback(() => instance.agent.abort(), [instance]);

    return { session, send, abort };
};
