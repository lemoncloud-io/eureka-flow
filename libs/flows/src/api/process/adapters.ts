/**
 * Field adapters between frontend (processId) and server (flowId).
 *
 * Server uses `flowId` everywhere. Frontend renamed to `processId`.
 * These helpers transform at the API boundary so the rest of the app only sees `processId`.
 *
 * Recursion is intentionally limited to the keys whose values are arrays of
 * sub-entities (stages, tasks, notes). This keeps the walk shallow so large
 * opaque payloads (node I/O blobs, $meta, port data) pass through by reference
 * and aren't deep-cloned or key-renamed.
 */

const RECURSE_KEYS = new Set(['stages', 'tasks', 'notes']);

/** Deep rename: flowId → processId in server response data */
export const fromServer = <T>(data: T): T => {
    if (data === null || data === undefined) return data;
    if (Array.isArray(data)) return data.map(fromServer) as T;
    if (typeof data !== 'object') return data;

    const obj = data as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        result[key] = RECURSE_KEYS.has(key) && Array.isArray(value) ? value.map(fromServer) : value;
    }
    return result as T;
};

/** Rename processId → flowId in request body for server */
export const toServer = <T>(data: T): T => {
    if (data === null || data === undefined) return data;
    if (Array.isArray(data)) return data.map(toServer) as T;
    if (typeof data !== 'object') return data;

    const obj = data as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        result[key] = RECURSE_KEYS.has(key) && Array.isArray(value) ? value.map(toServer) : value;
    }
    return result as T;
};

/**
 * extract only the defined attribute.
 * ex) `{ a:1, b: undefined }` -> `{ a:1 }`
 */
export const onlyDefined = <T>(N: T) =>
    N && typeof N === 'object'
        ? Object.entries(N).reduce<T>((N, [k, v]) => {
              if (v !== undefined) N[k as keyof T] = v;
              return N;
          }, {} as T)
        : (null as T);
