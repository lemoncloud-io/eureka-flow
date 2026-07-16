import { StrictMode } from 'react';

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { createInMemoryCanvasBinding } from '@flows/agent';

import { useLocatorAgent } from './useLocatorAgent';

import type { Chunk, LlmGateway } from '@flows/agent';
import type { NodeData } from '@lemoncloud/eureka-flows-api';

const makeNode = (id: string): NodeData => ({ id, type: 'test', position: { x: 0, y: 0 } });

/** A gateway whose turn hangs until aborted, exposing the AbortSignals it received. */
const makeHangingGateway = () => {
    const signals: (AbortSignal | undefined)[] = [];
    const gateway: LlmGateway = {
        async *chat(_req, opts): AsyncIterable<Chunk> {
            signals.push(opts?.signal);
            await new Promise<void>((_resolve, reject) => {
                opts?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
            });
            yield { done: true }; // unreachable — the await never resolves; satisfies require-yield
        },
    };
    return { gateway, signals };
};

// Sessions persist to localStorage keyed by flowId; clear between tests so they stay isolated
// (and so the StrictMode test genuinely starts from an empty transcript).
afterEach(() => localStorage.clear());

describe('useLocatorAgent', () => {
    it('aborts and silences the outgoing agent when the flow changes mid-request', async () => {
        const bindingA = createInMemoryCanvasBinding({ nodes: [makeNode('a')], edges: [] });
        const bindingB = createInMemoryCanvasBinding({ nodes: [makeNode('b')], edges: [] });
        const { gateway, signals } = makeHangingGateway();

        const { result, rerender } = renderHook(
            ({ flowId, binding }) => useLocatorAgent({ binding, flowId, gateway }),
            { initialProps: { flowId: 'A', binding: bindingA } }
        );

        act(() => result.current.send('move a node'));
        await waitFor(() => expect(signals).toHaveLength(1));
        expect(signals[0]?.aborted).toBe(false);

        // Switch flows while flow A's turn is still in flight.
        rerender({ flowId: 'B', binding: bindingB });

        // A's agent is aborted (its stream is freed; it can't mutate B's canvas)...
        expect(signals[0]?.aborted).toBe(true);
        // ...and B starts from a clean transcript (no cross-flow clobber, no stale flash).
        expect(result.current.session).toBeNull();
    });

    it('keeps rendering the transcript under StrictMode (re-arms after the remount)', async () => {
        // Regression: StrictMode does mount→unmount→remount. The unmount disposes the agent
        // (silences its `save`); without re-arming on remount, every message — the user's own
        // included — would stay invisible for the whole dev session.
        const binding = createInMemoryCanvasBinding({ nodes: [makeNode('a')], edges: [] });
        const gateway: LlmGateway = {
            async *chat(): AsyncIterable<Chunk> {
                yield { text: 'done' };
                yield { done: true };
            },
        };

        const { result } = renderHook(() => useLocatorAgent({ binding, flowId: 'A', gateway }), {
            wrapper: StrictMode,
        });

        act(() => result.current.send('move a right'));

        await waitFor(() => {
            expect(result.current.session?.messages.some(m => m.role === 'user')).toBe(true);
        });
    });

    it('persists the transcript and rehydrates it on a fresh mount (reload)', async () => {
        const binding = createInMemoryCanvasBinding({ nodes: [makeNode('a')], edges: [] });
        const gateway: LlmGateway = {
            async *chat(): AsyncIterable<Chunk> {
                yield { text: 'moved it' };
                yield { done: true };
            },
        };

        const first = renderHook(() => useLocatorAgent({ binding, flowId: 'persist', gateway }));
        act(() => first.result.current.send('move a right'));
        await waitFor(() => expect(first.result.current.session?.phase).toBe('done'));
        first.unmount();

        // A brand-new mount (≈ page reload) reads the persisted transcript back from localStorage.
        const second = renderHook(() => useLocatorAgent({ binding, flowId: 'persist', gateway }));
        await waitFor(() =>
            expect(second.result.current.session?.messages.map(m => m.content)).toContain('move a right')
        );
    });

    it('sanitizes a persisted `thinking` phase to `idle` on rehydrate (reload mid-turn)', () => {
        // A turn can't survive a reload; if it did, a stale `thinking` would leave the composer
        // disabled and block the next send. readPersistedSession clears it on the way in.
        const binding = createInMemoryCanvasBinding({ nodes: [makeNode('a')], edges: [] });
        const gateway: LlmGateway = {
            async *chat(): AsyncIterable<Chunk> {
                yield { done: true };
            },
        };
        localStorage.setItem(
            'flow-agent-session:stuck',
            JSON.stringify({
                flowId: 'stuck',
                messages: [{ id: 'u1', role: 'user', content: 'move a', ts: 1 }],
                phase: 'thinking',
            })
        );

        const { result } = renderHook(() => useLocatorAgent({ binding, flowId: 'stuck', gateway }));

        expect(result.current.session?.phase).toBe('idle');
        expect(result.current.session?.messages.some(m => m.content === 'move a')).toBe(true);
    });

    it('aborts the agent on unmount', async () => {
        const binding = createInMemoryCanvasBinding({ nodes: [makeNode('a')], edges: [] });
        const { gateway, signals } = makeHangingGateway();

        const { result, unmount } = renderHook(() => useLocatorAgent({ binding, flowId: 'A', gateway }));
        act(() => result.current.send('move a node'));
        await waitFor(() => expect(signals).toHaveLength(1));

        unmount();
        expect(signals[0]?.aborted).toBe(true);
    });
});
