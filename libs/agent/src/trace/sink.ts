import type { TraceContext } from './tracer';

/** One finalized log line: an event plus its fully-merged context and timestamp. Immutable once written. */
export interface TraceRecord {
    ts: number;
    name: string;
    level: string;
    /** Correlation fields accumulated across `child()` calls. */
    context: TraceContext;
    fields: Record<string, unknown>;
}

/** The adapter boundary: where a finalized record goes. Synchronous append — order is authoritative. */
export interface TraceSink {
    write(record: TraceRecord): void;
    flush?(): void;
}
