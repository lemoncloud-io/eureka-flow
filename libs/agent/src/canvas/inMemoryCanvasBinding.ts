import type { CanvasBinding, Graph, XY } from './canvasBinding';
import type { NodeData } from '@lemoncloud/eureka-flows-api';

/** In-memory {@link CanvasBinding} backed by a plain {@link Graph}, for tests and Node runs. */
export const createInMemoryCanvasBinding = (initial?: Graph): CanvasBinding => {
    let graph: Graph = initial ?? { nodes: [], edges: [] };

    return {
        // Fresh wrapper each call so callers mutating the returned arrays can't corrupt the store.
        readGraph: () => ({ nodes: [...graph.nodes], edges: [...graph.edges] }),

        updateNode: (id: string, patch: { label?: string; position?: XY }) => {
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
                    return next;
                }),
            };
        },
    };
};
