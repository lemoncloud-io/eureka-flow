import type { NodeState } from '../types';

/**
 * Valid node state values for runtime validation
 */
const VALID_STATES: ReadonlySet<string> = new Set(['IDLE', 'READY', 'RUNNING', 'COMPLETED', 'ERROR']);

/**
 * Fallback timeout for polling node state when WebSocket doesn't deliver
 * the final state (COMPLETED/ERROR) after async execution.
 * After this duration, the client polls the server API for the actual state.
 */
export const EXECUTION_FALLBACK_TIMEOUT_MS = 60 * 1000; // 1 minute

/**
 * Which state updates may overwrite which — a graph rule, so `@flows/engine` owns it and
 * the reducer and the canvas guards read the same table. ERROR outranks COMPLETED, so a
 * late success cannot bury a failure.
 */
export { shouldUpdateState } from '@flows/engine';

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
