import type { EdgeData, NodeData } from '@lemoncloud/eureka-flows-api';

/** A point on the canvas. */
export interface XY {
    x: number;
    y: number;
}

/**
 * The live canvas graph, normalized to the agent's shape: `nodes` + `edges`. `edges` uses the
 * exported `EdgeData` shape and matches the canvas's own `edges` field (`WorkflowState`). (The
 * app also refers to the same shape as a `Connection` in some places.)
 */
export interface Graph {
    nodes: NodeData[];
    edges: EdgeData[];
}

/**
 * The single seam between (non-React) agent code and the React-owned live canvas.
 * See docs/browser-agent/agents/locator/SPEC.md §6.5 and the desktop implementation in
 * apps/web (`createDesktopCanvasBinding`).
 *
 * The locator agent uses only `readGraph` (to find a node) and `updateNode` (to move
 * it); `swapFlow` exists for the fuller flow-edit agent (spec 0001) and is part of the
 * shared contract.
 */
export interface CanvasBinding {
    /** Live structural read of the current canvas graph. */
    readGraph(): Graph;
    /** Edit one node's label / position, applied immediately (frontend-only). */
    updateNode(id: string, patch: { label?: string; position?: XY }): void;
    /** Replace the whole flow at once (apply a draft). */
    swapFlow(graph: Graph): void;
}
