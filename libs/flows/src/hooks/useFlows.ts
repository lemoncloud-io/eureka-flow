import { useCallback, useRef } from 'react';

import { fetchBlockLogs, listFlows, loadDesign, loadFlow, saveFlow } from '../api';
import { useFlowsStore } from '../stores/useFlowsStore';

import type { LogEntry, WorkflowState } from '../api';

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
     * Load all available flows
     */
    const loadFlowsList = useCallback(async () => {
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
        async (id?: string) => {
            setLoading(true);
            try {
                const flow = await loadFlow(id);
                if (id) {
                    setCurrentFlowId(id);
                    const flowsList = await listFlows();
                    const meta = flowsList.find(f => f.id === id);
                    if (meta) {
                        setFlowName(meta.name);
                    }
                }
                return flow;
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
     * Load flow design by ID
     */
    const loadFlowDesign = useCallback(
        async (id: string) => {
            setLoading(true);
            try {
                const design = await loadDesign(id);
                return design;
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
     * Save current flow
     */
    const saveCurrentFlow = useCallback(
        async (state: WorkflowState, silent = false) => {
            if (!silent) setLoading(true);
            else setSaving(true);

            try {
                const result = await saveFlow(state, flowName);
                if (result.success) {
                    setLastSavedAt(new Date());
                    if (result.id !== currentFlowId) {
                        setCurrentFlowId(result.id);
                    }
                }
                return result;
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
     * Create a new flow
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
     * Fetch logs for a block
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

        // Actions
        loadFlowsList,
        loadFlowById,
        loadFlowDesign,
        saveCurrentFlow,
        triggerAutoSave,
        createNewFlow,
        getBlockLogs,
        setFlowName,
        toggleAutoSave,
    };
};
