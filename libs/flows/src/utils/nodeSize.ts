import type { NodeData } from '@lemoncloud/eureka-flows-api';

/** Default node width */
export const DEFAULT_NODE_WIDTH = 260;

/** Default minimum node height (auto height when not set) */
export const DEFAULT_NODE_MIN_HEIGHT = 80;

/** Node width bounds */
export const NODE_WIDTH_BOUNDS = {
    MIN: 200,
    MAX: 800,
} as const;

/** Node height bounds (for resizable nodes) */
export const NODE_HEIGHT_BOUNDS = {
    MIN: 80,
    MAX: 600,
} as const;

/**
 * Get node width with fallback to default
 *
 * @param node - Node data to get width from
 * @param fallback - Optional fallback value (defaults to DEFAULT_NODE_WIDTH)
 * @returns Width value
 */
export const getNodeWidth = (node: Pick<NodeData, 'width'>, fallback: number = DEFAULT_NODE_WIDTH): number => {
    if (node.width != null && node.width > 0) return node.width;
    return fallback;
};

/**
 * Clamp width value within valid bounds
 *
 * @param width - Width value to clamp
 * @returns Clamped width value
 */
export const clampWidth = (width: number): number => {
    return Math.max(NODE_WIDTH_BOUNDS.MIN, Math.min(NODE_WIDTH_BOUNDS.MAX, width));
};

/**
 * Clamp node height value within valid bounds
 * Different from textarea height bounds - this is for the entire node
 *
 * @param height - Height value to clamp
 * @returns Clamped height value
 */
export const clampNodeHeight = (height: number): number => {
    return Math.max(NODE_HEIGHT_BOUNDS.MIN, Math.min(NODE_HEIGHT_BOUNDS.MAX, height));
};
