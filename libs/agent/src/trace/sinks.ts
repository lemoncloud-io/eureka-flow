import { redact } from './redact';

import type { TraceRecord, TraceSink } from './sink';

/** Collects records in memory — the test sink, and the web dev buffer. */
export const memorySink = (): TraceSink & { records: TraceRecord[] } => {
    const records: TraceRecord[] = [];
    return {
        records,
        write(record) {
            records.push(record);
        },
    };
};

/** Formats each record as one JSON line and hands it to `write` (a file append in the terminal). */
export const jsonlSink = (write: (line: string) => void): TraceSink => ({
    write(record) {
        write(`${JSON.stringify(record)}\n`);
    },
});

/** Redacts secret-looking fields at the boundary, then delegates. Compose over any sink. */
export const redactingSink = (inner: TraceSink): TraceSink => ({
    write(record) {
        inner.write(redact(record));
    },
    flush() {
        inner.flush?.();
    },
});

/** Fans one record out to several sinks (e.g. a memory buffer + a file). */
export const fanoutSink = (...sinks: TraceSink[]): TraceSink => ({
    write(record) {
        for (const sink of sinks) {
            sink.write(record);
        }
    },
    flush() {
        for (const sink of sinks) {
            sink.flush?.();
        }
    },
});
