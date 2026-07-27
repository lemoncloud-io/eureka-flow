import type { EdgeData, NodeData } from '@lemoncloud/eureka-flows-api';

/** Valid port style keys matching CSS variables (--port-type-*) */
export type PortStyleKey = 'text' | 'image' | 'number' | 'json' | 'any';

const PORT_STYLE_KEYS: Record<string, PortStyleKey> = {
    text: 'text',
    string: 'text',
    image: 'image',
    number: 'number',
    json: 'json',
    any: 'any',
};

/** Normalize port type string to a valid style key (e.g., 'string' → 'text') */
export const getPortStyleKey = (portType: string): PortStyleKey => PORT_STYLE_KEYS[portType.toLowerCase()] ?? 'any';

/**
 * Check if two port types are compatible for connection.
 * Handles undefined target type by treating it as 'any'.
 */
export const arePortTypesCompatible = (sourceType: string, targetType: string | undefined): boolean => {
    const normalizedTarget = targetType ?? 'any';
    if (sourceType === 'any' || normalizedTarget === 'any') return true;
    return sourceType.toLowerCase() === normalizedTarget.toLowerCase();
};

export const getConnectionKey = (conn: EdgeData): string =>
    `${conn.sourceNodeId}:${conn.sourcePortId}→${conn.targetNodeId}:${conn.targetPortId}`;

/**
 * Collapse edges that describe the same connection, keeping the first.
 *
 * Nothing creates duplicates any more — an edge gets one client-generated ID and keeps
 * it — but flows saved before that can carry two edges for one connection, so loaded
 * data still needs this.
 */
export const deduplicateEdges = (edges: EdgeData[]): EdgeData[] => {
    const edgeMap = new Map<string, EdgeData>();
    const seenIds = new Set<string>();

    edges.forEach(edge => {
        // Skip if we've already seen this ID (prevents duplicate key errors in React)
        if (edge.id && seenIds.has(edge.id)) {
            return;
        }

        const key = getConnectionKey(edge);
        if (edgeMap.has(key)) {
            return;
        }

        edgeMap.set(key, edge);
        if (edge.id) seenIds.add(edge.id);
    });

    return Array.from(edgeMap.values());
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
