import { copyNodes, pasteNodes } from './core/clipboard';
import { createDocument } from './core/document';
import { deduplicateEdges } from './core/edges';
import { createHistory } from './core/history';
import { newNodeId } from './core/ids';
import { applyPortRows, propagateAlongEdges } from './core/ingress';
import { createOps } from './core/ops';

import type { ClipboardPayload } from './core/clipboard';
import type { EngineListener, GraphSnapshot } from './core/document';
import type { PortRow } from './core/ingress';
import type { GraphOps, OpsDeps } from './core/ops';
import type { EdgeData, NodeData, Position, WorkflowState } from '@lemoncloud/eureka-flows-api';

/**
 * The graph, and every way it is allowed to change.
 *
 * The engine knows nothing about permissions: `canModifyCanvas` is a question about a
 * person, and the caller that knows which person is asking is the one that answers it.
 * Handing the engine a grant would only move that check somewhere it cannot see the user.
 */
export interface FlowEngine {
    // ── reading / subscribing
    /**
     * The graph, in fresh arrays holding the live nodes.
     *
     * The arrays are copies, so a caller may sort or filter what it gets and so a
     * subscriber sees a new identity on every change. The nodes inside are not: every op
     * builds new objects rather than editing existing ones, and cloning a graph carrying
     * base64 image config on every read would cost more than the sharing saves. Read them;
     * do not write to them.
     */
    getGraph: () => Readonly<GraphSnapshot>;
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
    /**
     * Replace the document with a loaded flow. The single ingress: normalizing, minting
     * missing ids, folding in port values and propagating along edges all happen here, so
     * every runtime gets the same graph from the same response.
     */
    loadGraph: (state: WorkflowState, options?: { ports?: PortRow[] }) => void;
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
const normalize = (state: WorkflowState, ports: PortRow[]): GraphSnapshot => {
    const nodes = (state.nodes ?? []).map(n => ({
        ...n,
        // The one place the id guarantee is established. A node without an id cannot be
        // selected, connected or addressed, and save treats it as new either way — so
        // minting one here loses nothing and lets the rest of the graph stop asking.
        id: n.id || newNodeId(),
        config: n.config ?? {},
        position: n.position ?? { x: 0, y: 0 },
    }));

    // Older flows name the same field `connections`.
    const edges = deduplicateEdges(state.edges ?? (state as { connections?: EdgeData[] }).connections ?? []);

    // Port values arrive beside the nodes, and a node's output is its downstream's input.
    // Both passes belong here rather than at a caller: they used to run in the canvas
    // before it handed the graph over, so a headless load produced a different graph from
    // the same response — no port values, nothing propagated.
    return { nodes: propagateAlongEdges(applyPortRows(nodes, ports), edges), edges };
};

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
        getGraph: () => ({ nodes: [...doc.nodes()], edges: [...doc.edges()] }),

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

        // Not `doc.snapshot()`: that deep-clones the whole flow so `copyNodes` can throw
        // most of it away. `copyNodes` clones what it keeps.
        copy: nodeIds => copyNodes({ nodes: doc.nodes(), edges: doc.edges() }, nodeIds),

        paste: (payload, offset) => {
            const before = doc.snapshot();
            const { graph, nodeIds } = pasteNodes(payload, offset);
            doc.replace({ nodes: [...doc.nodes(), ...graph.nodes], edges: [...doc.edges(), ...graph.edges] });
            commit('clipboard:paste', before);
            return nodeIds;
        },

        loadGraph: (state, { ports = [] } = {}) => {
            doc.replace(normalize(state, ports));
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
