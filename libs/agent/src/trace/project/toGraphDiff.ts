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
    const b = new Map(before.nodes.map(n => [n.id, n]));
    const a = new Map(after.nodes.map(n => [n.id, n]));

    const addedNodes = [...a.keys()].filter(id => !b.has(id));
    const removedNodes = [...b.keys()].filter(id => !a.has(id));
    const changedNodes = [...a.keys()].filter(
        id => b.has(id) && JSON.stringify(b.get(id)) !== JSON.stringify(a.get(id))
    );

    const edgeIds = (g: GraphSnapshot): Set<string> => new Set(g.edges.map(e => String(e.id ?? '')).filter(Boolean));
    const be = edgeIds(before);
    const ae = edgeIds(after);
    const addedEdges = [...ae].filter(id => !be.has(id));
    const removedEdges = [...be].filter(id => !ae.has(id));

    return { addedNodes, removedNodes, changedNodes, addedEdges, removedEdges };
};
