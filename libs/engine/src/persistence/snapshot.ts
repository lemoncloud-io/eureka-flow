import { transformNodesForSave } from './transformNodes';

import type { BlockDefinitionWithFrontend } from '../types';
import type { EdgeData, NodeData } from '@lemoncloud/eureka-flows-api';

/**
 * A flow reduced to what the server stores — the same shape `/flows/:id/save` receives.
 *
 * This is the unit the baseline is kept in and the unit `diffSnapshots` compares, so
 * "has this flow changed" and "is there anything to save" can never disagree.
 */
export interface FlowSnapshot {
    nodes: NodeData[];
    edges: EdgeData[];
}

/** A graph as the canvas holds it, in either the API's or the UI's edge naming. */
export interface GraphLike {
    nodes?: NodeData[];
    edges?: EdgeData[];
    connections?: EdgeData[];
}

/**
 * Reduce a live graph to its snapshot.
 *
 * Runtime state — execution status, port data, timings — is dropped here, which is why
 * running a node does not make a flow dirty.
 */
export const toSnapshot = (
    graph: GraphLike,
    blockRegistry: Record<string, BlockDefinitionWithFrontend>
): FlowSnapshot => ({
    nodes: transformNodesForSave(graph.nodes ?? [], blockRegistry),
    edges: (graph.edges ?? graph.connections ?? []) as EdgeData[],
});

/** An empty flow — the baseline for a flow that does not exist on the server yet. */
export const emptySnapshot = (): FlowSnapshot => ({ nodes: [], edges: [] });
