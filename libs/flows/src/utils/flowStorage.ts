/**
 * Flow storage utilities
 *
 * Persists flow-related data to localStorage for session continuity.
 */

import type { Viewport } from '../stores/useCanvasStore';

const FLOW_ID_STORAGE_KEY = 'flows-current-flow-id';
const AUTO_SAVE_STORAGE_KEY = 'flows-auto-save-enabled';
const VIEWPORT_STORAGE_KEY = 'eureka-flow:viewports';
const MAX_VIEWPORT_ENTRIES = 50;

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

    /**
     * Get auto-save enabled state from localStorage
     */
    getAutoSaveEnabled: (): boolean => {
        try {
            const value = localStorage.getItem(AUTO_SAVE_STORAGE_KEY);
            return value === 'true';
        } catch {
            return false;
        }
    },

    /**
     * Save auto-save enabled state to localStorage
     */
    setAutoSaveEnabled: (enabled: boolean): void => {
        try {
            localStorage.setItem(AUTO_SAVE_STORAGE_KEY, String(enabled));
        } catch {
            console.warn('[flowStorage] Failed to save auto-save setting');
        }
    },

    getViewport: (flowId: string): Viewport | null => {
        try {
            const stored = JSON.parse(localStorage.getItem(VIEWPORT_STORAGE_KEY) || '{}');
            return stored[flowId] ?? null;
        } catch {
            return null;
        }
    },

    saveViewport: (flowId: string, vp: Viewport): void => {
        try {
            const stored = JSON.parse(localStorage.getItem(VIEWPORT_STORAGE_KEY) || '{}');
            delete stored[flowId];
            stored[flowId] = vp;
            const keys = Object.keys(stored);
            if (keys.length > MAX_VIEWPORT_ENTRIES) {
                delete stored[keys[0]];
            }
            localStorage.setItem(VIEWPORT_STORAGE_KEY, JSON.stringify(stored));
        } catch {
            /* ignore */
        }
    },
};
