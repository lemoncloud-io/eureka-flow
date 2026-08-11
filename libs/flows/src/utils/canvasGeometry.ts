import type { GraphNode } from '../types';

export interface CanvasPoint {
    x: number;
    y: number;
}

export interface NodeSize {
    width: number;
    height: number;
}

/**
 * Which node covers this world-space point, if any.
 *
 * Sizing is the caller's: the canvas measures a node from its definition and run state,
 * and this stays a plain geometry check. Later nodes win an overlap, matching the paint
 * order — the node the user sees on top is the one they think they hit.
 */
export const findNodeAtPoint = (
    nodes: GraphNode[],
    point: CanvasPoint,
    sizeOf: (node: GraphNode) => NodeSize
): GraphNode | undefined => {
    for (let i = nodes.length - 1; i >= 0; i -= 1) {
        const node = nodes[i];
        const { width, height } = sizeOf(node);
        const insideX = point.x >= node.position.x && point.x < node.position.x + width;
        const insideY = point.y >= node.position.y && point.y < node.position.y + height;
        if (insideX && insideY) return node;
    }
    return undefined;
};
