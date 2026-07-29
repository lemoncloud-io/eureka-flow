import { createCatalogLookup } from '@flows/agent';

import type { BlockSchema, CatalogLookup, JsonSchema } from '@flows/agent';
import type { BlockDefinitionWithFrontend } from '@flows/flows';
import type { ConfigField, PortDefinition } from '@lemoncloud/eureka-flows-api';

/** Config field control types the orchestrator should validate as numbers. */
const NUMERIC_CONTROL_TYPES = new Set(['number', 'integer', 'float', 'slider', 'range']);

/** Map one block's `configSchema` fields → a JSON-Schema object (enum for selects, number for numerics). */
const toConfigSchema = (block: BlockDefinitionWithFrontend): JsonSchema => {
    const properties: Record<string, JsonSchema> = {};
    for (const field of (block.configSchema ?? []) as ConfigField[]) {
        if (field.options && field.options.length > 0) {
            properties[field.key] = { type: 'string', enum: field.options.map(o => o.value) };
        } else if (NUMERIC_CONTROL_TYPES.has(field.type)) {
            properties[field.key] = { type: 'number' };
        } else {
            properties[field.key] = { type: 'string' };
        }
    }
    return { type: 'object', properties };
};

const toBlockSchema = (block: BlockDefinitionWithFrontend): BlockSchema => ({
    type: block.type,
    label: block.label,
    stereo: block.stereo,
    summary: block.description,
    config: toConfigSchema(block),
    inputs: (block.inputs ?? []).map((port: PortDefinition) => ({ portId: port.id, type: port.type })),
    outputs: (block.outputs ?? []).map((port: PortDefinition) => ({ portId: port.id, type: port.type })),
});

/**
 * Adapt the app's block registry (`blockRegistry`, a `Record<type, BlockDefinitionWithFrontend>`)
 * into the agent's {@link CatalogLookup} — the source behind `catalog_search` / `describe_block` /
 * `describe_node` and config validation. A select field becomes an `enum`; a numeric control becomes
 * a `number` type; everything else is a free string.
 */
export const createBlockCatalogLookup = (registry: Record<string, BlockDefinitionWithFrontend>): CatalogLookup =>
    createCatalogLookup(Object.values(registry).map(toBlockSchema));
