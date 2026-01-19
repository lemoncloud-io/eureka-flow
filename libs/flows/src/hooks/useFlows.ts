import { useCallback, useRef } from 'react';

import { createFlow, deleteFlow, fetchBlockLogs, getFlow, getFlowSnapshot, listFlows, updateFlow } from '../api';
import { useFlowsStore } from '../stores/useFlowsStore';

import type { FlowBody, FlowView, SnapShotResult } from '../types';
import type { LogEntry } from '@lemoncloud/eureka-flows-api';

/**
 * Hook for managing workflows/flows
 */
export const useFlows = () => {
    const {
        currentFlowId,
        flowName,
        flows,
        isLoading,
        isSaving,
        lastSavedAt,
        isAutoSaveEnabled,
        executionStatus,
        activeRunId,
        setCurrentFlowId,
        setFlowName,
        setFlows,
        setLoading,
        setSaving,
        setLastSavedAt,
        toggleAutoSave,
    } = useFlowsStore();

    const autoSaveTimerRef = useRef<number | null>(null);

    /**
     * Load all available flows from API
     */
    const loadFlowsList = useCallback(async (): Promise<FlowView[]> => {
        try {
            const flowsList = await listFlows();
            setFlows(flowsList);
            return flowsList;
        } catch (error) {
            console.error('Failed to load flows list:', error);
            return [];
        }
    }, [setFlows]);

    /**
     * Load a specific flow by ID
     */
    const loadFlowById = useCallback(
        async (id?: string): Promise<SnapShotResult | null> => {
            setLoading(true);
            try {
                if (!id) {
                    const flowsList = await listFlows();
                    if (flowsList.length > 0 && flowsList[0].id) {
                        id = flowsList[0].id;
                    } else {
                        return null;
                    }
                }

                const snapshot = await getFlowSnapshot(id);
                setCurrentFlowId(id);
                if (snapshot.name) {
                    setFlowName(snapshot.name);
                }
                return snapshot;
            } catch (error) {
                console.error('Failed to load flow:', error);
                throw error;
            } finally {
                setLoading(false);
            }
        },
        [setLoading, setCurrentFlowId, setFlowName]
    );

    /**
     * Load flow design (snapshot) by ID
     */
    const loadFlowDesign = useCallback(
        async (id: string): Promise<SnapShotResult> => {
            setLoading(true);
            try {
                const snapshot = await getFlowSnapshot(id);
                return snapshot;
            } catch (error) {
                console.error('Failed to load design:', error);
                throw error;
            } finally {
                setLoading(false);
            }
        },
        [setLoading]
    );

    /**
     * Get flow metadata by ID
     */
    const getFlowById = useCallback(async (id: string): Promise<FlowView> => {
        return getFlow(id);
    }, []);

    /**
     * Save current flow (create or update)
     */
    const saveCurrentFlow = useCallback(
        async (body: FlowBody, silent = false): Promise<{ success: boolean; id: string }> => {
            if (!silent) setLoading(true);
            else setSaving(true);

            try {
                let result: FlowView;

                if (currentFlowId) {
                    // Update existing flow
                    result = await updateFlow(currentFlowId, { ...body, name: flowName });
                } else {
                    // Create new flow
                    result = await createFlow({ ...body, name: flowName });
                    if (result.id) {
                        setCurrentFlowId(result.id);
                    }
                }

                setLastSavedAt(new Date());
                return { success: true, id: result.id || '' };
            } catch (error) {
                console.error('Failed to save flow:', error);
                return { success: false, id: '' };
            } finally {
                if (!silent) setLoading(false);
                else setTimeout(() => setSaving(false), 500);
            }
        },
        [flowName, currentFlowId, setLoading, setSaving, setLastSavedAt, setCurrentFlowId]
    );

    /**
     * Create a new flow
     */
    const createNewFlowRemote = useCallback(
        async (name: string, body?: FlowBody): Promise<FlowView> => {
            setLoading(true);
            try {
                const result = await createFlow({ name, ...body });
                if (result.id) {
                    setCurrentFlowId(result.id);
                    setFlowName(name);
                }
                await loadFlowsList();
                return result;
            } catch (error) {
                console.error('Failed to create flow:', error);
                throw error;
            } finally {
                setLoading(false);
            }
        },
        [setLoading, setCurrentFlowId, setFlowName, loadFlowsList]
    );

    /**
     * Delete a flow
     */
    const deleteFlowById = useCallback(
        async (id: string): Promise<void> => {
            setLoading(true);
            try {
                await deleteFlow(id);
                if (currentFlowId === id) {
                    setCurrentFlowId(null);
                    setFlowName('Untitled Workflow');
                }
                await loadFlowsList();
            } catch (error) {
                console.error('Failed to delete flow:', error);
                throw error;
            } finally {
                setLoading(false);
            }
        },
        [currentFlowId, setLoading, setCurrentFlowId, setFlowName, loadFlowsList]
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

    return {
        // State
        currentFlowId,
        flowName,
        flows,
        isLoading,
        isSaving,
        lastSavedAt,
        isAutoSaveEnabled,
        executionStatus,
        activeRunId,

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
    };
};
