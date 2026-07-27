import { newEdgeId, newNodeId } from './ids';

import type { GraphSnapshot } from './document';
import type { GraphNode } from '../types';
import type { EdgeData, NodeData, Position } from '@lemoncloud/eureka-flows-api';

/**
 * A copied selection, as plain data.
 *
 * Serializable on purpose: the payload has to survive a trip through the system clipboard
 * one day, so it holds no references back into the live graph.
 */
export interface ClipboardPayload {
    nodes: NodeData[];
    edges: EdgeData[];
}

const NO_OFFSET: Position = { x: 0, y: 0 };

/**
 * Copy a selection, including the edges that run between the nodes in it.
 *
 * Edges leaving the selection are left behind: their other end is not being copied, so a
 * pasted copy of them would point at the original node and quietly rewire the graph the
 * user was only duplicating.
 */
export const copyNodes = (graph: GraphSnapshot, nodeIds: string[]): ClipboardPayload => {
    const wanted = new Set(nodeIds);
    return structuredClone({
        nodes: graph.nodes.filter(n => !!n.id && wanted.has(n.id)),
        edges: graph.edges.filter(e => wanted.has(e.sourceNodeId) && wanted.has(e.targetNodeId)),
    });
};

/** A pasted graph, with the new node ids called out — `NodeData.id` is optional, these are not. */
export interface PasteResult {
    graph: GraphSnapshot;
    nodeIds: string[];
}

/**
 * Mint a fresh copy of a payload, ready to drop into the graph.
 *
 * Every node and edge is re-identified and the mapping is applied to both ends of the
 * internal edges — reusing an id here would make the paste an overwrite of what was
 * copied. Runtime state does not come along: a pasted node has never run, and carrying a
 * previous run's output would make it look like it had.
 *
 * The offset is added as given. Positions are already grid-aligned by the time they reach
 * here, so a grid-aligned offset keeps them aligned and the engine needs no grid of its own.
 */
export const pasteNodes = (payload: ClipboardPayload, offset: Position = NO_OFFSET): PasteResult => {
    const minted = payload.nodes.map(node => ({ node, id: newNodeId() }));
    const idMap = new Map(minted.filter(({ node }) => !!node.id).map(({ node, id }) => [node.id as string, id]));

    const nodes = minted.map(
        ({ node, id }) =>
            ({
                ...node,
                id,
                position: { x: node.position.x + offset.x, y: node.position.y + offset.y },
                state: 'IDLE',
                status: 'IDLE', // Deprecated: kept for backward compatibility
                inputData: {},
                outputData: {},
                errorMessage: undefined,
                config: node.config ? structuredClone(node.config) : {},
                autoExecutionEnabled: node.autoExecutionEnabled ?? true,
            }) as GraphNode
    );

    const edges = payload.edges.flatMap<EdgeData>(edge => {
        const sourceNodeId = idMap.get(edge.sourceNodeId);
        const targetNodeId = idMap.get(edge.targetNodeId);
        // Both ends were checked at copy time; this also holds a hand-built payload to it.
        if (!sourceNodeId || !targetNodeId) return [];
        return [{ ...edge, id: newEdgeId(), sourceNodeId, targetNodeId }];
    });

    return { graph: { nodes, edges }, nodeIds: minted.map(({ id }) => id) };
};
