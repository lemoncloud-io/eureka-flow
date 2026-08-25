import { emptySession } from '../session/session';

import type { SessionState, SessionStore } from '../session/session';

/**
 * A {@link SessionStore} whose every `save` also notifies a listener — the reactive seam that lets the
 * terminal redraw mid-turn. `BaseAgent` writes state on every op (user message, each think/act step, each
 * tool result, final, error), so `onSave` fires many times per turn.
 *
 * `load`/`create` return the **live** object because `BaseAgent` loads once and mutates `state.messages` in
 * place across its loop; `save` hands the listener a **snapshot** (fresh message/tool-call objects), since a
 * listener holding the live reference would see it change under it between saves. Single-slot on purpose —
 * every sub-agent gets its own store, so this one only ever holds the orchestrator's session.
 */
export const createObservableSessionStore = (onSave: (state: SessionState) => void): SessionStore => {
    let current: SessionState | null = null;

    const snapshot = (state: SessionState): SessionState => ({
        ...state,
        messages: state.messages.map(m => ({ ...m, toolCalls: m.toolCalls?.map(tc => ({ ...tc })) })),
    });

    return {
        load: () => current,
        create: flowId => {
            current = emptySession(flowId);
            return current;
        },
        save: state => {
            current = state;
            onSave(snapshot(state));
        },
    };
};
