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

/** The four endpoint fields of an edge — `EdgeData` minus its binding-assigned `id`. */
export interface EdgeSpec {
    sourceNodeId: string;
    sourcePortId: string;
    targetNodeId: string;
    targetPortId: string;
}

/**
 * The single seam between (non-React) agent code and the React-owned live canvas.
 *
 * Every write is synchronous, frontend-only, and **mechanical** — the binding applies what it is given and
 * never judges whether an edit is sensible. All validation (a config value, a port's existence/type, a
 * would-be cycle) lives in the tools, so a write that reaches the binding has already been validated.
 */
export interface CanvasBinding {
    /** Live structural read of the current canvas graph. */
    readGraph(): Graph;
    /** Edit one node's label / position / config, applied immediately (frontend-only). */
    updateNode(id: string, patch: NodePatch): void;
    /** Create a node of `type` at `position` seeded with the block's default config; returns the new id. */
    addNode(type: string, position: XY): { id: string };
    /** Remove a node and cascade every edge that touches it. */
    deleteNode(id: string): void;
    /** Add one edge; if its target input port is already occupied, that edge is replaced. Returns the new id. */
    addEdge(spec: EdgeSpec): { id: string };
    /** Remove one edge by id. */
    deleteEdge(id: string): void;
}
