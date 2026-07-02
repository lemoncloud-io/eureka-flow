import { isUnresolvedTempId, resolveTempId } from './tempId';

interface SavableNode {
    id?: string;
}

interface SavableEdge {
    id?: string;
    sourceNodeId: string;
    targetNodeId: string;
}

/**
 * Prepare nodes/edges for POST /flows/:id/save.
 *
 * Save replaces the flow's entire node list, so a session temp ID that slips in
 * is persisted as a canonical server ID and corrupts the flow. Two safeguards:
 * 1. Drop nodes/edges whose create round-trip has not finished (they are saved
 *    by the next autosave once the server assigns their ID).
 * 2. Map already-resolved temp IDs to their server IDs, covering the window
 *    between resolution and the UI state replacement.
 */
export const excludeUnresolvedFromSave = <N extends SavableNode, E extends SavableEdge>(
    nodes: N[],
    edges: E[]
): { nodes: N[]; edges: E[] } => {
    const savableNodes = nodes
        .filter(n => !isUnresolvedTempId(n.id))
        .map(n => (n.id ? { ...n, id: resolveTempId(n.id) } : n));

    const savableEdges = edges
        .filter(
            e => !isUnresolvedTempId(e.id) && !isUnresolvedTempId(e.sourceNodeId) && !isUnresolvedTempId(e.targetNodeId)
        )
        .map(e => ({
            ...e,
            id: e.id ? resolveTempId(e.id) : e.id,
            sourceNodeId: resolveTempId(e.sourceNodeId),
            targetNodeId: resolveTempId(e.targetNodeId),
        }));

    return { nodes: savableNodes, edges: savableEdges };
};
