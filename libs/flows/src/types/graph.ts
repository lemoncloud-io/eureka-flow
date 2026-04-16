/** Reagraph-compatible node shape from server. */
export interface ReagraphNode {
    id: string;
    label: string;
    icon?: string;
    /** Node execution state: IDLE | READY | RUNNING | COMPLETED | ERROR */
    state?: string;
}

/** Reagraph-compatible edge shape from server. */
export interface ReagraphEdge {
    source: string;
    target: string;
    id?: string;
    label?: string;
}

/** Reagraph-compatible graph payload from GET /flows/:id/graph. */
export interface ReagraphGraph {
    nodes: ReagraphNode[];
    edges: ReagraphEdge[];
}
