import type { TraceSink } from './sink';
import type { TraceContext, Tracer } from './tracer';

/**
 * Build a {@link Tracer} over a {@link TraceSink}. `child` accumulates context immutably (child keys win),
 * and `now` is injected (default Date.now) so runs are deterministic in tests.
 */
export const createTracer = (sink: TraceSink, now: () => number = Date.now, context: TraceContext = {}): Tracer => ({
    emit: ({ name, level = 'debug', fields = {} }) => sink.write({ ts: now(), name, level, context, fields }),
    child: extra => createTracer(sink, now, { ...context, ...extra }),
});

/** The default for every `tracer` dep: does nothing, and its children do nothing (Null Object). */
export const NoopTracer: Tracer = {
    emit: () => {
        // intentionally empty
    },
    child: () => NoopTracer,
};
