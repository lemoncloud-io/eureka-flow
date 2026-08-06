import { toolErr as err, toolOk as ok, toolUnknown } from './types';
import { applyMove, hasExactlyOneTarget } from '../canvas/moveSemantics';

import type { ToolCall, ToolProvider, ToolResult } from './types';
import type { CanvasBinding, Graph, XY } from '../canvas/canvasBinding';
import type { MoveNodeArgs } from '../canvas/moveSemantics';
import type { BlockSchema, CatalogLookup } from '../catalog';
import type { JsonSchema, ToolDef } from '../llm/llmGateway';

/**
 * The node tool domain — everything an agent does to canvas nodes, split by operation so agents
 * take only what they need:
 *   • `createNodeReadToolProvider`      — `list_nodes` + `describe_node`   (read: all nodes)
 *   • `createNodeSearchToolProvider`    — `search_nodes` + `describe_node` (read: optionally type-scoped)
 *   • `createNodeMoveToolProvider`      — `move_node`                      (write: position)
 *   • `createNodeConfigToolProvider`    — `set_properties` + `rename`      (write: config/label)
 *   • `createNodeStructureToolProvider` — `add_node` + `delete_node`       (write: add/delete node)
 * Also owns the node projection (`listNodeLocations`), the per-turn context block (`renderNodeContext`),
 * and the shared `requireNode` lookup (reused by the edge tool).
 */

// ── Projection + per-turn context ────────────────────────────────────────────────────────────────

/** A node trimmed to what the model reasons over: id, type, optional label, position. */
export interface NodeLocation {
    id: string;
    type: string;
    /** `customLabel` if set, else undefined; v0 matches on `type`, not resolved default labels. */
    label?: string;
    position: XY;
}

/** Project the live canvas graph to the trimmed node list the model reasons over. */
export const listNodeLocations = (binding: CanvasBinding): NodeLocation[] => {
    const { nodes } = binding.readGraph();
    const locations: NodeLocation[] = [];
    for (const node of nodes) {
        if (!node.id) {
            // A live canvas node always has an id; skip malformed/placeholder nodes.
            continue;
        }
        locations.push({
            id: node.id,
            type: node.type,
            label: node.customLabel,
            position: { x: node.position.x, y: node.position.y },
        });
    }
    return locations;
};

/** The trimmed node list filtered to ONE block type — what a type-scoped block agent sees (via `search_nodes`). */
export const listNodeLocationsOfType = (binding: CanvasBinding, type: string): NodeLocation[] =>
    listNodeLocations(binding).filter(n => n.type === type);

/** Headings for {@link renderNodeContext} — lets one renderer serve every agent's context block. */
export interface NodeContextHeadings {
    /** Heading printed above a non-empty node list. */
    heading?: string;
    /** Whole message when there are no nodes. */
    empty?: string;
}

/** Render the node list as the compact per-turn context block (one line per node: id · type · label · position). Pass `nodes` to render a pre-filtered list (e.g. a block agent's own type). */
export const renderNodeContext = (
    binding: CanvasBinding,
    headings: NodeContextHeadings = {},
    nodes: NodeLocation[] = listNodeLocations(binding)
): string => {
    const heading = headings.heading ?? 'Current nodes on the canvas:';
    const empty = headings.empty ?? 'Current canvas: (no nodes).';
    if (nodes.length === 0) {
        return empty;
    }
    const lines = nodes.map(
        n =>
            `- id="${n.id}" type="${n.type}"${n.label ? ` label="${n.label}"` : ''} at (${n.position.x}, ${n.position.y})`
    );
    return `${heading}\n${lines.join('\n')}`;
};

/**
 * Render the edge list as the compact per-turn context block (one line per edge: id · source port → target
 * port). The companion to {@link renderNodeContext} for an agent that reshapes wiring: whether an input is
 * already taken is a fact of the edge set, never of a node, so seeing the edges is the only way to judge
 * occupancy from context — and to free an input before reusing it — instead of discovering it through a
 * rejected connect. Same shape/headings contract as the node renderer.
 */
