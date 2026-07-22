import { fieldKey, translateField } from './i18nServerKey';

import type { BlockDefinitionWithFrontend } from '../types';
import type { NodeData } from '@lemoncloud/eureka-flows-api';
import type { TFunction } from 'i18next';

/**
 * Resolve a node's display name with the standard precedence:
 * user `customLabel` (never translated) → translated block label → fallback (defaults to node type).
 * Centralizes the "customLabel wins" invariant used across editor surfaces.
 */
export const resolveNodeName = (
    node: Pick<NodeData, 'customLabel' | 'type'> | undefined,
    def: BlockDefinitionWithFrontend | undefined,
    t: TFunction,
    fallback: string | undefined = node?.type
): string => node?.customLabel || translateField(t, def, 'label') || fallback || '';

/**
 * Match a block against a search query, testing the translated text, the original text,
 * the language key and the type — so search works in any language, before or after the
 * server keys a block, and against the key itself.
 */
export const blockMatchesQuery = (
    t: TFunction,
    block: Pick<BlockDefinitionWithFrontend, 'label' | 'description' | 'type'>,
    query: string
): boolean =>
    [
        translateField(t, block, 'label'),
        translateField(t, block, 'description'),
        block.label,
        block.description,
        fieldKey(block, 'label'),
        fieldKey(block, 'description'),
        block.type,
    ].some(value => value?.toLowerCase().includes(query));

/**
 * Find block definition by config keys when node.type doesn't match registry
 * This handles cases where server saves node ID instead of block type
 */
export const findBlockByConfigKeys = (
    config: Record<string, unknown>,
    registry: Record<string, BlockDefinitionWithFrontend>
): string | null => {
    const configKeys = Object.keys(config);
    if (configKeys.length === 0) return null;

    // Score each block by matching config keys
    let bestMatch: { type: string; score: number } | null = null;

    for (const [type, block] of Object.entries(registry)) {
        if (!block.defaultConfig && !block.configSchema) continue;

        const blockKeys = new Set([
            ...Object.keys(block.defaultConfig || {}),
            ...(block.configSchema?.map(f => f.key) || []),
        ]);

        // Count matching keys
        const matchingKeys = configKeys.filter(k => blockKeys.has(k)).length;
        if (matchingKeys > 0) {
            const score = matchingKeys / Math.max(configKeys.length, blockKeys.size);
            // Early termination on perfect match
            if (score === 1) return type;
            if (!bestMatch || score > bestMatch.score) {
                bestMatch = { type, score };
            }
        }
    }

    return bestMatch && bestMatch.score >= 0.5 ? bestMatch.type : null;
};

/**
 * Get block definition for a node with fallback logic
 * Tries direct lookup first, then falls back to config-based matching
 *
 * @param node - Node data to find definition for
 * @param registry - Block registry to search in
 * @returns Block definition or null if not found
 */
export const getBlockDefinition = (
    node: Pick<NodeData, 'type' | 'config'>,
    registry: Record<string, BlockDefinitionWithFrontend>
): BlockDefinitionWithFrontend | null => {
    // Try direct lookup first
    if (registry[node.type]) {
        return registry[node.type];
    }

    // Fallback: try to infer from config keys
    if (node.config) {
        const inferredType = findBlockByConfigKeys(node.config, registry);
        if (inferredType && registry[inferredType]) {
            return registry[inferredType];
        }
    }

    return null;
};
