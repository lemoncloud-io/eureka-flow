import type { GraphNode } from '../types';

export interface CanvasPoint {
    x: number;
    y: number;
}

export interface NodeSize {
    width: number;
    height: number;
}

export interface CanvasRect extends CanvasPoint {
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

/**
 * The nodes a selection rectangle touches, in graph order.
 *
 * Touching is enough — a node clipped by the box counts, the way every canvas editor
 * behaves. The rectangle is normalized first, so dragging up and to the left selects
 * the same nodes as dragging down and to the right. A zero-size box selects nothing:
 * that is a click, and a click means "deselect".
 */
export const nodesInRect = (nodes: GraphNode[], rect: CanvasRect, sizeOf: (node: GraphNode) => NodeSize): string[] => {
    if (rect.width === 0 || rect.height === 0) return [];

    const left = Math.min(rect.x, rect.x + rect.width);
    const right = Math.max(rect.x, rect.x + rect.width);
    const top = Math.min(rect.y, rect.y + rect.height);
    const bottom = Math.max(rect.y, rect.y + rect.height);

    return nodes
        .filter(node => {
            const { width, height } = sizeOf(node);
            const overlapsX = node.position.x < right && node.position.x + width > left;
            const overlapsY = node.position.y < bottom && node.position.y + height > top;
            return overlapsX && overlapsY;
        })
        .map(node => node.id);
};
