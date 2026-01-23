/**
 * Flow ID storage utilities
 *
 * Persists the current flow ID to localStorage for session continuity.
 */

const FLOW_ID_STORAGE_KEY = 'flows-current-flow-id';

export const flowStorage = {
    /**
     * Get saved flow ID from localStorage
     */
    getFlowId: (): string | null => {
        try {
            return localStorage.getItem(FLOW_ID_STORAGE_KEY);
        } catch {
            return null;
        }
    },

    /**
     * Save flow ID to localStorage
     */
    setFlowId: (flowId: string): void => {
        try {
            localStorage.setItem(FLOW_ID_STORAGE_KEY, flowId);
        } catch {
            console.warn('[flowStorage] Failed to save flow ID');
        }
    },

    /**
     * Clear saved flow ID from localStorage
     */
    clearFlowId: (): void => {
        try {
            localStorage.removeItem(FLOW_ID_STORAGE_KEY);
        } catch {
            // Silently ignore - non-critical operation
        }
    },
};
