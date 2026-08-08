import { TURN_DONE, TURN_ERROR, TURN_START } from '../events';

import type { TraceRecord } from '../sink';
import type { GraphDiff, GraphSnapshot } from './types';

const EMPTY: GraphSnapshot = { nodes: [], edges: [] };

/** The root (orchestrator) is the instance whose flowPath has no ':' segment. */
const isRoot = (record: TraceRecord): boolean => !String(record.context.flowPath ?? '').includes(':');

/**
 * Project the before/after canvas delta of one request from the ROOT turn boundary: the first root
 * `turn.start` snapshot vs the last root `turn.done`/`turn.error` snapshot for that `runId`. Per-sub-agent
 * snapshots are deliberately ignored (they overlap on the shared concurrent binding); the request-level
 * delta lives only at the root.
 */
export const toGraphDiff = (records: TraceRecord[], runId: string): GraphDiff => {
    const forRun = records.filter(r => r.context.runId === runId && isRoot(r));
    const start = forRun.find(r => r.name === TURN_START && r.fields.graph);
    const ends = forRun.filter(r => (r.name === TURN_DONE || r.name === TURN_ERROR) && r.fields.graph);

    const before = (start?.fields.graph as GraphSnapshot) ?? EMPTY;
    const after = (ends.length ? (ends[ends.length - 1].fields.graph as GraphSnapshot) : undefined) ?? EMPTY;

    return { runId, before, after, ...diff(before, after) };
};

const diff = (before: GraphSnapshot, after: GraphSnapshot) => {
    const beforeNodes = new Map(before.nodes.map(n => [n.id, n]));
    const afterNodes = new Map(after.nodes.map(n => [n.id, n]));

    const addedNodes = [...afterNodes.keys()].filter(id => !beforeNodes.has(id));
    const removedNodes = [...beforeNodes.keys()].filter(id => !afterNodes.has(id));
    const changedNodes = [...afterNodes.keys()].filter(
        id => beforeNodes.has(id) && JSON.stringify(beforeNodes.get(id)) !== JSON.stringify(afterNodes.get(id))
    );

    const edgeIds = (g: GraphSnapshot): Set<string> => new Set(g.edges.map(e => String(e.id ?? '')).filter(Boolean));
    const beforeEdges = edgeIds(before);
    const afterEdges = edgeIds(after);
    const addedEdges = [...afterEdges].filter(id => !beforeEdges.has(id));
    const removedEdges = [...beforeEdges].filter(id => !afterEdges.has(id));

    return { addedNodes, removedNodes, changedNodes, addedEdges, removedEdges };
};
