import type { GraphSnapshot } from './document';

/**
 * How far back undo reaches.
 *
 * Snapshots are whole-graph deep copies, and an unsaved image lives as base64 inside node
 * config, so an unbounded stack is measured in hundreds of megabytes rather than entries.
 */
export const HISTORY_LIMIT = 100;

/**
 * Undo/redo as two stacks of whole-graph snapshots.
 *
 * Snapshots rather than diffs: the engine is young, the graphs are small, and a diff
 * representation is an optimisation that can arrive later without any caller noticing —
 * nothing outside this file knows what a history entry looks like.
 */
export interface History {
    /** Record the graph as it stood before a change. Anything redoable is now stale. */
    push: (before: GraphSnapshot) => void;
    undo: (current: GraphSnapshot) => GraphSnapshot | null;
    redo: (current: GraphSnapshot) => GraphSnapshot | null;
    canUndo: () => boolean;
    canRedo: () => boolean;
    reset: () => void;
}

export const createHistory = (): History => {
    let past: GraphSnapshot[] = [];
    let future: GraphSnapshot[] = [];

    return {
        push: before => {
            past.push(before);
            if (past.length > HISTORY_LIMIT) past.shift();
            future = [];
        },
        undo: current => {
            const previous = past.pop();
            if (!previous) return null;
            future.push(current);
            return previous;
        },
        redo: current => {
            const next = future.pop();
            if (!next) return null;
            past.push(current);
            return next;
        },
        canUndo: () => past.length > 0,
        canRedo: () => future.length > 0,
        reset: () => {
            past = [];
            future = [];
        },
    };
};
