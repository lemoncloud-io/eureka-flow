import type { NodeData } from '@lemoncloud/eureka-flows-api';

/**
 * Generate a unique ID
 */
export const generateId = (): string => Math.random().toString(36).slice(2, 11);

/**
 * Calculate bezier curve path for connection lines
 */
export const getBezierPath = (x1: number, y1: number, x2: number, y2: number): string => {
    const dist = Math.abs(x2 - x1);
    const cp1x = x1 + dist * 0.5;
    const cp1y = y1;
    const cp2x = x2 - dist * 0.5;
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
