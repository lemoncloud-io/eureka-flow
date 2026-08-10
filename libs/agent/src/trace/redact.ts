import type { TraceRecord } from './sink';
import type { TraceContext } from './tracer';

/** Key names whose values must never appear in a record. Deliberately broad: matching "key" also redacts "apiKey". */
const SECRET_KEY_PATTERN = /key|token|secret|password|credential|authorization/i;
const REDACTED = '[redacted]';
/** Generous recursion bound — a guard against cyclic/runaway payloads, not a real limit (trace payloads are shallow JSON). */
const MAX_DEPTH = 8;

/** Redact one value: arrays map element-wise (transparent); plain objects recurse so nested secret keys are caught at any depth. */
const redactValue = (value: unknown, depth: number): unknown => {
    if (Array.isArray(value)) {
        return value.map(item => redactValue(item, depth));
    }
    if (depth > 0 && value !== null && typeof value === 'object') {
        return redactObject(value as Record<string, unknown>, depth - 1);
    }
    return value;
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
