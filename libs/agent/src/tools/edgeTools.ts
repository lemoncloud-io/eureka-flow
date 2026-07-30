import { requireNode } from './nodeTools';
import { toolErr as err, toolOk as ok, toolUnknown } from './types';
import { arePortTypesCompatible, wouldCreateCycle } from '../canvas/edgeSemantics';

import type { CanvasBinding, EdgeSpec } from '../canvas/canvasBinding';
import type { CatalogLookup } from '../catalog';
import type { ToolCall, ToolProvider, ToolResult } from './types';
import type { ToolDef } from '../llm/llmGateway';

/**
 * The edge tool domain — everything the `edge` specialist does to connections:
 *   • `list_edges`      — the current edges (read)
 *   • `connect_nodes`   — add one validated edge (write)
 *   • `disconnect_edge` — remove one edge by id (write)
 *
 * Validation lives HERE (port existence, type-compat, no-cycle), not in the binding: the binding's
 * `addEdge` is a thin mechanical seam that applies the edit and handles occupied-input replacement. A
 * rejected connection returns `toolErr` BEFORE any binding write, so the graph is left untouched.
 */

const portIds = (ports: { portId: string }[] | undefined): string =>
    (ports ?? []).map(p => p.portId).join(', ') || '(none)';

const LIST_EDGES_DEF: ToolDef = {
    name: 'list_edges',
    description:
        'List the edges (connections) with their id and source/target node+port (reflects edits made so ' +
        'far this turn). Use it to find the edge to disconnect.',
    parameters: { type: 'object', properties: {} },
};

const CONNECT_NODES_DEF: ToolDef = {
    name: 'connect_nodes',
    description:
        "Connect a source node's OUTPUT port to a target node's INPUT port. Rejects an unknown node or " +
        'port, incompatible port types, or a connection that would create a cycle. If the target input ' +
        'port is already occupied, the connection is REJECTED and names the existing edge (it is not ' +
        'replaced) — disconnect that edge first, then reconnect. Returns the new edge id.',
    requires: 'canModifyCanvas',
    parameters: {
        type: 'object',
        properties: {
            sourceNodeId: { type: 'string', description: 'The id of the source node (from list_nodes).' },
            sourcePortId: { type: 'string', description: 'An OUTPUT port id on the source (from describe_node).' },
            targetNodeId: { type: 'string', description: 'The id of the target node (from list_nodes).' },
            targetPortId: { type: 'string', description: 'An INPUT port id on the target (from describe_node).' },
        },
        required: ['sourceNodeId', 'sourcePortId', 'targetNodeId', 'targetPortId'],
    },
};

const DISCONNECT_EDGE_DEF: ToolDef = {
    name: 'disconnect_edge',
    description: 'Remove one existing edge by its id (from list_edges).',
    requires: 'canModifyCanvas',
    parameters: {
        type: 'object',
        properties: { edgeId: { type: 'string', description: 'The id of the edge to remove (from list_edges).' } },
        required: ['edgeId'],
    },
};

/** EDGE provider: `list_edges` (read) + `connect_nodes` / `disconnect_edge` (write, `canModifyCanvas`). Validation (ports · type-compat · no-cycle) runs here; the binding just applies. Carried by the `edge` specialist. */
export const createEdgeToolProvider = (binding: CanvasBinding, catalog: CatalogLookup): ToolProvider => ({
    listTools: () => [LIST_EDGES_DEF, CONNECT_NODES_DEF, DISCONNECT_EDGE_DEF],
    dispatch: (call: ToolCall): ToolResult => {
        if (call.name === 'list_edges') {
            const edges = binding.readGraph().edges.map(e => ({
                edgeId: e.id,
                sourceNodeId: e.sourceNodeId,
                sourcePortId: e.sourcePortId,
                targetNodeId: e.targetNodeId,
                targetPortId: e.targetPortId,
            }));
            return ok(call, { edges });
        }

        if (call.name === 'connect_nodes') {
            const spec = call.args as EdgeSpec;

            const source = requireNode(binding, call, spec.sourceNodeId);
            if ('error' in source) return source.error;
            const target = requireNode(binding, call, spec.targetNodeId);
            if ('error' in target) return target.error;

            const sourceSchema = catalog.schema(source.node.type);
            const outPort = sourceSchema?.outputs.find(p => p.portId === spec.sourcePortId);
            if (!outPort) {
                return err(
                    call,
                    `node "${spec.sourceNodeId}" (${source.node.type}) has no output port "${spec.sourcePortId}"; outputs: ${portIds(sourceSchema?.outputs)}`
                );
            }
            const targetSchema = catalog.schema(target.node.type);
            const inPort = targetSchema?.inputs.find(p => p.portId === spec.targetPortId);
            if (!inPort) {
                return err(
                    call,
                    `node "${spec.targetNodeId}" (${target.node.type}) has no input port "${spec.targetPortId}"; inputs: ${portIds(targetSchema?.inputs)}`
                );
            }

            if (!arePortTypesCompatible(outPort.type, inPort.type)) {
                return err(
                    call,
                    `incompatible port types: ${source.node.type}.${spec.sourcePortId} (${outPort.type ?? 'any'}) → ${target.node.type}.${spec.targetPortId} (${inPort.type ?? 'any'})`
                );
            }
            if (wouldCreateCycle(binding.readGraph().edges, spec.sourceNodeId, spec.targetNodeId)) {
                return err(call, `connecting "${spec.sourceNodeId}" → "${spec.targetNodeId}" would create a cycle`);
            }

            // An input port holds one edge. Displacing an existing connection is the orchestrator's call,
            // not a silent overwrite — reject and name the occupying edge so it can disconnect, then reconnect.
            // (Sibling input ports are unaffected: the match keys on BOTH targetNodeId AND targetPortId.)
            const occupying = binding
                .readGraph()
                .edges.find(e => e.targetNodeId === spec.targetNodeId && e.targetPortId === spec.targetPortId);
            if (occupying) {
                return err(
                    call,
                    `input port "${spec.targetPortId}" on node "${spec.targetNodeId}" (${target.node.type}) is ` +
                        `already connected by edge "${occupying.id}" from ` +
                        `"${occupying.sourceNodeId}:${occupying.sourcePortId}"; disconnect it first, then reconnect`
                );
            }

            const { id } = binding.addEdge({
                sourceNodeId: spec.sourceNodeId,
                sourcePortId: spec.sourcePortId,
                targetNodeId: spec.targetNodeId,
                targetPortId: spec.targetPortId,
            });
            return ok(call, { edgeId: id, ...spec });
        }

        if (call.name === 'disconnect_edge') {
            const { edgeId } = call.args as { edgeId: string };
            const edge = binding.readGraph().edges.find(e => e.id === edgeId);
            if (!edge) {
                return err(call, `no edge with id "${edgeId}" exists on the canvas`);
            }
            binding.deleteEdge(edgeId);
            return ok(call, { edgeId });
        }

        return toolUnknown(call);
    },
});
