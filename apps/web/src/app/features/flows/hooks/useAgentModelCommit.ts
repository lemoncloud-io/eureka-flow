import { useEffect } from 'react';

/**
 * Apply a model pick at the **turn boundary**. Calls `commit(selected)` while the agent is idle — so
 * the choice takes effect on the next turn — but stays silent while a turn is running, so the running
 * turn always finishes on the model it started with (never swapped mid-flight). A change made
 * mid-turn is held until the turn settles, then committed. React dedupes a `commit` to the current
 * value, so a plain `useState` setter is a safe `commit`.
 *
 * See docs/browser-agent/design/per-agent-model-selection.md §4.
 */
export const useAgentModelCommit = ({
    selected,
    running,
    commit,
}: {
    /** The user's current pick (undefined until it resolves). */
    selected: string | undefined;
    /** Whether a turn is in flight. */
    running: boolean;
    /** Adopt a model as the one the agent is built with. */
    commit: (model: string) => void;
}): void => {
    useEffect(() => {
        if (!running && selected) {
            commit(selected);
        }
    }, [running, selected, commit]);
};
