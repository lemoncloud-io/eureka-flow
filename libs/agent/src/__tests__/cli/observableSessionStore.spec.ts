import { describe, expect, it, vi } from 'vitest';

import { createObservableSessionStore } from '../../cli/observableSessionStore';

import type { Message, SessionState } from '../../session/session';

describe('createObservableSessionStore', () => {
    it('create seeds an empty session and load returns the live object', () => {
        const store = createObservableSessionStore(() => undefined);
        const created = store.create('terminal');
        expect(created).toEqual({ flowId: 'terminal', messages: [], phase: 'idle' });
        // load returns the SAME live object BaseAgent mutates across its loop.
        expect(store.load('terminal')).toBe(created);
    });

    it('fires onSave on every save (the reactive seam)', () => {
        const onSave = vi.fn();
        const store = createObservableSessionStore(onSave);
        const state = store.create('terminal');

        state.phase = 'thinking';
        store.save(state);
        state.messages.push({ id: 'u1', role: 'user', content: 'hi', ts: 1 });
        store.save(state);

        expect(onSave).toHaveBeenCalledTimes(2);
        expect(onSave.mock.calls[0][0].phase).toBe('thinking');
        expect(onSave.mock.calls[1][0].messages).toHaveLength(1);
    });

    it('hands the listener a snapshot decoupled from later in-place mutation', () => {
        const seen: SessionState[] = [];
        const store = createObservableSessionStore(s => seen.push(s));
        const state = store.create('terminal');

        state.messages.push({ id: 'a1', role: 'assistant', content: 'first', ts: 1 });
        store.save(state);

        // BaseAgent mutates the same array in place before the next save.
        state.messages.push({ id: 't1', role: 'tool', content: '{}', toolCallId: 'a1', ts: 2 });

        // The earlier snapshot must NOT have grown — it captured length 1.
        expect(seen[0].messages).toHaveLength(1);
        expect(seen[0].messages[0].content).toBe('first');
    });

    it('snapshots tool calls so a later status patch does not leak into a delivered snapshot', () => {
        const seen: SessionState[] = [];
        const store = createObservableSessionStore(s => seen.push(s));
        const state = store.create('terminal');

        const toolCalls: NonNullable<Message['toolCalls']> = [{ id: 'c1', name: 'spawn', args: '{}', status: 'ok' }];
        state.messages.push({ id: 'a1', role: 'assistant', toolCalls, ts: 1 });
        store.save(state);

        // The executor patches the live tool-call status later.
        toolCalls[0].status = 'error';

        expect(seen[0].messages[0].toolCalls?.[0].status).toBe('ok');
    });
});
