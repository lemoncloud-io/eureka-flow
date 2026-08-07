import type { TraceRecord } from './sink';
import type { TraceContext } from './tracer';

/** Key names whose values must never appear in a record. Deliberately broad: matching "key" also redacts "apiKey". */
const SECRET_KEY_PATTERN = /key|token|secret|password|credential|authorization/i;
const REDACTED = '[redacted]';
const MAX_DEPTH = 3;

const redactObject = (json: Record<string, unknown>, depth = MAX_DEPTH): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(json)) {
        if (SECRET_KEY_PATTERN.test(key)) {
            out[key] = REDACTED;
        } else if (depth > 1 && value !== null && typeof value === 'object' && !Array.isArray(value)) {
            out[key] = redactObject(value as Record<string, unknown>, depth - 1);
        } else {
            out[key] = value;
        }
    }
    return out;
};

/** A copy of the record with secret-looking keys in `context` and `fields` replaced by "[redacted]". */
export const redact = (record: TraceRecord): TraceRecord => ({
    ...record,
    context: redactObject(record.context) as TraceContext,
    fields: redactObject(record.fields),
});
