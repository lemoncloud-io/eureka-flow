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
 * The rectangle spanned by two corners, whichever way round they were dragged.
 * Idempotent, so a rect that is already normalized survives a second pass unchanged.
 */
export const normalizeRect = (rect: CanvasRect): CanvasRect => ({
    x: Math.min(rect.x, rect.x + rect.width),
    y: Math.min(rect.y, rect.y + rect.height),
    width: Math.abs(rect.width),
    height: Math.abs(rect.height),
});

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

    const { x: left, y: top, width, height } = normalizeRect(rect);
    const right = left + width;
    const bottom = top + height;

    return nodes
        .filter(node => {
            const { width, height } = sizeOf(node);
            const overlapsX = node.position.x < right && node.position.x + width > left;
            const overlapsY = node.position.y < bottom && node.position.y + height > top;
            return overlapsX && overlapsY;
        })
        .map(node => node.id);
};

/**
 * How far to shift a copied group so its top-left corner lands on `target`.
 *
 * One offset for the whole group, so the copy keeps the shape the user arranged. An
 * empty payload shifts by nothing — there is no corner to line up.
 */
export const pasteOffsetTo = (copied: { position: CanvasPoint }[], target: CanvasPoint): CanvasPoint => {
    if (copied.length === 0) return { x: 0, y: 0 };

    const minX = Math.min(...copied.map(n => n.position.x));
    const minY = Math.min(...copied.map(n => n.position.y));
    return { x: target.x - minX, y: target.y - minY };
};
