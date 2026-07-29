/** True for a JSON object (not an array, not null); narrows to a plain record. Internal to @flows/agent. */
export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
