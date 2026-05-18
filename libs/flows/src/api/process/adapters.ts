/**
 * Field adapters between frontend (processId) and server (flowId).
 *
 * Server uses `flowId` everywhere. Frontend renamed to `processId`.
 * These helpers transform at the API boundary so the rest of the app only sees `processId`.
 */

/** Deep rename: flowId → processId in server response data */
export const fromServer = <T>(data: T): T => {
    if (data === null || data === undefined) return data;
    if (Array.isArray(data)) return data.map(fromServer) as T;
    if (typeof data !== 'object') return data;

    const obj = data as Record<string, any>;
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
        const newKey = key === 'flowId' ? 'processId' : key;
        if (key === 'stages' && Array.isArray(value)) {
            result[newKey] = value.map(fromServer);
        } else if (key === 'tasks' && Array.isArray(value)) {
            result[newKey] = value.map(fromServer);
        } else if (key === 'notes' && Array.isArray(value)) {
            result[newKey] = value.map(fromServer);
        } else {
            result[newKey] = value;
        }
    }

    return result as T;
};

/** Rename processId → flowId in request body for server */
export const toServer = <T>(data: T): T => {
    if (data === null || data === undefined) return data;
    if (typeof data !== 'object') return data;

    const obj = data as Record<string, any>;
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
        const newKey = key === 'processId' ? 'flowId' : key;
        result[newKey] = value;
    }

    return result as T;
};
