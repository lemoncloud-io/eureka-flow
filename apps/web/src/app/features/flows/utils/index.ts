import type { Connection, NodeData } from '@lemoncloud/eureka-flows-api';
import type { Dispatch, SetStateAction } from 'react';

/**
 * Generate a unique key for a connection based on its source and target
 * Used for deduplication (same connection may have different IDs due to race conditions)
 *
 * Format: sourceNodeId:sourcePortId→targetNodeId:targetPortId
 */
export const getConnectionKey = (conn: Connection): string =>
    `${conn.sourceNodeId}:${conn.sourcePortId}→${conn.targetNodeId}:${conn.targetPortId}`;

/**
 * Deduplicate edges by connection key (source/target combination)
 * When duplicates exist, prefer the edge with a server-assigned ID (non-temp ID)
 *
 * This handles the race condition where:
 * 1. createEdgeAsync creates edge with temp ID, then gets server ID
 * 2. saveCurrentFlow sends same edge (with temp or server ID)
 * 3. Server creates two edges with different IDs for same connection
 *
 * @param edges - Array of connections/edges to deduplicate
 * @returns Deduplicated array, preferring server-assigned IDs over temp IDs
 */
export const deduplicateEdges = (edges: Connection[]): Connection[] => {
    const edgeMap = new Map<string, Connection>();

    edges.forEach(edge => {
        const key = getConnectionKey(edge);
        const existing = edgeMap.get(key);

        if (!existing) {
            // First edge with this connection key
            edgeMap.set(key, edge);
        } else {
            // Duplicate found - prefer server ID over temp ID
            const existingIsTemp = isTempId(existing.id);
            const newIsTemp = isTempId(edge.id);

            if (existingIsTemp && !newIsTemp) {
                // New edge has server ID, prefer it
                edgeMap.set(key, edge);
            }
            // Otherwise keep existing (either both have server IDs or existing has server ID)
        }
    });

    return Array.from(edgeMap.values());
};

/**
 * Generate a unique ID
 * @deprecated Use generateTempId for new node/edge creation (server assigns final ID)
 */
export const generateId = (): string => Math.random().toString(36).slice(2, 11);

/**
 * Prefixes for temporary IDs (before server assigns real ID)
 * - temp_: generic temporary ID
 * - edge_: temporary edge ID
 * - node_: temporary node ID
 */
export const TEMP_ID_PREFIXES = ['temp_', 'edge_', 'node_'] as const;

/** @deprecated Use TEMP_ID_PREFIXES instead */
export const TEMP_ID_PREFIX = 'temp_';

/**
 * Generate a temporary ID for optimistic UI updates
 * Server will assign the real ID via POST /nodes/0/upsert
 *
 * Format: {prefix}_{timestamp}_{random}
 * Example: edge_1707658800000_abc12
 *
 * @param prefix - Type prefix ('temp', 'edge', 'node')
 */
export const generateTempId = (prefix: 'temp' | 'edge' | 'node' = 'temp'): string =>
    `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

/**
 * Check if an ID is a temporary ID (not yet assigned by server)
 * Recognizes all temp prefixes: temp_, edge_, node_
 */
export const isTempId = (id: string | undefined): boolean => {
    if (!id) return false;
    return TEMP_ID_PREFIXES.some(prefix => id.startsWith(prefix));
};

/**
 * Calculate bezier curve path for connection lines
 * Creates smooth, natural-looking curves similar to Sequencer.media
 */
export const getBezierPath = (x1: number, y1: number, x2: number, y2: number): string => {
    const dx = x2 - x1;
    const absDx = Math.abs(dx);

    // For backwards connections (when target is to the left of source)
    if (dx < 0) {
        // Create a looping curve that goes around
        const loopOffset = Math.max(60, absDx * 0.3 + 30);
        const cp1x = x1 + loopOffset;
        const cp1y = y1;
        const cp2x = x2 - loopOffset;
        const cp2y = y2;
        return `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;
    }

    // Normal forward connection - smooth horizontal bezier
    // Control points extend horizontally from each endpoint
    // This creates natural S-curves that flow smoothly between nodes
    const curvature = Math.min(absDx * 0.5, 100);
    const cp1x = x1 + curvature;
    const cp1y = y1;
    const cp2x = x2 - curvature;
    const cp2y = y2;

    return `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;
};

/**
 * Check if a connection between two ports is valid
 */
export const isValidConnection = (
    sourceNode: NodeData,
    sourceIdx: number,
    targetNode: NodeData,
    targetIdx: number,
    sourceType: string,
    targetType: string
): boolean => {
    if (sourceNode.id === targetNode.id) return false;
    if (targetType === 'any') return true;
    if (sourceType === 'any') return true;
    return sourceType === targetType;
};

/**
 * Replace a temporary node ID with server-assigned ID in all state
 * Used after server assigns real ID to a node created with temp ID
 *
 * @param oldTempId - Temporary ID to replace
 * @param newServerId - Server-assigned ID
 * @param setNodes - React state setter for nodes
 * @param setConnections - React state setter for connections
 * @param setSelectedNodeIds - React state setter for selected node IDs
 */
export const replaceNodeIdInState = (
    oldTempId: string,
    newServerId: string,
    setNodes: Dispatch<SetStateAction<NodeData[]>>,
    setConnections: Dispatch<SetStateAction<Connection[]>>,
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>
): void => {
    // Replace temp node ID with server ID in nodes array
    setNodes(prev => prev.map(n => (n.id === oldTempId ? { ...n, id: newServerId } : n)));

    // Replace temp node ID in connections (sourceNodeId or targetNodeId)
    setConnections(prev =>
        prev.map(c => ({
            ...c,
            sourceNodeId: c.sourceNodeId === oldTempId ? newServerId : c.sourceNodeId,
            targetNodeId: c.targetNodeId === oldTempId ? newServerId : c.targetNodeId,
        }))
    );

    // Update selection if the temp ID was selected
    setSelectedNodeIds(prev => {
        if (prev.has(oldTempId)) {
            const next = new Set(prev);
            next.delete(oldTempId);
            next.add(newServerId);
            return next;
        }
        return prev;
    });
};

export { wouldCreateCycle } from './graph';
