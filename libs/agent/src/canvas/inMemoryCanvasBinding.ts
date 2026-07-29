import type { CanvasBinding, EdgeSpec, Graph, NodePatch, XY } from './canvasBinding';
import type { EdgeData, NodeData } from '@lemoncloud/eureka-flows-api';

/**
 * In-memory {@link CanvasBinding} over a plain {@link Graph} — the reference binding for tests and Node runs.
 * Mirrors the desktop binding's mechanics: `updateNode` merges config; `deleteNode` cascades edges;
 * `addEdge` replaces an edge on an occupied input port. Ids are minted from monotonic counters (deterministic
 * for tests); the desktop binding uses the real `newNodeId`/`newEdgeId`. Structural writes seed no default
 * config here (the block registry is a desktop concern) — a created node starts with `config: {}`.
 */
export const createInMemoryCanvasBinding = (initial?: Graph): CanvasBinding => {
    let nodeSeq = 0;
    let edgeSeq = 0;

    // Every live edge must carry a stable id — list_edges, disconnect_edge, and delete_node's dropped-edge
    // report all key on it — so mint one for any seeded edge missing one, mirroring the desktop store where
    // newEdgeId() always runs. (EdgeData.id is optional; '' means "to create".)
    const withEdgeIds = (g: Graph): Graph => ({
        ...g,
        edges: g.edges.map(edge => (edge.id ? edge : { ...edge, id: `e_${(edgeSeq += 1)}` })),
    });

    let graph: Graph = withEdgeIds(initial ?? { nodes: [], edges: [] });

    return {
        // Fresh wrapper each call so callers mutating the returned arrays can't corrupt the store.
        readGraph: () => ({ nodes: [...graph.nodes], edges: [...graph.edges] }),

        updateNode: (id: string, patch: NodePatch) => {
            graph = {
                ...graph,
                nodes: graph.nodes.map(node => {
                    if (node.id !== id) {
                        return node;
                    }
                    const next: NodeData = { ...node };
                    if (patch.position) {
                        // Replace position whole — never a partial axis.
                        next.position = { x: patch.position.x, y: patch.position.y };
                    }
                    if (patch.label !== undefined) {
                        next.customLabel = patch.label || undefined;
                    }
                    if (patch.config) {
                        // Merge so keys the patch omits are preserved (A2).
                        next.config = { ...node.config, ...patch.config };
                    }
                    return next;
                }),
            };
        },

        addNode: (type: string, position: XY): { id: string } => {
            const id = `n_${(nodeSeq += 1)}`;
            const node: NodeData = { id, type, position: { x: position.x, y: position.y }, config: {} };
            graph = { ...graph, nodes: [...graph.nodes, node] };
            return { id };
        },

        deleteNode: (id: string) => {
            graph = {
                nodes: graph.nodes.filter(n => n.id !== id),
                // Cascade: drop every edge that touches the removed node.
                edges: graph.edges.filter(e => e.sourceNodeId !== id && e.targetNodeId !== id),
            };
        },

        addEdge: (spec: EdgeSpec): { id: string } => {
            const id = `e_${(edgeSeq += 1)}`;
            const edge: EdgeData = { id, ...spec };
            // Replace-on-occupied-input: one edge per (targetNode, targetPort), like a user drag.
            const kept = graph.edges.filter(
                e => !(e.targetNodeId === spec.targetNodeId && e.targetPortId === spec.targetPortId)
            );
            graph = { ...graph, edges: [...kept, edge] };
            return { id };
        },

        deleteEdge: (id: string) => {
            graph = { ...graph, edges: graph.edges.filter(e => e.id !== id) };
        },
    };
};
