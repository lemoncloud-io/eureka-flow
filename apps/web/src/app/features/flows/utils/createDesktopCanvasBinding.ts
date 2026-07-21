import type { WorkflowCanvasRef } from '../components/WorkflowCanvas';
import type { CanvasBinding } from '@flows/agent';
import type { NodeData, WorkflowState } from '@lemoncloud/eureka-flows-api';
import type { RefObject } from 'react';

// The CanvasBinding contract (CanvasBinding / Graph / XY) is owned by @flows/agent; app code
// imports those types from @flows/agent directly. See docs/browser-agent/agents/locator SPEC §6.5.

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
            return { nodes: wf.nodes ?? [], edges: wf.edges ?? [] };
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
