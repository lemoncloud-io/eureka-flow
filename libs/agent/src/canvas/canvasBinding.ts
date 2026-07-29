import type { Position, WorkflowState } from '@lemoncloud/eureka-flows-api';

/** A point on the canvas. */
export type XY = Position;

/** The live canvas graph: `nodes` + `edges`, matching the canvas's own `WorkflowState`. */
export type Graph = WorkflowState;

/**
 * The single seam between (non-React) agent code and the React-owned live canvas.
 * The locator agent uses `readGraph` (to find a node) and `updateNode` (to move it).
 */
export interface CanvasBinding {
    /** Live structural read of the current canvas graph. */
    readGraph(): Graph;
    /** Edit one node's label / position, applied immediately (frontend-only). */
    updateNode(id: string, patch: { label?: string; position?: XY }): void;
}