export const renderEdgeContext = (binding: CanvasBinding, headings: NodeContextHeadings = {}): string => {
    const { edges } = binding.readGraph();
    const heading = headings.heading ?? 'Current edges (source → target):';
    const empty = headings.empty ?? 'No edges on the canvas yet.';
    if (edges.length === 0) {
        return empty;
    }
    const lines = edges.map(
        e => `- id="${e.id}" ${e.sourceNodeId}:${e.sourcePortId} → ${e.targetNodeId}:${e.targetPortId}`
    );
    return `${heading}\n${lines.join('\n')}`;
};

// ── Shared node lookup ───────────────────────────────────────────────────────────────────────────

/** The live node behind an id, or the "no such node" error to return — one not-found wording for every node/edge tool. */
export const requireNode = (
    binding: CanvasBinding,
    call: ToolCall,
    nodeId: string
): { node: Graph['nodes'][number] } | { error: ToolResult } => {
    const node = binding.readGraph().nodes.find(n => n.id === nodeId);
    return node ? { node } : { error: err(call, `no node with id "${nodeId}" exists on the canvas`) };
};

// ── READ — list_nodes (compact) + describe_node (detail), over any CanvasBinding ─────────────────

const LIST_NODES_DEF: ToolDef = {
    name: 'list_nodes',
    description:
        'List the nodes with their id, type, label and current position (reflects edits made so far ' +
        'this turn). Use it to find the node the user means and read its position. It does NOT include ports ' +
        'or config — use describe_node (an existing node) or catalog_search (a block type) for those.',
    parameters: { type: 'object', properties: {} },
};

const DESCRIBE_NODE_DEF: ToolDef = {
    name: 'describe_node',
    description:
        'Describe one node in detail: its block type, its ports (inputs/outputs), its current config values, and ' +
        "the block's config schema (including a select field's allowed options). A node's ports follow from its " +
        'type, so use this to read a node’s current config before set_properties — or to disambiguate a block ' +
        'with several ports — not routinely before every connect.',
    parameters: {
        type: 'object',
        properties: { nodeId: { type: 'string', description: 'The id of the node to describe.' } },
        required: ['nodeId'],
    },
};

const SEARCH_NODES_DEF: ToolDef = {
    name: 'search_nodes',
    description:
        'Search the nodes you can see on the canvas (reflects edits made this turn). Pass a `query` to narrow ' +
        "the results — it is matched case-insensitively against each node's id, label, and block type; omit it " +
        'to list them all. Returns a compact list (id, type, label, position) — NOT ports or config. Use it to ' +
        'find the node id you need, then describe_node it for its ports or config.',
    parameters: {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: "Optional substring, matched against a node's id, label, or block type.",
            },
        },
    },
};

/** describe_node result (type + current config + block schema) — shared by the full read + the scoped search providers. Looks a node up by id: describe is always by a known id, so it is never type-scoped (only the node LIST is). */
const describeNodeResult = (binding: CanvasBinding, catalog: CatalogLookup, call: ToolCall): ToolResult => {
    const { nodeId } = call.args as { nodeId: string };
    const found = requireNode(binding, call, nodeId);
    if ('error' in found) return found.error;
    const { node } = found;
    return ok(call, { type: node.type, currentConfig: node.config ?? {}, schema: catalog.schema(node.type) });
};

/** READ provider over any {@link CanvasBinding}: `list_nodes` (compact, ALL nodes) + `describe_node` (detail). Carried by the orchestrator, the operation agents (locator, edge), and the builder. */
export const createNodeReadToolProvider = (binding: CanvasBinding, catalog: CatalogLookup): ToolProvider => ({
    listTools: () => [LIST_NODES_DEF, DESCRIBE_NODE_DEF],
    dispatch: (call: ToolCall): ToolResult => {
        if (call.name === 'list_nodes') {
            return ok(call, { nodes: listNodeLocations(binding) });
        }
        if (call.name === 'describe_node') {
            return describeNodeResult(binding, catalog, call);
        }
        return toolUnknown(call);
    },
});

