/**
 * Field adapters between frontend (processId) and server (flowId).
 *
 * Server uses `flowId` everywhere. Frontend renamed to `processId`.
 * These helpers transform at the API boundary so the rest of the app only sees `processId`.
 */

/** Keys whose object values are opaque user data and must NOT have their inner keys renamed. */
const OPAQUE_KEYS = new Set(['$meta', 'meta']);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

/** Deep rename: flowId → processId in server response data */
export const fromServer = <T>(data: T): T => {
    if (data === null || data === undefined) return data;
    if (Array.isArray(data)) return data.map(fromServer) as T;
    if (!isPlainObject(data)) return data;

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
        const newKey = key === 'flowId' ? 'processId' : key;
        result[newKey] = OPAQUE_KEYS.has(key) ? value : fromServer(value);
    }
    return result as T;
};

/** Rename processId → flowId in request body for server */
export const toServer = <T>(data: T): T => {
    if (data === null || data === undefined) return data;
    if (Array.isArray(data)) return data.map(toServer) as T;
    if (!isPlainObject(data)) return data;

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
        const newKey = key === 'processId' ? 'flowId' : key;
        result[newKey] = OPAQUE_KEYS.has(key) ? value : toServer(value);
    }
    return result as T;
};
