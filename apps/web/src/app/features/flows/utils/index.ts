import type { Connection, NodeData, PortDefinition } from '@lemoncloud/eureka-flows-api';
import type { Dispatch, SetStateAction } from 'react';

// ============================================================
// Port Visibility Utilities
// ============================================================

/**
 * Information about the connection being dragged
 */
export interface ConnectionDraftInfo {
    sourceNodeId: string;
    sourcePortId: string;
    sourceType: string;
}

/**
 * Check if two port types are compatible for connection.
 * Handles undefined target type by treating it as 'any'.
 */
export const arePortTypesCompatible = (sourceType: string, targetType: string | undefined): boolean => {
    const normalizedTarget = targetType ?? 'any';
    if (sourceType === 'any' || normalizedTarget === 'any') return true;
    return sourceType.toLowerCase() === normalizedTarget.toLowerCase();
};

/**
 * Filter ports based on visibility rules:
 * 1. First port is always visible
 * 2. Connected ports are always visible
 * 3. During connection drag: show compatible input ports on target nodes
 *
 * @param allPorts - All port definitions
 * @param connectedPortIds - IDs of ports that have connections
 * @param connectionDraft - Active connection being dragged (null if not dragging)
 * @param nodeId - Current node's ID
 * @param portType - 'input' or 'output'
 * @returns Filtered array of visible ports
 */
export const getVisiblePorts = (
    allPorts: PortDefinition[],
    connectedPortIds: string[],
    connectionDraft: ConnectionDraftInfo | null,
    nodeId: string,
    portType: 'input' | 'output'
): PortDefinition[] => {
    if (allPorts.length === 0) return [];

    const visible = new Set<string>();

    // 1. First port is always visible
    visible.add(allPorts[0].id);

    // 2. Connected ports are always visible
    connectedPortIds.forEach(id => {
        if (allPorts.some(p => p.id === id)) {
            visible.add(id);
        }
    });

    // 3. During connection drag: show compatible input ports on OTHER nodes
    // Note: Output ports don't expand during drag (they are the source)
    if (connectionDraft && portType === 'input' && connectionDraft.sourceNodeId !== nodeId) {
        allPorts.forEach(port => {
            if (arePortTypesCompatible(connectionDraft.sourceType, port.type)) {
                visible.add(port.id);
            }
        });
    }

    // Preserve original order
    return allPorts.filter(p => visible.has(p.id));
};

// ============================================================
// Connection Utilities
// ============================================================

export const getConnectionKey = (conn: Connection): string =>
    `${conn.sourceNodeId}:${conn.sourcePortId}→${conn.targetNodeId}:${conn.targetPortId}`;

export const deduplicateEdges = (edges: Connection[]): Connection[] => {
    const edgeMap = new Map<string, Connection>();
    const seenIds = new Set<string>();

    edges.forEach(edge => {
        // Skip if we've already seen this ID (prevents duplicate key errors in React)
        if (edge.id && seenIds.has(edge.id)) {
            return;
        }

        const key = getConnectionKey(edge);
        const existing = edgeMap.get(key);

        if (!existing) {
            edgeMap.set(key, edge);
            if (edge.id) seenIds.add(edge.id);
        } else {
            const existingIsTemp = isTempId(existing.id);
            const newIsTemp = isTempId(edge.id);

            if (existingIsTemp && !newIsTemp) {
                // Remove the old temp ID from seenIds before replacing
                if (existing.id) seenIds.delete(existing.id);
                edgeMap.set(key, edge);
                if (edge.id) seenIds.add(edge.id);
            }
        }
    });

    return Array.from(edgeMap.values());
};

/**
 * Generate a unique ID
 * @deprecated Use generateTempId for new node/edge creation (server assigns final ID)
 */
export const generateId = (): string => Math.random().toString(36).slice(2, 11);

export const TEMP_ID_PREFIXES = ['temp_', 'edge_', 'node_'] as const;
export const TEMP_ID_PREFIX = 'temp_';

export const generateTempId = (prefix: 'temp' | 'edge' | 'node' = 'temp'): string =>
    `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

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
 * Check if a connection between two ports is valid.
 * Uses arePortTypesCompatible for consistent case-insensitive type matching.
 *
 * @deprecated sourceIdx/targetIdx are unused - kept for backward compatibility.
 * Consider using arePortTypesCompatible directly for new code.
 */
export const isValidConnection = (
    sourceNode: NodeData,
    _sourceIdx: number,
    targetNode: NodeData,
    _targetIdx: number,
    sourceType: string,
    targetType: string
): boolean => {
    if (sourceNode.id === targetNode.id) return false;
    return arePortTypesCompatible(sourceType, targetType);
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
