import type { CanvasBinding, Graph, NodePatch } from './canvasBinding';
import type { NodeData } from '@lemoncloud/eureka-flows-api';

/** In-memory {@link CanvasBinding} over a plain {@link Graph} — the reference binding for tests and Node runs; `updateNode` mirrors the desktop binding. */
export const createInMemoryCanvasBinding = (initial?: Graph): CanvasBinding => {
    let graph: Graph = initial ?? { nodes: [], edges: [] };

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
    };
};
