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
    };
};
