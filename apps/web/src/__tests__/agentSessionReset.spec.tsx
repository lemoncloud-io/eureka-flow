import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useAgentSession } from '../app/features/flows/hooks/useAgentSession';

import type { Agent, SessionState, SessionStore, Tracer } from '@flows/agent';

/**
 * `reset` has to forget a transcript that lives in two places at once — the agent's working copy and
 * the storage port it was persisted to — and it must not resurrect the old one when the fresh agent
 * hydrates. These assert both halves against a fake agent, no network or engine involved.
 */
const tracer: Tracer = { emit: vi.fn(), child: vi.fn(() => tracer) } as unknown as Tracer;

const persisted = (flowId: string): SessionState => ({
    flowId,
    phase: 'done',
    messages: [{ id: 'u1', role: 'user', content: 'the old conversation', ts: 0 }],
});

const makeStorage = (seed: Record<string, SessionState>) => {
    const store = new Map(Object.entries(seed));
    return {
        store,
        getJson: vi.fn(async (key: string) => (store.get(key) ?? null) as never),
        setJson: vi.fn(async (key: string, value: unknown) => {
            store.set(key, value as SessionState);
        }),
        remove: vi.fn(async (key: string) => {
            store.delete(key);
        }),
    };
};

/** A stand-in agent: `send` writes one message through the store the hook handed it. */
const makeCreateAgent = () => {
    const abort = vi.fn();
    const createAgent = (sessionStore: SessionStore): Agent =>
        ({
            send: async (text: string) => {
                const state = sessionStore.load() ?? sessionStore.create('flow-1');
                state.messages.push({ id: `m${state.messages.length}`, role: 'user', content: text, ts: 0 });
                sessionStore.save(state);
            },
            abort,
        }) as unknown as Agent;
    return { createAgent, abort };
};

describe('useAgentSession — reset', () => {
    it('drops the transcript, the stored copy, and does not restore it on the fresh agent', async () => {
        const storage = makeStorage({ 'session:flow-1': persisted('flow-1') });
        const { createAgent } = makeCreateAgent();
        const { result } = renderHook(() => useAgentSession({ flowId: 'flow-1', storage, tracer, createAgent }));

        await waitFor(() => expect(result.current.session?.messages).toHaveLength(1));

        act(() => result.current.reset());

        await waitFor(() => expect(result.current.session).toBeNull());
        expect(storage.remove).toHaveBeenCalledWith('session:flow-1');
        expect(storage.store.has('session:flow-1')).toBe(false);

        // The fresh agent hydrates after the reset; the old transcript must not come back.
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(result.current.session).toBeNull();
    });

    it('forgets even when the storage delete is still in flight', async () => {
        // The real port is async. If the fresh agent hydrates before the delete lands it would read the
        // transcript reset was supposed to forget, so the skip cannot depend on `remove` winning a race.
        const storage = makeStorage({ 'session:flow-1': persisted('flow-1') });
        let settleRemove = (): void => undefined;
        storage.remove.mockImplementation(
            (key: string) =>
                new Promise<void>(resolve => {
                    settleRemove = () => {
                        storage.store.delete(key);
                        resolve();
                    };
                })
        );

        const { createAgent } = makeCreateAgent();
        const { result } = renderHook(() => useAgentSession({ flowId: 'flow-1', storage, tracer, createAgent }));

        await waitFor(() => expect(result.current.session?.messages).toHaveLength(1));

        act(() => result.current.reset());
        // Let the fresh agent hydrate while the delete is still pending.
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 0));
        });
        expect(result.current.session).toBeNull();

        settleRemove();
        await waitFor(() => expect(storage.store.has('session:flow-1')).toBe(false));
        expect(result.current.session).toBeNull();
    });

    it('leaves the panel usable afterwards — the next turn starts a new transcript', async () => {
        const storage = makeStorage({ 'session:flow-1': persisted('flow-1') });
        const { createAgent } = makeCreateAgent();
        const { result } = renderHook(() => useAgentSession({ flowId: 'flow-1', storage, tracer, createAgent }));

        await waitFor(() => expect(result.current.session?.messages).toHaveLength(1));
        act(() => result.current.reset());
        await waitFor(() => expect(result.current.session).toBeNull());
        // `send` stays gated until the fresh agent has finished hydrating — that gate is the hook's,
        // not the test's, so wait it out rather than reaching past it.
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 0));
        });

        act(() => result.current.send('a brand new ask'));

        await waitFor(() => expect(result.current.session?.messages).toHaveLength(1));
        expect(result.current.session?.messages[0].content).toBe('a brand new ask');
    });
});