/** GET_GRAPH: the whole canvas — every node + every edge — in one call. */
const GET_GRAPH_DEF: ToolDef = {
    name: 'get_graph',
    description:
        'Show the whole current flow in one call: every node (id, type, label, position) and every edge ' +
        '(source → target). Call it when you need to see the canvas as it is now — after making changes, or ' +
        'before deciding your next step.',
    parameters: { type: 'object', properties: {} },
};

/**
 * The PULL counterpart to injecting the canvas into context each turn (context-strategy-and-composition.md):
 * an agent fetches current state on demand via `get_graph`, which returns the same nodes + edges render.
 */
export const createGraphReadToolProvider = (binding: CanvasBinding): ToolProvider => ({
    listTools: () => [GET_GRAPH_DEF],
    dispatch: (call: ToolCall): ToolResult => {
        if (call.name === 'get_graph') {
            return ok(call, { graph: `${renderNodeContext(binding)}\n\n${renderEdgeContext(binding)}` });
        }
        return toolUnknown(call);
    },
});

/**
 * SEARCH provider: `search_nodes` (a search over the current nodes — `query` matched against id/label/type)
 * + `describe_node` (detail). `opts.type` is OPTIONAL: when set it structurally scopes the search to that ONE
 * block type (a block agent passes its own type, so it only ever sees that type and never the whole canvas);
 * left unset it is a general node search any agent can carry.
 */
export const createNodeSearchToolProvider = (
    binding: CanvasBinding,
    catalog: CatalogLookup,
    opts: { type?: string } = {}
): ToolProvider => ({
    listTools: () => [SEARCH_NODES_DEF, DESCRIBE_NODE_DEF],
    dispatch: (call: ToolCall): ToolResult => {
        if (call.name === 'search_nodes') {
            const { query } = (call.args ?? {}) as { query?: string };
            // Apply the optional structural scope first, then the query filter.
            let nodes = opts.type ? listNodeLocationsOfType(binding, opts.type) : listNodeLocations(binding);
            const q = query?.trim().toLowerCase();
            if (q) {
                nodes = nodes.filter(
                    n =>
                        n.id.toLowerCase().includes(q) ||
                        (n.label ?? '').toLowerCase().includes(q) ||
                        n.type.toLowerCase().includes(q)
                );
            }
            return ok(call, { nodes });
        }
        if (call.name === 'describe_node') {
            return describeNodeResult(binding, catalog, call);
        }
        return toolUnknown(call);
    },
});

// ── MOVE — move_node (write: position), applied straight through the CanvasBinding ───────────────

const MOVE_NODE_DEF: ToolDef = {
    name: 'move_node',
    description:
        'Move one existing node to a new position. Provide EXACTLY ONE of `by` (relative delta in px) ' +
        'or `to` (absolute position in px). Canvas coordinates: right = +dx, left = -dx, up = -dy, down = +dy.',
    requires: 'canModifyCanvas',
    parameters: {
        type: 'object',
        properties: {
            nodeId: { type: 'string', description: 'The id of the node to move (from list_nodes).' },
            by: {
                type: 'object',
                description: 'Relative delta in px. right=+dx, left=-dx, up=-dy, down=+dy.',
                properties: { dx: { type: 'number' }, dy: { type: 'number' } },
                required: ['dx', 'dy'],
            },
            to: {
                type: 'object',
                description: 'Absolute destination in px.',
                properties: { x: { type: 'number' }, y: { type: 'number' } },
                required: ['x', 'y'],
            },
        },
        required: ['nodeId'],
    },
};

/** MOVE provider (write: position): `move_node` applied straight through the {@link CanvasBinding}; returns `{ nodeId, label, from, to }`. Carried by the `locator`. */
export const createNodeMoveToolProvider = (binding: CanvasBinding): ToolProvider => ({
    listTools: () => [MOVE_NODE_DEF],
    dispatch: (call: ToolCall): ToolResult => {
        if (call.name === 'move_node') {
            const args = call.args as MoveNodeArgs;
            if (!hasExactlyOneTarget(args)) {
                return err(call, 'move_node requires exactly one of `by` (relative) or `to` (absolute)');
            }
            const found = requireNode(binding, call, args.nodeId);
            if ('error' in found) return found.error;
            const { node } = found;
            const from: XY = { x: node.position.x, y: node.position.y };
            const to = applyMove(from, args);
            if (!Number.isFinite(to.x) || !Number.isFinite(to.y)) {
                // Guard here too (the executor validator also rejects these) so a direct caller can't corrupt a position.
                return err(call, 'move_node resulting position must be finite numbers');
            }
            binding.updateNode(args.nodeId, { position: to });
            return ok(call, { nodeId: args.nodeId, label: node.customLabel, from, to });
        }
        return toolUnknown(call);
    },
});

