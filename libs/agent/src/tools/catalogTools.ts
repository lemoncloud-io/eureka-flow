import { toolOk as ok } from './types';

import type { CanvasTool } from './toolset';
import type { ToolCall, ToolResult } from './types';
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

/** The single catalog tool — matching block types come back as full schemas (ports + fields). Never dumps the catalog. */
export const CATALOG_SEARCH: CanvasTool = {
    def: CATALOG_SEARCH_DEF,
    build:
        ({ catalog }) =>
        (call: ToolCall): ToolResult =>
            ok(call, { hits: catalog.search((call.args as { query: string }).query) }),
};

/** Every catalog tool (just `catalog_search`) — the bundle for callers that want the whole catalog surface. */
export const CATALOG_TOOLS: CanvasTool[] = [CATALOG_SEARCH];
