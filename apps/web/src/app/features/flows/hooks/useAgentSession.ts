import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { Agent, AgentEnvironmentSupportable, SessionState, Storage } from '@flows/agent';

// Per-flow session persistence (SPEC 0002 §6.4 / 0001 §6.6): the transcript survives a page
// reload and re-opening the flow. Persistence goes through the Agent Environment's storage
// port — never raw localStorage — so real run data lands in the `flow_mosaic_agent_`
// namespace and the browser/virtual runtimes stay swappable. Best-effort as before: storage
// errors are swallowed, and a stale `thinking` phase (a turn that didn't survive the reload)
// is cleared so the panel isn't stuck and the next send isn't blocked by the guard.
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
    /**
     * Read this flow's persisted session and apply it if nothing has happened yet. Driven by an
     * effect (not the memo factory) so it has no side effect during render/StrictMode double-invoke.
     * Always resolves — read errors are swallowed — so callers can use it to flip a "hydrated" gate.
     */
    hydrate: () => Promise<void>;
    /** The live working copy's phase after a turn settles — lets tracing tell done from errored. */
    getPhase: () => SessionState['phase'] | null;
}

export interface UseAgentSessionArgs {
    flowId: string;
    /** The browser Agent Environment: session persistence flows through its storage port, run lifecycle through its trace reporter. */
    environment: AgentEnvironmentSupportable;
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
 * (persisted through the Agent Environment's storage, so it survives a page reload / re-opening
 * the flow — §6.4) and re-renders on every `save` — the one-way render loop from the spec (Panel
 * emits `send` → the agent writes `SessionState` → store → Panel; §6.4). What agent it drives is
 * the caller's only choice, made through `createAgent`; nothing here is locator-specific.
 *
 * Hydration is asynchronous (the storage port is Promise-based): the working copy starts empty
 * and an effect reads the persisted transcript, applying it unless a send already created fresh
 * state. `send` is gated on a `hydrated` flag so a very early send can't make the agent create a
 * fresh session on top of an unread transcript — closing the read/write race even if the storage
 * port is backed by something slower than localStorage later.
 *
 * The agent (and its storage) are rebuilt when `createAgent` changes. Crucially, the outgoing
 * agent is **aborted and silenced** when it is replaced or the panel unmounts, so an in-flight
 * turn from flow A can't mutate flow B's canvas or clobber its transcript, and the LLM stream is
 * freed.
 */
export const useAgentSession = ({ flowId, environment, createAgent }: UseAgentSessionArgs): UseAgentSessionResult => {
    const [session, setSession] = useState<SessionState | null>(null);

    const instance = useMemo<AgentInstance>(() => {
        // The agent's working copy; hydrated asynchronously from the environment storage below.
        let current: SessionState | null = null;
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
                // Real run data through the environment's storage port (best-effort, like before).
                void environment.storage.setJson(keyFor(s.flowId), s).catch(() => undefined);
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
            // Read + apply the persisted transcript. Applied only while this instance is live and
            // nothing (a user send) has produced state in the meantime. Invoked from an effect,
            // never the factory, so the memo stays pure through StrictMode's double-invoke.
            hydrate: async () => {
                try {
                    const persisted = await environment.storage.getJson<SessionState>(keyFor(flowId));
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
    }, [flowId, environment, createAgent]);

    // `send` is blocked until this instance's persisted transcript has been read (or the read
    // settled). Reset per instance below; flipped true by the hydration effect.
    const [hydrated, setHydrated] = useState(false);

    // When the agent changes (flow switch / first mount / reload), clear the visible transcript
    // immediately — the new instance's async hydration fills it in — so the previous flow's
    // messages are never shown under the new flow. React's adjust-state-during-render pattern.
    const prevRef = useRef<AgentInstance | null>(null);
    if (prevRef.current !== instance) {
        prevRef.current = instance;
        setSession(null);
        setHydrated(false);
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

    // Hydrate this instance's transcript after arm (a passive effect, so it never blocks paint),
    // then open the `send` gate. `cancelled` keeps a superseded instance's read from flipping the
    // gate for the current one; `hydrate` always resolves, so the gate always opens.
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
            // Block until the persisted transcript has been read (see `hydrated`), so an early
            // send can't spawn a fresh session over an unread one. In practice the read resolves
            // within a microtask of mount, so this is invisible to a human.
            if (!trimmed || !hydrated) {
                return;
            }
            // Real run lifecycle through the environment's trace reporter. BaseAgent.send
            // resolves after the whole turn — it converts failures into `session.error` rather
            // than rejecting — so read the settled phase to tell a real completion from an
            // errored run. Only `flowId` and the outcome are traced: never the prompt, the
            // error text, tool args, or any secret.
            const trace = environment.traceReporter;
            trace?.info('agent.run.start', { flowId });
            void instance.agent.send(trimmed).then(
                () =>
                    instance.getPhase() === 'error'
                        ? trace?.error('agent.run.error', { flowId })
                        : trace?.info('agent.run.done', { flowId }),
                () => trace?.error('agent.run.error', { flowId })
            );
        },
        [instance, environment, flowId, hydrated]
    );

    const abort = useCallback(() => instance.agent.abort(), [instance]);

    return { session, send, abort };
};
