import { useCallback, useEffect, useRef } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { createFlow, loadFlow } from '../api';
import {
    flowsKeys,
    useCreateFlowMutation,
    useLoadFlowQuery,
    useSaveFlowMutation,
    useUpdateFlowMutation,
} from './queries';
import { useFlowsStore } from '../stores/useFlowsStore';
import { flowStorage } from '../utils/flowStorage';
import { getNodeHeight } from '../utils/nodeHeight';

import type { SaveStatus } from '../stores/useFlowsStore';
import type { LoadFlowResult, PublishMeta, SaveFlowBody } from '../types';
import type { NodeData } from '@lemoncloud/eureka-flows-api';

/**
 * Hook for managing workflows/flows
 *
 * Backend API support:
 * - POST /flows/:id/save (create with id='0', update with existing id)
 * - GET /flows/:id/load (load flow snapshot)
 *
 * Flow ID is persisted in localStorage for session continuity.
 * This hook manages flow metadata (name, save/load).
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
        channelId,
        setCurrentFlowId,
        setFlowName,
        setLastSavedAt,
        toggleAutoSave,
        setSaveStatus,
        setSaveError,
        setChannelId,
        flowMeta,
        setFlowMeta,
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
    const updateFlowMutation = useUpdateFlowMutation();

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
                    retry: false, // loadFlow uses withRetry internally
                });
                setCurrentFlowId(savedFlowId);
                if (flowData.name) {
                    setFlowName(flowData.name);
                }
                if (flowData.channelId) {
                    setChannelId(flowData.channelId);
                }
                setFlowMeta((flowData.meta as PublishMeta) ?? null);
                return { flowId: savedFlowId, flowData, isNew: false };
            } catch (err) {
                console.warn('[useFlows] Failed to load saved flow, creating new:', err);
                // Fall through to create new flow
            }
        }

        // No saved flow or failed to load - create new flow
        console.log('[useFlows] Creating new flow via POST /flows/0/save');
        const result = await createFlow({ nodes: [], edges: [] });
        const newFlowId = result.id;

        if (!newFlowId) {
            throw new Error('Failed to create new flow: no ID returned');
        }

        setCurrentFlowId(newFlowId);
        flowStorage.setFlowId(newFlowId);
        setFlowName('Untitled Workflow');
        setFlowMeta(null);
        return { flowId: newFlowId, flowData: null, isNew: true };
    }, [queryClient, setCurrentFlowId, setFlowName, setChannelId, setFlowMeta]);

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
                    retry: false, // loadFlow uses withRetry internally
                });
                if (flowData.name) {
                    setFlowName(flowData.name);
                }
                if (flowData.channelId) {
                    setChannelId(flowData.channelId);
                }
                setFlowMeta((flowData.meta as PublishMeta) ?? null);
                return flowData;
            } catch (err) {
                console.error('[useFlows] Failed to load flow:', err);
                return null;
            }
        },
        [queryClient, setCurrentFlowId, setFlowName, setChannelId, setFlowMeta]
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

                // Transform nodes for save:
                // 1. Convert type (block.id) -> blockId, and set type to processType
                // 2. Remove runtime fields (status, inputData, outputData, etc.)
                // 3. Remove empty customLabel, description
                // 4. Extract height (with backward compatibility for legacy config.textareaHeight)
                const { blockRegistry } = useFlowsStore.getState();

                const slimNodes = nodes.map(node => {
                    const blockDef = blockRegistry[node.type];
                    const height = getNodeHeight(node);

                    const slimNode: Partial<NodeData> = {
                        id: node.id,
                        // type becomes processType (e.g., "input-text")
                        type: blockDef?.type ?? node.type,
                        // blockId is the block's id (e.g., "0008")
                        blockId: node.blockId ?? node.type,
                        position: node.position,
                    };

                    // Add width/height only if they have values
                    if (node.width) slimNode.width = node.width;
                    if (height) slimNode.height = height;

                    // Add customLabel/description only if non-empty
                    if (node.customLabel) slimNode.customLabel = node.customLabel;
                    if (node.description) slimNode.description = node.description;

                    return slimNode as NodeData;
                });

                const saveBody: SaveFlowBody = { nodes: slimNodes, edges: edgesData };

                // Store for retry on failure
                lastSaveBodyRef.current = saveBody;

                let flowId = currentFlowId;

                // If no current flow ID, create new flow
                if (!flowId) {
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
                setChannelId(null);
                setFlowMeta(null);
                return newFlowId;
            }
            return null;
        } catch (error) {
            console.error('[useFlows] Failed to create new flow:', error);
            return null;
        }
    }, [createFlowMutation, setCurrentFlowId, setFlowName, setLastSavedAt, setChannelId, setFlowMeta]);

    /**
     * Update flow name (metadata only)
     * POST /flows/:id
     *
     * @see eureka-flows-api v0.26.126
     */
    const updateFlowName = useCallback(
        async (name: string): Promise<boolean> => {
            if (!currentFlowId) {
                // Just update local state if no server flow exists
                setFlowName(name);
                return true;
            }

            updateSaveStatus('saving');

            try {
                await updateFlowMutation.mutateAsync({ id: currentFlowId, body: { name } });
                setFlowName(name);
                setLastSavedAt(new Date());
                updateSaveStatus('success');
                return true;
            } catch (error) {
                console.error('[useFlows] Failed to update flow name:', error);
                updateSaveStatus('error', error instanceof Error ? error : new Error('Failed to update name'));
                return false;
            }
        },
        [currentFlowId, updateFlowMutation, setFlowName, setLastSavedAt, updateSaveStatus]
    );

    /**
     * Publish/unpublish flow with metadata
     * POST /flows/:id with meta field
     */
    const publishFlow = useCallback(
        async (meta: PublishMeta): Promise<boolean> => {
            if (!currentFlowId) return false;

            updateSaveStatus('saving');
            try {
                await updateFlowMutation.mutateAsync({
                    id: currentFlowId,
                    body: { meta },
                });
                setFlowMeta(meta);
                setLastSavedAt(new Date());
                updateSaveStatus('success');
                return true;
            } catch (error) {
                console.error('[useFlows] Failed to publish flow:', error);
                updateSaveStatus('error', error instanceof Error ? error : new Error('Failed to publish'));
                return false;
            }
        },
        [currentFlowId, updateFlowMutation, setFlowMeta, setLastSavedAt, updateSaveStatus]
    );

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
        /** WebSocket channel ID for real-time node status updates */
        channelId,

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

        // Actions - Metadata
        updateFlowName,
        isUpdatingName: updateFlowMutation.isPending,

        // Actions - Publish
        flowMeta,
        isPublic: !!flowMeta?.isPublic,
        publishFlow,
    };
};
