import type { WorkflowCanvasRef } from '../components/WorkflowCanvas';
import type { Connection, NodeData, WorkflowState } from '@lemoncloud/eureka-flows-api';
import type { RefObject } from 'react';

/** A point on the canvas. */
export interface XY {
    x: number;
    y: number;
}

/**
 * The live canvas graph, normalized to the agent's shape.
 * Note the collection is `connections` here, while the canvas exposes it as `edges`
 * (WorkflowState) — this binding is the single place that translates between them.
 */
export type Graph = {
    nodes: NodeData[];
    connections: Connection[];
};

/**
 * The single seam between (non-React) agent code and the React-owned live canvas.
 * See docs/specs/0001-agent-chat/SPEC.md §6.5 and canvas-binding.md.
 */
export interface CanvasBinding {
    /** Live structural read of the current canvas graph. */
    readGraph(): Graph;
    /** Edit one node's label / position, applied immediately (frontend-only). */
    updateNode(id: string, patch: { label?: string; position?: XY }): void;
    /** Replace the whole flow at once (apply a draft). */
    swapFlow(graph: Graph): void;
}

/**
 * Desktop binding: wraps the imperative `WorkflowCanvas` ref, because on desktop the
 * live canvas renders from component-local state, not the store — so agent code can't
 * read or write it directly.
 *
 * Pass the same ref object that is wired to `<WorkflowCanvas ref={...} />`; the binding
 * reads `ref.current` lazily on every call, so it stays valid across canvas re-renders.
 */
export const createDesktopCanvasBinding = (ref: RefObject<WorkflowCanvasRef | null>): CanvasBinding => {
    const canvas = (): WorkflowCanvasRef => {
        if (!ref.current) {
            throw new Error('CanvasBinding: canvas is not mounted');
        }
        return ref.current;
    };

    return {
        readGraph: () => {
            const wf: WorkflowState = canvas().getWorkflow(); // WorkflowState is { nodes, edges }
            return { nodes: wf.nodes ?? [], connections: wf.edges ?? [] };
        },

        updateNode: (id, patch) => {
            // `WorkflowCanvasRef.updateNode` shallow-merges, so nested objects must be
            // passed whole — never a partial position.
            const updates: Partial<NodeData> = {};
            if (patch.label !== undefined) {
                // '' clears the custom label → the node falls back to its definition label.
                updates.customLabel = patch.label || undefined;
            }
            if (patch.position) {
                updates.position = patch.position;
            }
            canvas().updateNode(id, updates);
        },

        swapFlow: graph => {
            // `loadWorkflow` reads `state.edges ?? state.connections`; emit `edges`.
            void canvas().loadWorkflow({ nodes: graph.nodes, edges: graph.connections });
        },
    };
};
