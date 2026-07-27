import { copyNodes, pasteNodes } from './core/clipboard';
import { createDocument } from './core/document';
import { deduplicateEdges } from './core/edges';
import { createHistory } from './core/history';
import { createOps } from './core/ops';

import type { ClipboardPayload } from './core/clipboard';
import type { EngineListener, GraphSnapshot } from './core/document';
import type { GraphOps, OpsDeps } from './core/ops';
import type { NodeData, Position, WorkflowState } from '@lemoncloud/eureka-flows-api';

/**
 * The graph, and every way it is allowed to change.
 *
 * The engine knows nothing about permissions: `canModifyCanvas` is a question about a
 * person, and the caller that knows which person is asking is the one that answers it.
 * Handing the engine a grant would only move that check somewhere it cannot see the user.
 */
export interface FlowEngine {
    // ── reading / subscribing
    getGraph: () => Readonly<WorkflowState>;
    subscribe: (listener: EngineListener) => () => void;

    // ── editing: every structural change goes through one transaction
    transact: (label: string, fn: (ops: GraphOps) => void) => void;
    undo: () => boolean;
    redo: () => boolean;
    canUndo: () => boolean;
    canRedo: () => boolean;

    // ── runtime, which is not an edit
    applyRuntime: (nodeId: string, patch: Partial<NodeData>) => void;

    // ── clipboard
    copy: (nodeIds: string[]) => ClipboardPayload;
    paste: (payload: ClipboardPayload, offset?: Position) => string[];

    // ── document lifecycle
    loadGraph: (state: WorkflowState) => void;
    reset: () => void;
}

export type FlowEngineOptions = OpsDeps;

/**
 * Normalize a graph on the way in.
 *
 * `config` and `position` are optional on the wire but not in the canvas — a position-less
 * node crashes the first render that reads `node.position.x`. Duplicate edges come from
 * flows saved before edges carried client ids; nothing makes them any more.
 */
const normalize = (state: WorkflowState): GraphSnapshot => ({
    nodes: (state.nodes ?? []).map(n => ({ ...n, config: n.config ?? {}, position: n.position ?? { x: 0, y: 0 } })),
    edges: deduplicateEdges(state.edges ?? []),
});

export const createFlowEngine = (options: FlowEngineOptions = {}): FlowEngine => {
    const doc = createDocument();
    const history = createHistory();

    const announceHistory = (): void =>
        doc.emit({ type: 'history:changed', canUndo: history.canUndo(), canRedo: history.canRedo() });

    /** Commit a change that is already in the document, with the graph as it was before it. */
    const commit = (label: string, before: GraphSnapshot): void => {
        history.push(before);
        doc.emit({ type: 'graph:changed', label });
        announceHistory();
    };

    const swap = (take: (current: GraphSnapshot) => GraphSnapshot | null, label: string): boolean => {
        const restored = take(doc.snapshot());
        if (!restored) return false;
        doc.replace(restored);
        doc.emit({ type: 'graph:changed', label });
        announceHistory();
        return true;
    };

    return {
        getGraph: () => doc.snapshot(),

        subscribe: listener => doc.subscribe(listener),

        transact: (label, fn) => {
            const before = doc.snapshot();
            const { ops, retire } = createOps(doc, options);
            try {
                fn(ops);
            } catch (error) {
                // All or nothing. A transaction that got halfway leaves the graph in a
                // state the user never asked for and cannot undo, since nothing was
                // checkpointed — so put it back exactly as it was and let the caller see
                // the failure. History is untouched: the push below never ran.
                doc.replace(before);
                throw error;
            } finally {
                retire();
            }
            commit(label, before);
        },

        undo: () => swap(history.undo, 'history:undo'),
        redo: () => swap(history.redo, 'history:redo'),
        canUndo: () => history.canUndo(),
        canRedo: () => history.canRedo(),

        /**
         * Reflect a run. Not an edit: no checkpoint, no `graph:changed`, so a running flow
         * neither fills the undo stack nor reads as unsaved work.
         */
        applyRuntime: (nodeId, patch) => {
            const nodes = doc.nodes();
            if (!nodes.some(n => n.id === nodeId)) return;
            doc.replace({ nodes: nodes.map(n => (n.id === nodeId ? { ...n, ...patch } : n)), edges: doc.edges() });
            doc.emit({ type: 'graph:runtime', nodeId });
        },

        copy: nodeIds => copyNodes(doc.snapshot(), nodeIds),

        paste: (payload, offset) => {
            const before = doc.snapshot();
            const { graph, nodeIds } = pasteNodes(payload, offset);
            doc.replace({ nodes: [...doc.nodes(), ...graph.nodes], edges: [...doc.edges(), ...graph.edges] });
            commit('clipboard:paste', before);
            return nodeIds;
        },

        loadGraph: state => {
            doc.replace(normalize(state));
            // A freshly loaded document has no past worth returning to — undoing into the
            // previous flow's graph would be a different flow on screen.
            history.reset();
            doc.emit({ type: 'graph:loaded' });
            announceHistory();
        },

        reset: () => {
            doc.replace({ nodes: [], edges: [] });
            history.reset();
            doc.emit({ type: 'graph:loaded' });
            announceHistory();
        },
    };
};
