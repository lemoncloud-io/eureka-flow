import { useCallback, useRef } from 'react';

import { fetchBlockLogs } from '../api';
import {
    useCreateFlowMutation,
    useDeleteFlowMutation,
    useFlowQuery,
    useFlowSnapshotQuery,
    useFlowsListQuery,
    useSaveFlowSnapshotMutation,
    useUpdateFlowMutation,
} from './queries';
import { useFlowsStore } from '../stores/useFlowsStore';

import type { FlowBody, SaveSnapshotBody, SnapShotResult } from '../types';
import type { LogEntry } from '@lemoncloud/eureka-flows-api';

/**
 * Hook for managing workflows/flows
 *
 * Uses TanStack Query for server state management.
 * Zustand store is used only for UI state (currentFlowId, flowName, autoSave settings).
 *
 * NOTE: Execution state is managed at the NODE level via useExecution hook.
 * This hook only manages flow metadata (name, list, save/load).
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
    const flowsListQuery = useFlowsListQuery();
    const flowQuery = useFlowQuery(currentFlowId);
    const flowSnapshotQuery = useFlowSnapshotQuery(currentFlowId);

    // TanStack Mutations
    const createFlowMutation = useCreateFlowMutation();
    const updateFlowMutation = useUpdateFlowMutation();
    const deleteFlowMutation = useDeleteFlowMutation();
    const saveSnapshotMutation = useSaveFlowSnapshotMutation();

    /**
     * Load all available flows from API (refetch)
     */
    const loadFlowsList = useCallback(async () => {
        const result = await flowsListQuery.refetch();
        return result.data ?? [];
    }, [flowsListQuery]);

    /**
     * Load a specific flow by ID
     */
    const loadFlowById = useCallback(
        async (id?: string): Promise<SnapShotResult | null> => {
            if (!id) {
                // Get first flow from list
                const listResult = await flowsListQuery.refetch();
                const flows = listResult.data ?? [];
                if (flows.length > 0 && flows[0].id) {
                    id = flows[0].id;
                } else {
                    return null;
                }
            }

            setCurrentFlowId(id);
            const result = await flowSnapshotQuery.refetch();
            if (result.data?.name) {
                setFlowName(result.data.name);
            }
            return result.data ?? null;
        },
        [flowsListQuery, flowSnapshotQuery, setCurrentFlowId, setFlowName]
    );

    /**
     * Load flow design (snapshot) by ID
     * Note: For a different ID than currentFlowId, use useFlowSnapshotQuery directly
     */
    const loadFlowDesign = useCallback(
        async (id: string): Promise<SnapShotResult | null> => {
            if (id === currentFlowId) {
                const result = await flowSnapshotQuery.refetch();
                return result.data ?? null;
            }
            // For different ID, set it as current and refetch
            setCurrentFlowId(id);
            const result = await flowSnapshotQuery.refetch();
            return result.data ?? null;
        },
        [currentFlowId, flowSnapshotQuery, setCurrentFlowId]
    );

    /**
     * Get flow metadata by ID
     */
    const getFlowById = useCallback(
        async (id: string) => {
            if (id === currentFlowId && flowQuery.data) {
                return flowQuery.data;
            }
            // For different ID, refetch
            const result = await flowQuery.refetch();
            return result.data;
        },
        [currentFlowId, flowQuery]
    );

    /**
     * Save current flow (create or update)
     *
     * Supports two modes:
     * 1. Save full workflow (nodes + edges) via POST /flows/:id/save
     * 2. Save metadata only via PUT /flows/:id (legacy)
     *
     * NOTE: Accepts both 'edges' and 'connections' keys for backwards compatibility.
     */
    const saveCurrentFlow = useCallback(
        async (
            body: FlowBody & Partial<SaveSnapshotBody> & { connections?: SaveSnapshotBody['edges'] }
        ): Promise<{ success: boolean; id: string }> => {
            try {
                // Support both 'edges' (API format) and 'connections' (UI format)
                const { nodes, edges, connections, ...metadataBody } = body;
                const edgesData = edges ?? connections;
                const hasWorkflowData = nodes && edgesData;

                if (currentFlowId) {
                    // Save full workflow if nodes and edges are provided
                    if (hasWorkflowData) {
                        await saveSnapshotMutation.mutateAsync({
                            id: currentFlowId,
                            body: { nodes, edges: edgesData },
                        });
                    } else {
                        // Update metadata only (legacy mode)
                        await updateFlowMutation.mutateAsync({
                            id: currentFlowId,
                            body: { ...metadataBody, name: flowName },
                        });
                    }
                    setLastSavedAt(new Date());
                    return { success: true, id: currentFlowId };
                } else {
                    // Create new flow first, then save snapshot
                    const result = await createFlowMutation.mutateAsync({ ...metadataBody, name: flowName });
                    if (result.id) {
                        setCurrentFlowId(result.id);
                        // Save workflow data if provided
                        if (hasWorkflowData) {
                            await saveSnapshotMutation.mutateAsync({
                                id: result.id,
                                body: { nodes, edges: edgesData },
                            });
                        }
                    }
                    setLastSavedAt(new Date());
                    return { success: true, id: result.id || '' };
                }
            } catch (error) {
                console.error('Failed to save flow:', error);
                return { success: false, id: '' };
            }
        },
        [
            flowName,
            currentFlowId,
            updateFlowMutation,
            createFlowMutation,
            saveSnapshotMutation,
            setLastSavedAt,
            setCurrentFlowId,
        ]
    );

    /**
     * Create a new flow
     */
    const createNewFlowRemote = useCallback(
        async (name: string, body?: FlowBody) => {
            const result = await createFlowMutation.mutateAsync({ name, ...body });
            if (result.id) {
                setCurrentFlowId(result.id);
                setFlowName(name);
            }
            return result;
        },
        [createFlowMutation, setCurrentFlowId, setFlowName]
    );

    /**
     * Delete a flow
     */
    const deleteFlowById = useCallback(
        async (id: string): Promise<void> => {
            await deleteFlowMutation.mutateAsync(id);
            if (currentFlowId === id) {
                setCurrentFlowId(null);
                setFlowName('Untitled Workflow');
            }
        },
        [currentFlowId, deleteFlowMutation, setCurrentFlowId, setFlowName]
    );

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
     * Create a new flow (local state only, for UI)
     */
    const createNewFlow = useCallback(
        (newId: string) => {
            setCurrentFlowId(newId);
            setFlowName('Untitled Workflow');
            setLastSavedAt(null);
        },
        [setCurrentFlowId, setFlowName, setLastSavedAt]
    );

    /**
     * Fetch logs for a block/node
     */
    const getBlockLogs = useCallback(async (nodeId: string): Promise<LogEntry[]> => {
        return fetchBlockLogs(nodeId);
    }, []);

    // Derive loading/saving states from TanStack Query
    const isLoading =
        flowsListQuery.isLoading || flowQuery.isLoading || flowSnapshotQuery.isLoading || flowSnapshotQuery.isFetching;

    const isSaving = createFlowMutation.isPending || updateFlowMutation.isPending || saveSnapshotMutation.isPending;

    // Get lastSavedAt from store (set after successful save)
    const { lastSavedAt } = useFlowsStore();

    return {
        // State (derived from TanStack Query)
        currentFlowId,
        flowName,
        flows: flowsListQuery.data ?? [],
        isLoading,
        isSaving,
        lastSavedAt,
        isAutoSaveEnabled,

        // Query data
        flowSnapshot: flowSnapshotQuery.data,

        // Actions - List & Load
        loadFlowsList,
        loadFlowById,
        loadFlowDesign,
        getFlowById,

        // Actions - CRUD
        saveCurrentFlow,
        createNewFlowRemote,
        deleteFlowById,

        // Actions - Local State
        createNewFlow,
        setFlowName,
        toggleAutoSave,
        triggerAutoSave,

        // Actions - Logs
        getBlockLogs,

        // Query states for advanced usage
        flowsListQuery,
        flowSnapshotQuery,
    };
};
