import type { CanvasBinding, Graph, XY } from './canvasBinding';
import type { NodeData } from '@lemoncloud/eureka-flows-api';

/**
 * An in-memory {@link CanvasBinding} backed by a plain {@link Graph}.
 *
 * This is the reference binding for tests and Node-environment runs: because the
 * locator agent writes straight through the binding (no draft), a plain object over
 * an array is all that is needed to exercise the whole turn without a browser.
 *
 * Its behavior mirrors the desktop binding:
 * - `updateNode` shallow-merges a node and **replaces `position` whole** (never a
 *   partial axis), and maps `label` → `customLabel` where `''`/falsy clears it so the
 *   node falls back to its block-definition label.
 * - `readGraph` returns the current graph; `swapFlow` replaces it wholesale.
 */
export const createInMemoryCanvasBinding = (initial?: Graph): CanvasBinding => {
    let graph: Graph = initial ?? { nodes: [], edges: [] };

    return {
        // Fresh wrapper each call (like the desktop binding), so a caller mutating the
        // returned arrays cannot corrupt the internal store.
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
                        // Whole object — matches the desktop binding's shallow merge.
                        next.position = { x: patch.position.x, y: patch.position.y };
                    }
                    if (patch.label !== undefined) {
                        next.customLabel = patch.label || undefined;
                    }
                    return next;
                }),
            };
        },

        swapFlow: (next: Graph) => {
            graph = next;
        },
    };
};
