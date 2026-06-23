/**
 * Temporary ID utilities.
 *
 * New nodes/edges are created with a client-side temporary ID so the UI can
 * render optimistically; the server later assigns the real ID. Any code that
 * talks to the backend must treat temp IDs as "not yet persisted" and skip
 * per-entity mutations (POST upsert) until the real ID is assigned — otherwise
 * the server responds 404 (entity not found).
 *
 * Single source of truth for both the lib (sync hooks) and the app (canvas /
 * mobile editor). Keep prefix detection here so the two layers can never drift.
 */

/** Prefixes used by generateTempId. isTempId matches any of these. */
export const TEMP_ID_PREFIXES = ['temp_', 'edge_', 'node_'] as const;

/** Generate a client-side temporary ID (replaced by the server-assigned ID). */
export const generateTempId = (prefix: 'temp' | 'edge' | 'node' = 'temp'): string =>
    `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

/** Check if an ID is a temporary ID (not yet assigned by the server). */
export const isTempId = (id: string | undefined): boolean => {
    if (!id) return false;
    return TEMP_ID_PREFIXES.some(prefix => id.startsWith(prefix));
};
