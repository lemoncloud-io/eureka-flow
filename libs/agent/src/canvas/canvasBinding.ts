import type { Position, WorkflowState } from '@lemoncloud/eureka-flows-api';

/** A point on the canvas. */
export type XY = Position;

/** A partial edit to one node: `config` merges over existing config, `label` falsy clears a custom label, `position` replaces whole. */
export interface NodePatch {
    label?: string;
    position?: XY;
    config?: Record<string, string>;
}

/** The live canvas graph: the canvas's own `WorkflowState` (`{ nodes, edges }`), aliased to track the canonical shape. */
export type Graph = WorkflowState;

/** The single seam between (non-React) agent code and the React-owned live canvas. */
export interface CanvasBinding {
    /** Live structural read of the current canvas graph. */
    readGraph(): Graph;
    /** Edit one node's label / position / config, applied immediately (frontend-only). */
    updateNode(id: string, patch: NodePatch): void;
}
