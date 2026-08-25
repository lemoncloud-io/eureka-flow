import type { FlowSnapshot } from './snapshot';
import type { EdgeData, NodeData } from '@lemoncloud/eureka-flows-api';

/**
 * What separates a working copy from its baseline.
 *
 * Edges have no `modified` bucket: an edge is only ever added or removed, never
 * re-pointed in place, so a changed connection reads as one of each.
 */
export interface FlowDiff {
    addedNodes: string[];
    removedNodes: string[];
    modifiedNodes: string[];
    addedEdges: string[];
    removedEdges: string[];
    /** Nothing to save. */
    isEmpty: boolean;
}

/** Stable stringify — key order must not decide whether a flow is dirty. */
const canonical = (value: unknown): string => {
    if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
};

const byId = <T extends { id?: string }>(items: T[]): Map<string, T> => {
    const map = new Map<string, T>();
    for (const item of items) {
        if (item.id) map.set(item.id, item);
    }
    return map;
};

const edgeShape = (edge: EdgeData): string =>
    canonical({
        sourceNodeId: edge.sourceNodeId,
        sourcePortId: edge.sourcePortId,
        targetNodeId: edge.targetNodeId,
        targetPortId: edge.targetPortId,
    });

/**
 * Compare a working copy against its baseline.
 *
 * Both sides must already be snapshots, so only fields the server stores are considered.
 */
export const diffSnapshots = (working: FlowSnapshot, baseline: FlowSnapshot): FlowDiff => {
    const workingNodes = byId<NodeData>(working.nodes);
    const baselineNodes = byId<NodeData>(baseline.nodes);
    const workingEdges = byId<EdgeData>(working.edges);
    const baselineEdges = byId<EdgeData>(baseline.edges);

    const addedNodes: string[] = [];
    const modifiedNodes: string[] = [];
    for (const [id, node] of workingNodes) {
        const before = baselineNodes.get(id);
        if (!before) addedNodes.push(id);
        else if (canonical(node) !== canonical(before)) modifiedNodes.push(id);
    }
    const removedNodes = [...baselineNodes.keys()].filter(id => !workingNodes.has(id));

    const addedEdges: string[] = [];
    const removedEdges: string[] = [];
    for (const [id, edge] of workingEdges) {
        const before = baselineEdges.get(id);
        // A re-pointed edge is a different connection wearing the same id.
        if (!before || edgeShape(edge) !== edgeShape(before)) addedEdges.push(id);
    }
    for (const [id, edge] of baselineEdges) {
        const after = workingEdges.get(id);
        if (!after || edgeShape(after) !== edgeShape(edge)) removedEdges.push(id);
    }

    return {
        addedNodes,
        removedNodes,
        modifiedNodes,
        addedEdges,
        removedEdges,
        isEmpty:
            addedNodes.length === 0 &&
            removedNodes.length === 0 &&
            modifiedNodes.length === 0 &&
            addedEdges.length === 0 &&
            removedEdges.length === 0,
    };
};

/** Whether the diff carries anything the server would reject from a non-owner editor. */
export const hasStructuralChange = (diff: FlowDiff): boolean =>
    diff.addedNodes.length > 0 ||
    diff.removedNodes.length > 0 ||
    diff.addedEdges.length > 0 ||
    diff.removedEdges.length > 0;
