import { useCallback, useRef } from 'react';

import { createFlow, fetchBlockLogs, loadFlow } from '../api';
import { useCreateFlowMutation, useLoadFlowQuery, useSaveFlowMutation } from './queries';
import { useFlowsStore } from '../stores/useFlowsStore';

import type { LoadFlowResult, SaveFlowBody } from '../types';
import type { LogEntry } from '@lemoncloud/eureka-flows-api';

// LocalStorage key for persisting current flow ID
const FLOW_ID_STORAGE_KEY = 'flows-current-flow-id';

/**
 * Get saved flow ID from localStorage
 */
const getSavedFlowId = (): string | null => {
    try {
        return localStorage.getItem(FLOW_ID_STORAGE_KEY);
    } catch {
        return null;
    }
};

/**
 * Save flow ID to localStorage
 */
const saveFlowIdToStorage = (flowId: string): void => {
    try {
        localStorage.setItem(FLOW_ID_STORAGE_KEY, flowId);
    } catch {
        console.warn('Failed to save flow ID to localStorage');
    }
};

/**
 * Hook for managing workflows/flows
 *
 * Backend API support:
 * - POST /flows/:id/save (create with id='0', update with existing id)
 * - GET /flows/:id/load (load flow snapshot)
 *
 * Flow ID is persisted in localStorage for session continuity.
 *
 * NOTE: Execution state is managed at the NODE level via useExecution hook.
 * This hook only manages flow metadata (name, save/load).
 */
