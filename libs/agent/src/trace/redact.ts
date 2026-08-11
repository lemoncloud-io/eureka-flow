import type { TraceRecord } from './sink';
import type { TraceContext } from './tracer';

/** Key names whose values must never appear in a record. Deliberately broad: matching "key" also redacts "apiKey". */
const SECRET_KEY_PATTERN = /key|token|secret|password|credential|authorization/i;
const REDACTED = '[redacted]';
/** Stands in for a subtree past `MAX_DEPTH`. The bound FAILS CLOSED: unscanned structure is dropped, never emitted verbatim. */
const DEPTH_LIMITED = '[depth-limited]';
/**
 * Generous recursion bound — a guard against cyclic/runaway payloads, not a real limit (trace payloads are
 * shallow JSON). Arrays cost a level too (see {@link redactValue}), so this is deeper than the object nesting
 * alone would need: a graph snapshot spends one on `graph`, one on the `nodes` array, one on the node, and one
 * on its `config` before any config nesting starts.
 */
const MAX_DEPTH = 12;

/**
 * Redact one value: arrays map element-wise (transparent); plain objects recurse so nested secret keys are
 * caught at any depth. Every container costs a level of `depth` — arrays included, so a cyclic array cannot
 * recurse forever — and hitting the bound yields `DEPTH_LIMITED`, never the unscanned value itself.
 */
const redactValue = (value: unknown, depth: number): unknown => {
    if (value === null || typeof value !== 'object') return value;
    if (depth <= 0) return DEPTH_LIMITED;
    if (Array.isArray(value)) {
        return value.map(item => redactValue(item, depth - 1));
    }
    return redactObject(value as Record<string, unknown>, depth - 1);
};

const redactObject = (obj: Record<string, unknown>, depth = MAX_DEPTH): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        out[key] = SECRET_KEY_PATTERN.test(key) ? REDACTED : redactValue(value, depth);
    }
    return out;
};

/** A copy of the record with secret-looking keys in `context` and `fields` replaced by "[redacted]", at any depth. */
export const redact = (record: TraceRecord): TraceRecord => ({
    ...record,
    context: redactObject(record.context) as TraceContext,
    fields: redactObject(record.fields),
});
