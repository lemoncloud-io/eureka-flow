import { getNodeHeight } from './nodeHeight';

import type { BlockDefinitionWithFrontend } from '../types';
import type { NodeData } from '@lemoncloud/eureka-flows-api';

/**
 * Strip a single node down to the fields required by the save API.
 *
 * Pure function — no store access, no side effects.
 *
 * Rules:
 * 1. type → blockDef.type (processType), blockId → node.blockId ?? node.type
 * 2. Runtime fields (status, inputData, outputData, …) are dropped
 * 3. width / height included only when present
 * 4. customLabel / description included only when non-empty
 */
export const transformNodeForSave = (
    node: NodeData,
    blockRegistry: Record<string, BlockDefinitionWithFrontend>
): NodeData => {
    const blockDef = blockRegistry[node.type];
    const height = getNodeHeight(node);

    const slim: Partial<NodeData> = {
        id: node.id,
        type: blockDef?.type ?? node.type,
        blockId: node.blockId ?? node.type,
        position: node.position,
    };

    if (node.width) slim.width = node.width;
    if (height) slim.height = height;
    if (node.customLabel) slim.customLabel = node.customLabel;
    if (node.description) slim.description = node.description;

    return slim as NodeData;
};

/**
 * Transform an array of nodes for the save API.
 */
export const transformNodesForSave = (
    nodes: NodeData[],
    blockRegistry: Record<string, BlockDefinitionWithFrontend>
): NodeData[] => nodes.map(node => transformNodeForSave(node, blockRegistry));