// ── CONFIG — set_properties + rename (write: config/label), over a CanvasBinding ─────────────────

const SET_PROPERTIES_DEF: ToolDef = {
    name: 'set_properties',
    description:
        'Set config values on an existing node. Pass ONLY the keys you want to change — others are ' +
        'preserved (merged). Rejects an unknown key, a value not in a select, or a wrong-typed value.',
    requires: 'canEditConfig',
    parameters: {
        type: 'object',
        properties: {
            nodeId: { type: 'string', description: 'The id of the node to configure.' },
            config: { type: 'object', description: 'The config keys to set (only the changed ones).' },
        },
        required: ['nodeId', 'config'],
    },
};

const RENAME_DEF: ToolDef = {
    name: 'rename',
    description: "Rename an existing node (its custom label). Pass '' to clear a custom label.",
    requires: 'canEditConfig',
    parameters: {
        type: 'object',
        properties: {
            nodeId: { type: 'string', description: 'The id of the node to rename.' },
            label: { type: 'string', description: "The new label ('' clears a custom label)." },
        },
        required: ['nodeId', 'label'],
    },
};

/** Validate config entries against a block schema. Returns human-readable errors (empty = valid). */
const validateConfigEntries = (schema: BlockSchema, config: Record<string, unknown>): string[] => {
    const props = schema.config.properties ?? {};
    const errors: string[] = [];
    for (const [key, rawValue] of Object.entries(config)) {
        const field: JsonSchema | undefined = props[key];
        if (!field) {
            errors.push(`unknown config key "${key}" for block "${schema.type}"`);
            continue;
        }
        const value = String(rawValue);
        if (Array.isArray(field.enum)) {
            if (!field.enum.map(String).includes(value)) {
                errors.push(`"${key}"="${value}" is not an allowed option (allowed: ${field.enum.join(', ')})`);
            }
        } else if (field.type === 'number' || field.type === 'integer') {
            const n = Number(value);
            if (!Number.isFinite(n)) {
                errors.push(`"${key}"="${value}" is not a number`);
            } else if (field.type === 'integer' && !Number.isInteger(n)) {
                errors.push(`"${key}"="${value}" is not an integer`);
            }
        }
        // string / untyped: any value is accepted
    }
    return errors;
};

/**
 * Validate a config patch against a block schema and string-normalize it — the shared step behind
 * `set_properties` and `add_node`'s optional initial config. Returns the normalized config, or the errors
 * (a rejected patch is never applied, so both callers stay atomic).
 */
const prepareConfig = (
    schema: BlockSchema,
    config: Record<string, unknown>
): { config: Record<string, string> } | { errors: string[] } => {
    const errors = validateConfigEntries(schema, config);
    if (errors.length > 0) {
        return { errors };
    }
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(config)) {
        normalized[key] = String(value);
    }
    return { config: normalized };
};

/** CONFIG provider (write: config/label) over a {@link CanvasBinding}: `set_properties` (merged, catalog-validated) + `rename` (`''` clears the label). A rejected value is never applied. Wired directly into every block agent (and the builder) via its constructor. */
export const createNodeConfigToolProvider = (binding: CanvasBinding, catalog: CatalogLookup): ToolProvider => ({
    listTools: () => [SET_PROPERTIES_DEF, RENAME_DEF],
    dispatch: (call: ToolCall): ToolResult => {
        if (call.name === 'set_properties') {
            const { nodeId, config } = call.args as { nodeId: string; config: Record<string, unknown> };
            const found = requireNode(binding, call, nodeId);
            if ('error' in found) return found.error;
            const { node } = found;
            const schema = catalog.schema(node.type);
            if (!schema) {
                return err(call, `no schema for block type "${node.type}"`);
            }
            const prepared = prepareConfig(schema, config);
            if ('errors' in prepared) {
                return err(call, prepared.errors.join('; '));
            }
            binding.updateNode(nodeId, { config: prepared.config });
            return ok(call, { nodeId, config: prepared.config });
        }
        if (call.name === 'rename') {
            const { nodeId, label } = call.args as { nodeId: string; label: string };
            const found = requireNode(binding, call, nodeId);
            if ('error' in found) return found.error;
            binding.updateNode(nodeId, { label });
            return ok(call, { nodeId, label });
        }
        return toolUnknown(call);
    },
});

