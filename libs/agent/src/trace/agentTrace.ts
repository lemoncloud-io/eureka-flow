import { NoopTracer, createTracer } from './createTracer';
import { toGraphDiff, toTraceTree, toTranscripts } from './project';
import { memorySink, redactingSink } from './sinks';

import type { AgentTranscript, GraphDiff, TraceNode } from './project';
import type { TraceRecord } from './sink';
import type { Tracer } from './tracer';

/** The three read-time views of one request's record stream. */
export interface TraceProjections {
    transcripts: AgentTranscript[];
    tree: TraceNode | null;
    diff: GraphDiff | null;
}

/** A tracer plus the ways to read back what it captured. */
export interface AgentTrace {
    /** Inject this into the agent (`deps.tracer`). Off ⇒ NoopTracer, so nothing is emitted. */
    tracer: Tracer;
    /** The captured records (already redacted). Empty when disabled. */
    records: () => TraceRecord[];
    /** The captured stream projected 3 ways: chat per agent, the call tree, the graph before→after. */
    project: () => TraceProjections;
}

const EMPTY: TraceProjections = { transcripts: [], tree: null, diff: null };

/**
 * The ONE place any entry point (web, scenario harness, terminal) turns a "should we trace?" flag into a
 * ready-to-inject {@link Tracer} whose records read back as the three projections. Each entry point decides
 * `enabled` from its own runtime's flag (node: `AGENT_TRACE`; web: DEV or a `?trace=1`/localStorage toggle) —
 * the flag SOURCE is per-runtime, the capture + projection is identical everywhere.
 *
 * The root identity is bound by the orchestrator itself (see its `beginRunContext`), so nothing here needs to
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
    const runId = (): string => String(buffer.records.find(r => r.context.runId)?.context.runId ?? 'run-1');
    return {
        tracer,
        records: () => buffer.records,
        project: () => ({
            transcripts: toTranscripts(buffer.records),
            tree: toTraceTree(buffer.records),
            diff: buffer.records.length ? toGraphDiff(buffer.records, runId()) : null,
        }),
    };
};
