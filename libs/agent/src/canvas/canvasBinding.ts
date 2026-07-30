import type { Position, WorkflowState } from '@lemoncloud/eureka-flows-api';

/** A point on the canvas. */
export type XY = Position;

/** A partial edit to one node: `config` merges over existing config, `label` falsy clears a custom label, `position` replaces whole. */
export interface NodePatch {
    label?: string;
    position?: XY;
    config?: Record<string, string>;
}

/** The live canvas graph: the canonical `WorkflowState` (`{ nodes, edges }`), aliased to track that shape. */
export type Graph = WorkflowState;

/** The single seam between agent code and the graph on screen: `createEngineCanvasBinding` over the owning `FlowEngine`, or `createInMemoryCanvasBinding` for tests and Node runs. Nothing here is React-aware. */
export interface CanvasBinding {
    /** Live structural read of the current canvas graph. */
    readGraph(): Graph;
    /** Edit one node's label / position / config, applied immediately (frontend-only). */
    updateNode(id: string, patch: NodePatch): void;
}
