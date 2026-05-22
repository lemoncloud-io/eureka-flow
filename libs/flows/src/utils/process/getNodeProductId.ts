import type { NodeData } from '@lemoncloud/eureka-flows-api';

const readProductId = (record: NodeData['output'] | NodeData['config'] | NodeData['input']): string | undefined => {
    if (!record) return undefined;
    const value = (record as Record<string, unknown>)['productId'];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
};

/**
 * Extract the codes-goods-api productId associated with a node, if any.
 *
 * Fallback order: output → config → input. A finished run writes productId to
 * output, so that wins when present. If the run is reset and output is cleared,
 * the user-staged config/input still surfaces a productId so the next progress
 * event lands on the right node. Drawback: a stale config.productId may surface
 * after a run completes if the server clears output. Acceptable for v1.
 */
export const getNodeProductId = (node: NodeData | undefined | null): string | undefined => {
    if (!node) return undefined;
    return readProductId(node.output) ?? readProductId(node.config) ?? readProductId(node.input);
};
