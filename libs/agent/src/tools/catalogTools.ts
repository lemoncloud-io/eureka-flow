import { toolErr as err, toolOk as ok, toolUnknown } from './types';

import type { CatalogLookup } from '../catalog';
import type { ToolCall, ToolProvider, ToolResult } from './types';
import type { ToolDef } from '../llm/llmGateway';

/** Tools over the block catalog (block *types*, not canvas nodes): `catalog_search` returns a compact shortlist, `describe_block` returns one type's full schema. Never dumps the catalog. */

const CATALOG_SEARCH_DEF: ToolDef = {
    name: 'catalog_search',
    description:
        'Search the block catalog for types matching a query. Returns a compact shortlist ' +
        '(type, label, one-line summary) — never the full schema. Use describe_block for detail.',
    parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'What to look for, e.g. "text input" or "delay".' } },
        required: ['query'],
    },
};

const DESCRIBE_BLOCK_DEF: ToolDef = {
    name: 'describe_block',
    description:
        'Describe one block type in detail: its full schema — required config fields and a select ' +
        "field's allowed values. Use it to learn the valid options before choosing a config value.",
    parameters: {
        type: 'object',
        properties: { type: { type: 'string', description: 'The block type, e.g. "single-output-generator".' } },
        required: ['type'],
    },
};

/** CATALOG provider: `catalog_search` (compact) + `describe_block` (detail). Never dumps the catalog. */
export const createCatalogToolProvider = (catalog: CatalogLookup): ToolProvider => ({
    listTools: () => [CATALOG_SEARCH_DEF, DESCRIBE_BLOCK_DEF],
    dispatch: (call: ToolCall): ToolResult => {
        if (call.name === 'catalog_search') {
            const { query } = call.args as { query: string };
            return ok(call, { hits: catalog.search(query) });
        }
        if (call.name === 'describe_block') {
            const { type } = call.args as { type: string };
            const schema = catalog.schema(type);
            if (!schema) {
                return err(call, `unknown block type "${type}"`);
            }
            return ok(call, { schema });
        }
        return toolUnknown(call);
    },
});
