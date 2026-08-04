import { toolOk as ok, toolUnknown } from './types';

import type { CatalogLookup } from '../catalog';
import type { ToolCall, ToolProvider, ToolResult } from './types';
import type { ToolDef } from '../llm/llmGateway';

/** The one tool over the block catalog (block *types*, not canvas nodes): `catalog_search` returns each matching type's FULL schema — ports and config fields included. Never dumps the whole catalog. */

const CATALOG_SEARCH_DEF: ToolDef = {
    name: 'catalog_search',
    description:
        'Search the block catalog for the types matching a query. Each match comes back as its FULL schema — the ' +
        'type and label, its PORTS (input/output port ids, for wiring), and its config fields (with a select ' +
        'field’s allowed values). This is the one place to look a block type up: search it ONCE and reuse the ' +
        'ports and fields across every node of that type — no separate describe step. To inspect a node already ' +
        'on the canvas (its current config/ports), use describe_node instead.',
    parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'What to look for, e.g. "text input" or "delay".' } },
        required: ['query'],
    },
};

/** CATALOG provider: the single `catalog_search` tool — matching block types come back as full schemas (ports + fields). Never dumps the catalog. */
export const createCatalogToolProvider = (catalog: CatalogLookup): ToolProvider => ({
    listTools: () => [CATALOG_SEARCH_DEF],
    dispatch: (call: ToolCall): ToolResult => {
        if (call.name === 'catalog_search') {
            const { query } = call.args as { query: string };
            return ok(call, { hits: catalog.search(query) });
        }
        return toolUnknown(call);
    },
});
