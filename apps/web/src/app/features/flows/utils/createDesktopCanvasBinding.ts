import { useCanvasStore } from '@flows/flows';

import type { WorkflowCanvasRef } from '../components/WorkflowCanvas';
import type { CanvasBinding } from '@flows/agent';
import type { NodeData } from '@lemoncloud/eureka-flows-api';
import type { RefObject } from 'react';

/**
 * Desktop {@link CanvasBinding} over the store-sourced canvas: reads node state from `useCanvasStore`
 * and writes through the `WorkflowCanvas` ref (which checkpoints for undo).
 */
export const createDesktopCanvasBinding = (ref: RefObject<WorkflowCanvasRef | null>): CanvasBinding => {
    const canvas = (): WorkflowCanvasRef => {
        if (!ref.current) {
            throw new Error('CanvasBinding: canvas is not mounted');
        }
        return ref.current;
    };

    return {
        // Read the live store so a write is visible to the next read within a turn (getWorkflow lags).
        readGraph: () => {
            const { nodes, connections } = useCanvasStore.getState();
            return { nodes: nodes ?? [], edges: connections ?? [] };
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
                // Merge base from the live store (same source as readGraph) so a prior same-turn config
                // write is honored; getWorkflow lags and would drop keys written earlier in the turn.
                const current = useCanvasStore.getState().nodes?.find(n => n.id === id);
                updates.config = { ...(current?.config ?? {}), ...patch.config };
            }
            canvas().updateNode(id, updates);
        },
    };
};
