import { NoopTracer, createTracer } from './createTracer';
import { toGraphDiff, toTraceForest, toTranscripts } from './project';
import { memorySink, redactingSink } from './sinks';

import type { AgentTranscript, GraphDiffProjection, TraceNode } from './project';
import type { TraceRecord } from './sink';
import type { Tracer } from './tracer';

/** The three read-time views of a run's record stream. */
export interface TraceProjections {
    transcripts: AgentTranscript[];
    /** The agent call forest — one root per orchestrator instance/epoch (a reload or model switch adds a root). */
    trees: TraceNode[];
    /** The graph delta as one cumulative whole-session view plus one per turn. */
    diff: GraphDiffProjection;
}

/** A tracer plus the ways to read back what it captured. */
export interface AgentTrace {
    /** Inject this into the agent (`deps.tracer`). Off ⇒ NoopTracer, so nothing is emitted. */
    tracer: Tracer;
    /** The captured records (already redacted). Empty when disabled. */
    records: () => TraceRecord[];
    /** The captured stream projected 3 ways: chat per agent, the call forest, the graph before→after. */
    project: () => TraceProjections;
}

const EMPTY: TraceProjections = { transcripts: [], trees: [], diff: { cumulative: null, perTurn: [] } };

/**
 * The ONE place any entry point (web, scenario harness, terminal) turns a "should we trace?" flag into a
 * ready-to-inject {@link Tracer} whose records read back as the three projections. Each entry point decides
 * `enabled` from its own runtime's flag (node: `AGENT_TRACE`; web: DEV or a `?trace=1`/localStorage toggle) —
 * the flag SOURCE is per-runtime, the capture + projection is identical everywhere.
 *
 * The root identity is bound by the orchestrator itself, so nothing here needs to
 * know the flow id — injecting `tracer` is all it takes for the projections to attribute correctly.
 *
 * `enabled === false` returns {@link NoopTracer} and empty projections — the production default, zero cost.
 */
export const createAgentTrace = (enabled: boolean): AgentTrace => {
    if (!enabled) {
        return { tracer: NoopTracer, records: () => [], project: () => EMPTY };
    }
    // Redact secret-looking fields at the sink boundary, then keep the redacted records in memory to project.
    const buffer = memorySink();
    const tracer = createTracer(redactingSink(buffer));
    return {
        tracer,
        records: () => buffer.records,
        project: () => {
            const records = buffer.records;
            // Turn order = first-seen order of each runId (the root mints run-1, run-2, … per send()).
            const runIds = [...new Set(records.map(r => String(r.context.runId ?? '')).filter(Boolean))];
            return {
                transcripts: toTranscripts(records),
                trees: toTraceForest(records),
                diff: {
                    cumulative: records.length ? toGraphDiff(records) : null,
                    perTurn: runIds.map(runId => toGraphDiff(records, runId)),
                },
            };
        },
    };
};
