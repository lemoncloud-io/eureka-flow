import { translateField } from '@flows/flows';

import type { BlockDefinitionWithFrontend } from '@flows/flows';
import type { NodeData } from '@lemoncloud/eureka-flows-api';
import type { TFunction } from 'i18next';

/**
 * Build a map of nodeId → disambiguated display name.
 * Nodes with custom labels use them directly.
 * Nodes sharing the same block label get a suffix: "텍스트 입력 #1", "텍스트 입력 #2"
 */
export const buildNodeDisplayNames = (
    nodes: NodeData[],
    blockRegistry: Record<string, BlockDefinitionWithFrontend>,
    t: TFunction
): Map<string, string> => {
    const result = new Map<string, string>();

    // Group nodes by their base label (block label or type)
    const labelGroups = new Map<string, string[]>();

    for (const node of nodes) {
        if (node.customLabel) {
            result.set(node.id, node.customLabel);
            continue;
        }

        const def = blockRegistry[node.type];
        const baseLabel = translateField(t, def, 'label') || node.type;
        const group = labelGroups.get(baseLabel) ?? [];
        group.push(node.id);
        labelGroups.set(baseLabel, group);
    }

    // Assign numbered suffixes only when there are duplicates
    for (const [baseLabel, ids] of labelGroups) {
        if (ids.length === 1) {
            result.set(ids[0], baseLabel);
        } else {
            ids.forEach((id, idx) => {
                result.set(id, `${baseLabel} #${idx + 1}`);
            });
        }
    }

    return result;
};
