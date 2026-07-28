import { toolErr as err, toolOk as ok, toolUnknown } from './types';
import { applyMove, hasExactlyOneTarget } from '../canvas/moveSemantics';

import type { CanvasBinding, Graph, XY } from '../canvas/canvasBinding';
import type { MoveNodeArgs } from '../canvas/moveSemantics';
import type { BlockSchema, CatalogLookup } from '../catalog';
import type { ToolCall, ToolProvider, ToolResult } from './types';
import type { JsonSchema, ToolDef } from '../llm/llmGateway';

/**
 * The node tool domain — everything an agent does to canvas nodes, split by operation so agents
 * take only what they need:
 *   • `createNodeReadToolProvider`   — `list_nodes` + `describe_node`   (read)
 *   • `createNodeMoveToolProvider`   — `move_node`                      (write: position)
 *   • `createNodeConfigToolProvider` — `set_properties` + `rename`      (write: config/label)
 * Also owns the node projection (`listNodeLocations`) and per-turn context block (`renderNodeContext`).
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

/** Headings for {@link renderNodeContext} — lets one renderer serve every agent's context block. */
export interface NodeContextHeadings {
    /** Heading printed above a non-empty node list. */
    heading?: string;
    /** Whole message when there are no nodes. */
    empty?: string;
}

/** Render the node list as the compact per-turn context block (one line per node: id · type · label · position). */
export const renderNodeContext = (binding: CanvasBinding, headings: NodeContextHeadings = {}): string => {
    const heading = headings.heading ?? 'Current nodes on the canvas:';
    const empty = headings.empty ?? 'Current canvas: (no nodes).';
    const nodes = listNodeLocations(binding);
    if (nodes.length === 0) {
        return empty;
    }
    const lines = nodes.map(
        n =>
            `- id="${n.id}" type="${n.type}"${n.label ? ` label="${n.label}"` : ''} at (${n.position.x}, ${n.position.y})`
    );
    return `${heading}\n${lines.join('\n')}`;
};

// ── Shared node lookup ───────────────────────────────────────────────────────────────────────────

/** The live node behind an id, or the "no such node" error to return — one not-found wording for every node tool. */
const requireNode = (
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
        'this turn). Use it to find the node the user means and read its position.',
    parameters: { type: 'object', properties: {} },
};

const DESCRIBE_NODE_DEF: ToolDef = {
    name: 'describe_node',
    description:
        "Describe one node in detail: its block type, current config values, and the block's schema " +
        "(including a select field's allowed options). Use before set_properties to see valid values.",
    parameters: {
        type: 'object',
        properties: { nodeId: { type: 'string', description: 'The id of the node (from list_nodes).' } },
        required: ['nodeId'],
    },
};

/** READ provider over any {@link CanvasBinding}: `list_nodes` (compact) + `describe_node` (detail; needs the catalog for the block schema). Carried by the locator, `property` specialist, and orchestrator. */
export const createNodeReadToolProvider = (binding: CanvasBinding, catalog: CatalogLookup): ToolProvider => ({
    listTools: () => [LIST_NODES_DEF, DESCRIBE_NODE_DEF],
    dispatch: (call: ToolCall): ToolResult => {
        if (call.name === 'list_nodes') {
            return ok(call, { nodes: listNodeLocations(binding) });
        }
        if (call.name === 'describe_node') {
            const { nodeId } = call.args as { nodeId: string };
            const found = requireNode(binding, call, nodeId);
            if ('error' in found) return found.error;
            const { node } = found;
            return ok(call, {
                type: node.type,
                currentConfig: node.config ?? {},
                schema: catalog.schema(node.type),
            });
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

/** CONFIG provider (write: config/label) over a {@link CanvasBinding}: `set_properties` (merged, catalog-validated) + `rename` (`''` clears the label). A rejected value is never applied. Carried by the `property` specialist. */
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
            const errors = validateConfigEntries(schema, config);
            if (errors.length > 0) {
                return err(call, errors.join('; '));
            }
            const normalized: Record<string, string> = {};
            for (const [key, value] of Object.entries(config)) {
                normalized[key] = String(value);
            }
            binding.updateNode(nodeId, { config: normalized });
            return ok(call, { nodeId, config: normalized });
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
