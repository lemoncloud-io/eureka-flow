import { useCallback, useEffect, useRef } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { createFlow, loadFlow } from '../api';
import { flowsKeys, useCreateFlowMutation, useLoadFlowQuery, useSaveFlowMutation } from './queries';
import { useFlowsStore } from '../stores/useFlowsStore';
import { flowStorage } from '../utils/flowStorage';

import type { SaveStatus } from '../stores/useFlowsStore';
import type { LoadFlowResult, SaveFlowBody } from '../types';

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
    const queryClient = useQueryClient();
    const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSaveBodyRef = useRef<SaveFlowBody | null>(null);
    const {
        currentFlowId,
        flowName,
        isAutoSaveEnabled,
        lastSavedAt,
        saveStatus,
        saveError,
        setCurrentFlowId,
        setFlowName,
        setLastSavedAt,
        toggleAutoSave,
        setSaveStatus,
        setSaveError,
    } = useFlowsStore();

    // Cleanup timeout on unmount to prevent memory leaks
    useEffect(() => {
        return () => {
            if (successTimeoutRef.current) {
                clearTimeout(successTimeoutRef.current);
            }
        };
    }, []);

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
        const savedFlowId = flowStorage.getFlowId();

        if (savedFlowId) {
            console.log('[useFlows] Found saved flow ID:', savedFlowId);
            try {
                // Use queryClient.fetchQuery for caching benefit
                const flowData = await queryClient.fetchQuery({
                    queryKey: flowsKeys.snapshot(savedFlowId),
                    queryFn: () => loadFlow(savedFlowId),
                });
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
                flowStorage.setFlowId(newFlowId);
                setFlowName('Untitled Workflow');
                return { flowId: newFlowId, flowData: null, isNew: true };
            }
        } catch (err) {
            console.error('[useFlows] Failed to create new flow:', err);
        }

        // Fallback: use a local ID (offline mode - will sync on first save)
        const fallbackId = `local-${Date.now()}`;
        setCurrentFlowId(fallbackId);
        setFlowName('Untitled Workflow');
        return { flowId: fallbackId, flowData: null, isNew: true };
    }, [queryClient, setCurrentFlowId, setFlowName]);

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
            flowStorage.setFlowId(id);

            try {
                // Use queryClient.fetchQuery for caching benefit
                const flowData = await queryClient.fetchQuery({
                    queryKey: flowsKeys.snapshot(id),
                    queryFn: () => loadFlow(id),
                });
                if (flowData.name) {
                    setFlowName(flowData.name);
                }
                return flowData;
            } catch (err) {
                console.error('[useFlows] Failed to load flow:', err);
                return null;
            }
        },
        [queryClient, setCurrentFlowId, setFlowName]
    );

    /**
     * Helper to update save status with auto-reset for success state
     */
    const updateSaveStatus = useCallback(
        (status: SaveStatus, error?: Error) => {
            // Clear any pending success timeout
            if (successTimeoutRef.current) {
                clearTimeout(successTimeoutRef.current);
                successTimeoutRef.current = null;
            }

            setSaveStatus(status);
            setSaveError(error ?? null);

            // Auto-reset success status to idle after 2 seconds
            if (status === 'success') {
                successTimeoutRef.current = setTimeout(() => {
                    setSaveStatus('idle');
                    successTimeoutRef.current = null;
                }, 2000);
            }
        },
        [setSaveStatus, setSaveError]
    );

    /**
     * Save current flow
     * POST /flows/:id/save
     *
     * If no currentFlowId, creates new flow first via POST /flows/0/save
     * Uses optimistic updates for seamless UX - no blocking loader shown
     */
    const saveCurrentFlow = useCallback(
        async (
            body: Partial<SaveFlowBody> & { connections?: SaveFlowBody['edges'] }
        ): Promise<{ success: boolean; id: string }> => {
            // Set saving status (subtle indicator, not blocking)
            updateSaveStatus('saving');

            try {
                // Support both 'edges' (API format) and 'connections' (UI format)
                const { nodes = [], edges, connections } = body;
                const edgesData = edges ?? connections ?? [];

                const saveBody: SaveFlowBody = { nodes, edges: edgesData };

                // Store for retry on failure
                lastSaveBodyRef.current = saveBody;

                let flowId = currentFlowId;

                // If no current flow ID, create new flow
                if (!flowId || flowId.startsWith('local-')) {
                    console.log('[useFlows] Creating new flow via POST /flows/0/save');
                    const result = await createFlowMutation.mutateAsync(saveBody);
                    flowId = result.id;

                    if (flowId) {
                        setCurrentFlowId(flowId);
                        flowStorage.setFlowId(flowId);
                    }
                } else {
                    // Save to existing flow (uses optimistic update)
                    console.log('[useFlows] Saving to existing flow:', flowId);
                    await saveFlowMutation.mutateAsync({ id: flowId, body: saveBody });
                }

                setLastSavedAt(new Date());
                updateSaveStatus('success');
                return { success: true, id: flowId || '' };
            } catch (error) {
                console.error('[useFlows] Failed to save flow:', error);
                updateSaveStatus('error', error instanceof Error ? error : new Error('Failed to save flow'));
                return { success: false, id: '' };
            }
        },
        [currentFlowId, createFlowMutation, saveFlowMutation, setLastSavedAt, setCurrentFlowId, updateSaveStatus]
    );

    /**
     * Retry the last failed save operation
     */
    const retrySave = useCallback(async () => {
        if (!lastSaveBodyRef.current) {
            updateSaveStatus('idle');
            return { success: false, id: '' };
        }
        // Retry with stored save body
        return saveCurrentFlow(lastSaveBodyRef.current);
    }, [saveCurrentFlow, updateSaveStatus]);

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
                flowStorage.setFlowId(newFlowId);
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

    // Derive loading state from TanStack Query (only for initial load)
    const isLoading = loadFlowQuery.isLoading || loadFlowQuery.isFetching;

    // isSaving is now derived from saveStatus for backward compatibility
    const isSaving = saveStatus === 'saving';

    // lastSavedAt is already destructured from useFlowsStore at line 28

    return {
        // State
        currentFlowId,
        flowName,
        isLoading,
        isSaving,
        lastSavedAt,
        isAutoSaveEnabled,
        saveStatus,
        saveError,

        // Query data
        flowSnapshot: loadFlowQuery.data,

        // Actions - Initialize & Load
        initializeFlow,
        loadFlowById,

        // Actions - Save & Create
        saveCurrentFlow,
        createNewFlow,
        retrySave,

        // Actions - Local State
        setFlowName,
        toggleAutoSave,
    };
};
