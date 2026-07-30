import type { GraphEdge, GraphNode } from '../types';
import type { DataPacket } from '@lemoncloud/eureka-flows-api';

/**
 * One port row from `GET /flows/:id/load`.
 *
 * The load response carries port values alongside the nodes rather than inside them, so a
 * freshly loaded graph knows its shape but not what its last run produced until these are
 * folded in.
 */
export interface PortRow {
    nodeId: string;
    /** Port name, not the full `nodeId:port` id. */
    portId: string;
    /** `null` means the server confirmed it empty; `undefined` means it did not say. */
    data?: DataPacket | null;
}

/**
 * Fold port values back into the nodes that own them.
 *
 * Direction comes from the port name rather than the row's own `direction` field. That is
 * how it has always worked here and changing it would move data between ports, so it is
 * written down rather than quietly corrected.
 */
export const applyPortRows = (nodes: GraphNode[], ports: PortRow[]): GraphNode[] => {
    if (ports.length === 0) return nodes;

    return nodes.map(node => {
        const owned = ports.filter(p => p.nodeId === node.id && p.portId && p.data);
        if (owned.length === 0) return node;

        const inputData = { ...node.inputData };
        const outputData = { ...node.outputData };

        for (const { portId, data } of owned) {
            if (!portId || !data) continue;
            if (portId === 'out') outputData[portId] = data;
            else inputData[portId] = data;
        }

        return { ...node, inputData, outputData };
    });
};

/**
 * Carry each node's output along its edges into whatever it feeds.
 *
 * A connected input takes what its source is producing — the same answer the run-time half
 * of this rule gives. The two used to differ, and which one you got depended on whether the
 * flow had just been reloaded.
 *
 * That other half is `hydrateInputsFromUpstream`, and it is **not in this package**: it
 * lives in the web app's `libs/flows/src/utils/hydrateInputs.ts`. Nothing here calls it, so
 * a headless caller that runs a node has to hydrate the inputs itself.
 *
 * Nodes nothing reached come back by identity, so a caller can tell which ones moved.
 */
export const propagateAlongEdges = (nodes: GraphNode[], edges: GraphEdge[]): GraphNode[] =>
    nodes.map(node => {
        const incoming = edges.filter(e => e.targetNodeId === node.id);
        if (incoming.length === 0) return node;

        const inputData = { ...node.inputData };
        let reached = false;

        for (const edge of incoming) {
            const source = nodes.find(n => n.id === edge.sourceNodeId);
            const packet = source?.outputData?.[edge.sourcePortId];
            // `'value' in packet` rather than a truthiness check: a port that has been read
            // but produced nothing is still a packet, and it is not data to move.
            if (packet && typeof packet === 'object' && 'value' in packet) {
                inputData[edge.targetPortId] = packet;
                reached = true;
            }
        }

        return reached ? { ...node, inputData } : node;
    });
