import type { GraphEdge, GraphNode } from '../types';

/**
 * What the engine tells the outside world.
 *
 * Coarse-grained on purpose: one event per committed change, not one per field. A React
 * binding re-reads `nodes`/`edges` wholesale anyway, and a field-level stream would only
 * give it more chances to render a half-applied edit.
 */
export type EngineEvent =
    | { type: 'graph:changed'; label: string }
    | { type: 'graph:runtime'; nodeId: string }
    | { type: 'graph:loaded' }
    | { type: 'history:changed'; canUndo: boolean; canRedo: boolean };

export type EngineListener = (event: EngineEvent) => void;

/** The graph as history keeps it — a deep copy, detached from the live arrays. */
export interface GraphSnapshot {
    nodes: GraphNode[];
    edges: GraphEdge[];
}

/**
 * The graph itself, plus the only channel anything hears about it on.
 *
 * Deliberately plain: no zustand, no React. The engine has to run in a worker and in a
 * CLI, and a store dependency here would pin it to the browser for good.
 */
export interface FlowDocument {
    /** The live arrays. Read them; never mutate them — `replace` is the only writer. */
    nodes: () => GraphNode[];
    edges: () => GraphEdge[];
    /** A detached deep copy — what history stores and what `getGraph` hands out. */
    snapshot: () => GraphSnapshot;
    replace: (next: GraphSnapshot) => void;
    subscribe: (listener: EngineListener) => () => void;
    emit: (event: EngineEvent) => void;
}

export const createDocument = (): FlowDocument => {
    let nodes: GraphNode[] = [];
    let edges: GraphEdge[] = [];
    const listeners = new Set<EngineListener>();

    return {
        nodes: () => nodes,
        edges: () => edges,
        snapshot: () => structuredClone({ nodes, edges }),
        replace: next => {
            nodes = next.nodes;
            edges = next.edges;
        },
        subscribe: listener => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        // Iterate a copy: a listener is free to unsubscribe — or subscribe — while being
        // told about a change, and mutating the set mid-iteration would skip its neighbour.
        emit: event => [...listeners].forEach(listener => listener(event)),
    };
};
