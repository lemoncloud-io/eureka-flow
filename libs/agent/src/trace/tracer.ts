/** The observability port the agent core depends on: bind context once, emit structured events. */

export type TraceLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Correlation fields stamped onto every event by the tracer. Names follow the OpenTelemetry GenAI
 * semantic conventions so the record stream is portable to a real trace viewer later.
 */
export interface TraceContext {
    /** One per user request — the root correlation key. */
    runId?: string;
    /** Persona TYPE: 'orchestrator' | 'builder' | a block type — for grouping. */
    'gen_ai.agent.name'?: string;
    /** This INSTANCE: 'orchestrator' (singleton) or 'builder#3' (fresh per spawn) — for attribution. */
    'gen_ai.agent.id'?: string;
    /** The instance-id tree, e.g. 'run-42:builder#3' — the parent→child path. */
    flowPath?: string;
    /** Think/act loop index within an agent. */
    turn?: number;
    /** Open for event-specific extension without widening the named set. */
    [key: string]: unknown;
}

/** A structured event. `ts` and the bound context are added by the tracer/sink, not the caller. */
export interface TraceEvent {
    /** Dotted event name, e.g. 'tool.call' | 'llm.response' | 'canvas.mutate'. */
    name: string;
    /** Defaults to 'debug'. */
    level?: TraceLevel;
    /** Event-specific payload. */
    fields?: Record<string, unknown>;
}

/** What agents hold. Two methods: emit an event, or derive a context-bound child. */
export interface Tracer {
    emit(event: TraceEvent): void;
    /** Returns a NEW tracer that stamps `context` onto every event it emits (child keys win on clash). */
    child(context: TraceContext): Tracer;
}
