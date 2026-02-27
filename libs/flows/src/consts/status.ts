import type { NodeState } from '../types';

/**
 * Valid node state values for runtime validation
 */
const VALID_STATES: ReadonlySet<string> = new Set(['IDLE', 'READY', 'RUNNING', 'COMPLETED', 'ERROR']);

/**
 * Node state priority for comparing state updates
 * Higher number = more "final" state
 * Used to prevent race conditions between frontend/socket/API updates
 *
 * ERROR has highest priority (4) because it's a terminal failure state
 * that should not be overwritten by COMPLETED or other states.
 */
export const STATE_PRIORITY: Record<string, number> = {
    IDLE: 0,
    READY: 1,
    RUNNING: 2,
    COMPLETED: 3,
    ERROR: 4, // Terminal failure - highest priority
};

/**
 * Get priority value for a state string
 * @param state - Node state string
 * @returns Priority number (-1 if unknown)
 */
export const getStatePriority = (state?: string): number => {
    return STATE_PRIORITY[state ?? ''] ?? -1;
};

/**
 * Check if server state should update current state
 * Only updates if server state is equal or higher priority
 * @param current - Current node state
 * @param server - Server-provided state
 * @returns true if should update to server state
 */
export const shouldUpdateState = (current?: string, server?: string): boolean => {
    return getStatePriority(server) >= getStatePriority(current);
};

/**
 * Get effective state from node (state preferred, status as fallback)
 * Use this during migration period for backward compatibility
 * @param state - Node state field (preferred)
 * @param status - Node status field (deprecated fallback)
 * @returns Effective state value, or undefined if invalid
 */
export const getEffectiveState = (state?: string, status?: string): NodeState | undefined => {
    const value = state ?? status;
    if (!value) return undefined;
    return VALID_STATES.has(value) ? (value as NodeState) : undefined;
};
