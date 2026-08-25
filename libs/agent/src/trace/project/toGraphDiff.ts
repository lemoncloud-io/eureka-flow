import { TURN_DONE, TURN_ERROR, TURN_START } from '../events';

import type { TraceRecord } from '../sink';
import type { EdgeChange, GraphDiff, GraphSnapshot, NodeChange } from './types';

const EMPTY: GraphSnapshot = { nodes: [], edges: [] };

/** The root (orchestrator) is the instance whose flowPath has no ':' segment. */
const isRoot = (record: TraceRecord): boolean => !String(record.context.flowPath ?? '').includes(':');

/**
 * Project the before/after canvas delta from the ROOT turn boundaries: the first root `turn.start`
 * snapshot vs the last root `turn.done`/`turn.error` snapshot. Pass a `runId` for ONE turn's delta; omit
 * it for the cumulative whole-session delta (the first turn's `before` → the last turn's `after`).
 * Per-sub-agent snapshots are deliberately ignored (they overlap on the shared concurrent binding); the
 * delta lives only at the root.
 *
 * A MISSING boundary yields an EMPTY delta, never a phantom one: a turn still in flight (or aborted before
 * `turn.done`) has no `after` snapshot, and an absent snapshot is unknown, not empty — treating it as `EMPTY`
 * would report every node on the canvas as deleted. Both boundaries fall back to the one that IS present, and
 * `settled` records whether the closing boundary was seen at all.
 */
export const toGraphDiff = (records: TraceRecord[], runId?: string): GraphDiff => {
    const roots = records.filter(r => isRoot(r) && (runId === undefined || r.context.runId === runId));
    const start = roots.find(r => r.name === TURN_START && r.fields.graph);
    const ends = roots.filter(r => (r.name === TURN_DONE || r.name === TURN_ERROR) && r.fields.graph);

    const startGraph = start?.fields.graph as GraphSnapshot | undefined;
    const endGraph = ends.length ? (ends[ends.length - 1].fields.graph as GraphSnapshot) : undefined;

    const before = startGraph ?? endGraph ?? EMPTY;
    const after = endGraph ?? startGraph ?? EMPTY;

    return { runId: runId ?? 'session', settled: endGraph !== undefined, before, after, ...diff(before, after) };
};

/** Coerce a snapshot field (typed `unknown` — the snapshot is structural) to a string, treating null/undefined as empty. */
const str = (value: unknown): string => (value == null ? '' : String(value));

const toNodeChange = (node: GraphSnapshot['nodes'][number]): NodeChange => ({ id: node.id, type: str(node.type) });

const toEdgeChange = (edge: GraphSnapshot['edges'][number]): EdgeChange => ({
    id: str(edge.id),
    sourceNodeId: str(edge.sourceNodeId),
    sourcePortId: str(edge.sourcePortId),
    targetNodeId: str(edge.targetNodeId),
    targetPortId: str(edge.targetPortId),
});

/** Index a snapshot's edges by id, dropping any edge without one (unkeyable — the binding always mints one). */
const edgesById = (g: GraphSnapshot): Map<string, GraphSnapshot['edges'][number]> => {
    const byId = new Map<string, GraphSnapshot['edges'][number]>();
    for (const edge of g.edges) {
        const id = str(edge.id);
        if (id) byId.set(id, edge);
    }
    return byId;
};

const diff = (before: GraphSnapshot, after: GraphSnapshot) => {
    const beforeNodes = new Map(before.nodes.map(n => [n.id, n]));
    const afterNodes = new Map(after.nodes.map(n => [n.id, n]));

    const addedNodes = [...afterNodes.values()].filter(n => !beforeNodes.has(n.id)).map(toNodeChange);
    const removedNodes = [...beforeNodes.values()].filter(n => !afterNodes.has(n.id)).map(toNodeChange);
    const changedNodes = [...afterNodes.values()]
        .filter(n => beforeNodes.has(n.id) && JSON.stringify(beforeNodes.get(n.id)) !== JSON.stringify(n))
        .map(toNodeChange);

    const beforeEdges = edgesById(before);
    const afterEdges = edgesById(after);
    const addedEdges = [...afterEdges.values()].filter(e => !beforeEdges.has(str(e.id))).map(toEdgeChange);
    const removedEdges = [...beforeEdges.values()].filter(e => !afterEdges.has(str(e.id))).map(toEdgeChange);

    return { addedNodes, removedNodes, changedNodes, addedEdges, removedEdges };
};
