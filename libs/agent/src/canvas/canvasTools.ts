import { applyMove, hasExactlyOneTarget } from './moveSemantics';

import type { CanvasBinding, XY } from './canvasBinding';
import type { MoveNodeArgs } from './moveSemantics';
import type { ToolDef } from '../llm/llmGateway';
import type { ToolCall, ToolProvider, ToolResult } from '../tools/toolTypes';

/**
 * The canvas domain's tool provider — a single source (a `ToolProvider` maps 1:1 to one MCP
 * server) bundling every tool that operates on the {@link CanvasBinding}: `list_nodes` (read)
 * and `move_node` (mutate). Any agent can carry it via `AgentConfig.tools`.
 *
 * Read vs. mutate is **not** a provider boundary — it's a per-tool property, carried by each
 * tool's `requires` (`list_nodes` needs nothing; `move_node` needs `canModifyCanvas`) and
 * enforced by the executor per call. Providers are split by **domain** instead: a future
 * flow-edit agent adds a `configToolProvider` / `edgeToolProvider` alongside this one,
 * not more read/mutate splits.
 *
 * (If an agent should not even *see* a tool it can't use, the executor can later filter
 * `listTools` by the grant — a small add-on that still keys off `requires`, deferred until a
 * reduced-surface agent actually exists.)
 */

/** A node trimmed to what relocation needs (spec §5). */
export interface NodeLocation {
    id: string;
    type: string;
    /**
     * `customLabel` if set, else undefined. v0 does not resolve the block's default label
     * (no block-registry dependency) — the model matches on `type` instead (SPEC §5 / §9).
     */
    label?: string;
    position: XY;
}

const LIST_NODES_DEF: ToolDef = {
    name: 'list_nodes',
    description:
        'List the nodes on the canvas with their id, type, label and current position. ' +
        'Use this to find the node the user is referring to and read its current position.',
    parameters: { type: 'object', properties: {} },
};

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

/** Project the live graph to the trimmed node list the model reasons over. */
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

/**
 * The canvas domain's built-in tool provider: `list_nodes` (read) + `move_node` (mutate,
 * applied straight through the {@link CanvasBinding} — no draft, per spec §2.2). `move_node`
 * returns `{ nodeId, label, from, to }` so the model can confirm and chain follow-up moves.
 */
export const createCanvasToolProvider = (binding: CanvasBinding): ToolProvider => ({
    listTools: (): ToolDef[] => [LIST_NODES_DEF, MOVE_NODE_DEF],

    dispatch: (call: ToolCall): ToolResult => {
        if (call.name === 'list_nodes') {
            return { toolCallId: call.id, ok: true, data: { nodes: listNodeLocations(binding) } };
        }

        if (call.name === 'move_node') {
            const args = call.args as MoveNodeArgs;

            if (!hasExactlyOneTarget(args)) {
                return {
                    toolCallId: call.id,
                    ok: false,
                    error: 'move_node requires exactly one of `by` (relative) or `to` (absolute)',
                };
            }

            const node = binding.readGraph().nodes.find(n => n.id === args.nodeId);
            if (!node) {
                return {
                    toolCallId: call.id,
                    ok: false,
                    error: `no node with id "${args.nodeId}" exists on the canvas`,
                };
            }

            const from: XY = { x: node.position.x, y: node.position.y };
            const to = applyMove(from, args);
            if (!Number.isFinite(to.x) || !Number.isFinite(to.y)) {
                // Defense-in-depth: the executor's validator also rejects non-finite deltas,
                // but guard here too so a direct provider caller can't corrupt a position.
                return {
                    toolCallId: call.id,
                    ok: false,
                    error: 'move_node resulting position must be finite numbers',
                };
            }
            binding.updateNode(args.nodeId, { position: to });

            return {
                toolCallId: call.id,
                ok: true,
                data: { nodeId: args.nodeId, label: node.customLabel, from, to },
            };
        }

        return { toolCallId: call.id, ok: false, error: `unknown tool: ${call.name}` };
    },
});
