import type { NodeData } from '@lemoncloud/eureka-flows-api';

/** Default textarea height for input-text nodes */
export const DEFAULT_TEXTAREA_HEIGHT = 80;

/** Minimum and maximum textarea height bounds */
export const TEXTAREA_HEIGHT_BOUNDS = {
    MIN: 60,
    MAX: 1024,
} as const;

/**
 * Get node height with backward compatibility for legacy config.textareaHeight
 *
 * Migration: height property (new) takes precedence over config.textareaHeight (legacy)
 *
 * @param node - Node data to get height from
 * @param fallback - Optional fallback value if no height is found
 * @returns Height value or undefined
 */
export const getNodeHeight = (node: Pick<NodeData, 'height' | 'config'>, fallback?: number): number | undefined => {
    if (node.height != null) return node.height;
    const legacy = Number(node.config?.textareaHeight);
    if (legacy > 0) return legacy;
    return fallback;
};

/**
 * Clamp height value within valid bounds
 *
 * @param height - Height value to clamp
 * @returns Clamped height value
 */
export const clampHeight = (height: number): number => {
    return Math.max(TEXTAREA_HEIGHT_BOUNDS.MIN, Math.min(TEXTAREA_HEIGHT_BOUNDS.MAX, height));
};
