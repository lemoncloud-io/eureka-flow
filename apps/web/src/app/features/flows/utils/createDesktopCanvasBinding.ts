import type { WorkflowCanvasRef } from '../components/WorkflowCanvas';
import type { CanvasBinding } from '@flows/agent';
import type { NodeData } from '@lemoncloud/eureka-flows-api';
import type { RefObject } from 'react';

/**
 * Desktop {@link CanvasBinding} over the engine-owned canvas: reads the graph through the
 * `WorkflowCanvas` ref (`getWorkflow()` is `engine.getGraph()`) and writes through the same
 * ref, which routes the edit into `engine.transact` so it checkpoints for undo.
 */
export const createDesktopCanvasBinding = (ref: RefObject<WorkflowCanvasRef | null>): CanvasBinding => {
    const canvas = (): WorkflowCanvasRef => {
        if (!ref.current) {
            throw new Error('CanvasBinding: canvas is not mounted');
        }
        return ref.current;
    };

    return {
        // Read the engine, not the store. The store is a one-way projection of the engine
        // (`useEngineMirror`) and it stops receiving updates while a drag or resize is in
        // flight, so it can be both behind on edits and ahead on uncommitted preview
        // positions. `getWorkflow()` is `engine.getGraph()` — exact, and it cannot lag.
        readGraph: () => {
            const { nodes, edges } = canvas().getWorkflow();
            return { nodes: nodes ?? [], edges: edges ?? [] };
        },

        updateNode: (id, patch) => {
            // `WorkflowCanvasRef.updateNode` shallow-merges at node level, so nested objects must be
            // passed whole — never a partial position, and `config` merged by us first (else it
            // would replace the whole config object and drop untouched keys — e.g. A2's temperature).
            const updates: Partial<NodeData> = {};
            if (patch.label !== undefined) {
                // '' clears the custom label → the node falls back to its definition label.
                updates.customLabel = patch.label || undefined;
            }
            if (patch.position) {
                updates.position = patch.position;
            }
            if (patch.config) {
                // Merge base from the engine (same source as readGraph). `ops.updateNode` replaces
                // `config` wholesale, so this merge is the only thing preserving untouched keys —
                // reading a projection that pauses mid-drag would silently drop a key written
                // earlier in the same turn.
                const current = canvas()
                    .getWorkflow()
                    .nodes?.find(n => n.id === id);
                updates.config = { ...(current?.config ?? {}), ...patch.config };
            }
            canvas().updateNode(id, updates);
        },
    };
};