export const useFlows = () => {
    const {
        currentFlowId,
        flowName,
        isAutoSaveEnabled,
        setCurrentFlowId,
        setFlowName,
        setLastSavedAt,
        toggleAutoSave,
    } = useFlowsStore();

    const autoSaveTimerRef = useRef<number | null>(null);

    // TanStack Query hooks
    const loadFlowQuery = useLoadFlowQuery(currentFlowId);

    // TanStack Mutations
    const createFlowMutation = useCreateFlowMutation();
    const saveFlowMutation = useSaveFlowMutation();

    /**
     * Initialize flow - load from localStorage or create new
     * This should be called during app boot.
     *
     * @returns LoadFlowResult if flow loaded, null if new flow created
     */
    const initializeFlow = useCallback(async (): Promise<{
        flowId: string;
        flowData: LoadFlowResult | null;
        isNew: boolean;
    }> => {
        // Check localStorage for saved flow ID
        const savedFlowId = getSavedFlowId();

        if (savedFlowId) {
            console.log('[useFlows] Found saved flow ID:', savedFlowId);
            try {
                // Try to load existing flow
                const flowData = await loadFlow(savedFlowId);
                setCurrentFlowId(savedFlowId);
                if (flowData.name) {
                    setFlowName(flowData.name);
                }
                return { flowId: savedFlowId, flowData, isNew: false };
            } catch (err) {
                console.warn('[useFlows] Failed to load saved flow, creating new:', err);
                // Fall through to create new flow
            }
        }

        // No saved flow or failed to load - create new flow
        console.log('[useFlows] Creating new flow via POST /flows/0/save');
        try {
            const result = await createFlow({ nodes: [], edges: [] });
            const newFlowId = result.id;

            if (newFlowId) {
                setCurrentFlowId(newFlowId);
                saveFlowIdToStorage(newFlowId);
                setFlowName('Untitled Workflow');
                return { flowId: newFlowId, flowData: null, isNew: true };
            }
        } catch (err) {
            console.error('[useFlows] Failed to create new flow:', err);
        }

        // Fallback: use a local ID (won't persist to server until save)
        const fallbackId = `local-${Date.now()}`;
        setCurrentFlowId(fallbackId);
        setFlowName('Untitled Workflow');
        return { flowId: fallbackId, flowData: null, isNew: true };
    }, [setCurrentFlowId, setFlowName]);

    /**
     * Load a specific flow by ID
     * GET /flows/:id/load
     */
    const loadFlowById = useCallback(
        async (id: string): Promise<LoadFlowResult | null> => {
            if (!id) {
                console.warn('[useFlows] loadFlowById called without ID');
                return null;
            }

            console.log('[useFlows] Loading flow:', id);
            setCurrentFlowId(id);
            saveFlowIdToStorage(id);

            try {
                const flowData = await loadFlow(id);
                if (flowData.name) {
                    setFlowName(flowData.name);
                }
                return flowData;
            } catch (err) {
                console.error('[useFlows] Failed to load flow:', err);
                return null;
            }
        },
        [setCurrentFlowId, setFlowName]
    );

    /**
     * Save current flow
     * POST /flows/:id/save
     *
     * If no currentFlowId, creates new flow first via POST /flows/0/save
     */
    const saveCurrentFlow = useCallback(
        async (
            body: Partial<SaveFlowBody> & { connections?: SaveFlowBody['edges'] }
        ): Promise<{ success: boolean; id: string }> => {
            try {
                // Support both 'edges' (API format) and 'connections' (UI format)
                const { nodes = [], edges, connections } = body;
                const edgesData = edges ?? connections ?? [];

                const saveBody: SaveFlowBody = { nodes, edges: edgesData };

                let flowId = currentFlowId;

                // If no current flow ID, create new flow
                if (!flowId || flowId.startsWith('local-')) {
                    console.log('[useFlows] Creating new flow via POST /flows/0/save');
                    const result = await createFlowMutation.mutateAsync(saveBody);
                    flowId = result.id;

                    if (flowId) {
                        setCurrentFlowId(flowId);
                        saveFlowIdToStorage(flowId);
                    }
                } else {
                    // Save to existing flow
                    console.log('[useFlows] Saving to existing flow:', flowId);
                    await saveFlowMutation.mutateAsync({ id: flowId, body: saveBody });
                }

                setLastSavedAt(new Date());
                return { success: true, id: flowId || '' };
            } catch (error) {
                console.error('[useFlows] Failed to save flow:', error);
                return { success: false, id: '' };
            }
        },
        [currentFlowId, createFlowMutation, saveFlowMutation, setLastSavedAt, setCurrentFlowId]
    );

    /**
     * Create a new flow (local state + server)
     */
    const createNewFlow = useCallback(async (): Promise<string | null> => {
        try {
            console.log('[useFlows] Creating new flow');
            const result = await createFlowMutation.mutateAsync({ nodes: [], edges: [] });
            const newFlowId = result.id;

            if (newFlowId) {
                setCurrentFlowId(newFlowId);
                saveFlowIdToStorage(newFlowId);
                setFlowName('Untitled Workflow');
                setLastSavedAt(null);
                return newFlowId;
            }
            return null;
        } catch (error) {
            console.error('[useFlows] Failed to create new flow:', error);
            return null;
        }
    }, [createFlowMutation, setCurrentFlowId, setFlowName, setLastSavedAt]);

    /**
     * Trigger auto-save with debounce
     */
    const triggerAutoSave = useCallback(
        (saveCallback: () => Promise<void>) => {
            if (!isAutoSaveEnabled) return;

            if (autoSaveTimerRef.current) {
                window.clearTimeout(autoSaveTimerRef.current);
            }

            autoSaveTimerRef.current = window.setTimeout(() => {
                saveCallback();
            }, 2000);
        },
        [isAutoSaveEnabled]
    );

    /**
     * Fetch logs for a block/node
     */
    const getBlockLogs = useCallback(async (nodeId: string): Promise<LogEntry[]> => {
        return fetchBlockLogs(nodeId);
    }, []);

    // Derive loading/saving states from TanStack Query
    const isLoading = loadFlowQuery.isLoading || loadFlowQuery.isFetching;
    const isSaving = createFlowMutation.isPending || saveFlowMutation.isPending;

    // Get lastSavedAt from store (set after successful save)
    const { lastSavedAt } = useFlowsStore();

    return {
        // State
        currentFlowId,
        flowName,
        isLoading,
        isSaving,
        lastSavedAt,
        isAutoSaveEnabled,

        // Query data
        flowSnapshot: loadFlowQuery.data,

        // Actions - Initialize & Load
        initializeFlow,
        loadFlowById,

        // Actions - Save & Create
        saveCurrentFlow,
        createNewFlow,

        // Actions - Local State
        setFlowName,
        toggleAutoSave,
        triggerAutoSave,

        // Actions - Logs
        getBlockLogs,

        // Query states for advanced usage
        loadFlowQuery,

        // Storage helpers
        getSavedFlowId,
        saveFlowIdToStorage,
    };
};