// ── STRUCTURE — add_node + delete_node (write: add/delete node), over a CanvasBinding ────────────

const ADD_NODE_DEF: ToolDef = {
    name: 'add_node',
    description:
        "Add one new node of a block `type` at a canvas `position`. Created with the block's default config; " +
        'optionally pass `config` to set non-default values in the SAME call (merged over the defaults and ' +
        'validated like set_properties — a bad value adds nothing). Returns the new id. It does NOT wire the ' +
        'node to anything.',
    requires: 'canModifyCanvas',
    parameters: {
        type: 'object',
        properties: {
            type: {
                type: 'string',
                description: 'The block type to create.',
            },
            position: {
                type: 'object',
                description: 'Absolute canvas position in px.',
                properties: { x: { type: 'number' }, y: { type: 'number' } },
                required: ['x', 'y'],
            },
            config: {
                type: 'object',
                description: 'Optional initial config values to set on the new node (merged over the defaults).',
            },
        },
        required: ['type', 'position'],
    },
};

const DELETE_NODE_DEF: ToolDef = {
    name: 'delete_node',
    description:
        'Delete one existing node. Every edge connected to it is removed with it (cascade). ' +
        'The removed edges are reported in the result.',
    requires: 'canModifyCanvas',
    parameters: {
        type: 'object',
        properties: { nodeId: { type: 'string', description: 'The id of the node to delete.' } },
        required: ['nodeId'],
    },
};

/** STRUCTURE provider (write: add/delete node) over a {@link CanvasBinding}: `add_node` (catalog-validated type, optional initial config) + `delete_node` (cascades edges). Wired directly into every block agent (and the builder) via its constructor. */
export const createNodeStructureToolProvider = (binding: CanvasBinding, catalog: CatalogLookup): ToolProvider => ({
    listTools: () => [ADD_NODE_DEF, DELETE_NODE_DEF],
    dispatch: (call: ToolCall): ToolResult => {
        if (call.name === 'add_node') {
            const { type, position, config } = call.args as {
                type: string;
                position: XY;
                config?: Record<string, unknown>;
            };
            const schema = catalog.schema(type);
            if (!schema) {
                return err(call, `unknown block type "${type}"`);
            }
            // Validate the optional initial config BEFORE creating, so a bad value adds nothing (atomic).
            let initialConfig: Record<string, string> | undefined;
            if (config && Object.keys(config).length > 0) {
                const prepared = prepareConfig(schema, config);
                if ('errors' in prepared) {
                    return err(call, prepared.errors.join('; '));
                }
                initialConfig = prepared.config;
            }
            const { id } = binding.addNode(type, position);
            if (initialConfig) {
                binding.updateNode(id, { config: initialConfig });
            }
            return ok(call, { nodeId: id, type, position, ...(initialConfig ? { config: initialConfig } : {}) });
        }
        if (call.name === 'delete_node') {
            const { nodeId } = call.args as { nodeId: string };
            const found = requireNode(binding, call, nodeId);
            if ('error' in found) return found.error;
            const droppedEdges = binding
                .readGraph()
                .edges.filter(e => e.sourceNodeId === nodeId || e.targetNodeId === nodeId)
                .map(e => e.id)
                .filter((id): id is string => id !== undefined);
            binding.deleteNode(nodeId);
            return ok(call, { nodeId, droppedEdges });
        }
        return toolUnknown(call);
    },
});
