import type { Connection, NodeData } from '@lemoncloud/eureka-flows-api';
import type { Dispatch, SetStateAction } from 'react';

/**
 * Generate a unique ID
 * @deprecated Use generateTempId for new node/edge creation (server assigns final ID)
 */
export const generateId = (): string => Math.random().toString(36).slice(2, 11);

/**
 * Prefix for temporary IDs (before server assigns real ID)
 */
export const TEMP_ID_PREFIX = 'temp_';

/**
 * Generate a temporary ID for optimistic UI updates
 * Server will assign the real ID via POST /nodes/0/upsert
 *
 * Format: temp_{timestamp}_{random}
 * Example: temp_1707658800000_abc12
 *
 * @param prefix - Optional prefix type (default: 'temp')
 */
export const generateTempId = (prefix = 'temp'): string =>
    `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

/**
 * Check if an ID is a temporary ID (not yet assigned by server)
 */
export const isTempId = (id: string | undefined): boolean => {
    if (!id) return false;
    return id.startsWith(TEMP_ID_PREFIX);
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
