import { useCallback, useEffect, useRef } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { loadFlow } from '../api';
import { FLOW_FORBIDDEN } from '../consts';
import {
    flowsKeys,
    useCreateFlowMutation,
    useLoadFlowQuery,
    useSaveFlowMutation,
    useUpdateFlowMutation,
} from './queries';
import { useFlowsStore } from '../stores/useFlowsStore';
import { flowStorage } from '../utils/flowStorage';
import { clearDraft, emptySnapshot, rebaseline, toSnapshot } from '../workspace';

import type { SaveStatus } from '../stores/useFlowsStore';
import type { LoadFlowResult, SaveFlowBody, UpdateFlowBody } from '../types';

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
        flowDescription,
        isAutoSaveEnabled,
        lastSavedAt,
        saveStatus,
        saveError,
        channelId,
        setCurrentFlowId,
        setFlowName,
        setFlowDescription,
        setLastSavedAt,
        toggleAutoSave,
        setSaveStatus,
        setSaveError,
        setChannelId,
        isPublic,
        setIsPublic,
        isEditable,
        setIsEditable,
        hasOwned,
        setHasOwned,
        flowThumbnail,
        setFlowThumbnail,
        setBaseline,
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
        flowId: string | null;
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
                setFlowDescription(flowData.description ?? '');
                if (flowData.channelId) {
                    setChannelId(flowData.channelId);
                }
                setIsPublic(!!flowData.isPublic);
                setIsEditable(flowData.isEditable ?? false);
                setHasOwned(flowData.hasOwned ?? false);
                setFlowThumbnail(flowData.thumbnail ?? '');
                return { flowId: savedFlowId, flowData, isNew: false };
            } catch (err) {
                console.warn('[useFlows] Failed to load saved flow, creating new:', err);
                // Fall through to create new flow
            }
        }

        // No saved flow, or it would not load: start on a purely local working copy.
        // The flow claims an ID from its first save, so a session can open, build a
        // graph and undo it all again without the network being reachable at all.
        setCurrentFlowId(null);
        flowStorage.clearFlowId();
        setFlowName('Untitled Workflow');
        setFlowDescription('');
        setIsPublic(false);
        setIsEditable(true);
        setHasOwned(true);
        setFlowThumbnail('');
        setBaseline(emptySnapshot());
        return { flowId: null, flowData: null, isNew: true };
    }, [
        setBaseline,
        queryClient,
        setCurrentFlowId,
        setFlowName,
        setFlowDescription,
        setChannelId,
        setIsPublic,
        setIsEditable,
        setHasOwned,
        setFlowThumbnail,
    ]);

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

            try {
                // Use queryClient.fetchQuery for caching benefit
                const flowData = await queryClient.fetchQuery({
                    queryKey: flowsKeys.snapshot(id),
                    queryFn: () => loadFlow(id),
                    retry: false, // loadFlow uses withRetry internally
                });

                // URL may carry an alias slug (e.g. "1003845-TestFlow"); API operations require the canonical numeric ID
                const canonicalId = flowData.id ?? id;
                if (canonicalId !== id) {
                    // Pre-populate cache with canonical key so useLoadFlowQuery won't re-fetch
                    queryClient.setQueryData(flowsKeys.snapshot(canonicalId), flowData);
                }
                setCurrentFlowId(canonicalId);
                flowStorage.setFlowId(canonicalId);

                if (flowData.name) {
                    setFlowName(flowData.name);
                }
                setFlowDescription(flowData.description ?? '');
                if (flowData.channelId) {
                    setChannelId(flowData.channelId);
                }
                setIsPublic(!!flowData.isPublic);
                setIsEditable(flowData.isEditable ?? false);
                setHasOwned(flowData.hasOwned ?? false);
                setFlowThumbnail(flowData.thumbnail ?? '');
                return flowData;
            } catch (err) {
                console.error('[useFlows] Failed to load flow:', err);
                const status =
                    (err as { response?: { status?: number } })?.response?.status ??
                    (err as { status?: number })?.status;
                if (status === 403) {
                    throw new Error(FLOW_FORBIDDEN);
                }
                return null;
            }
        },
        [
            queryClient,
            setCurrentFlowId,
            setFlowName,
            setFlowDescription,
            setChannelId,
            setIsPublic,
            setIsEditable,
            setFlowThumbnail,
        ]
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
        ): Promise<{ success: boolean; id: string; structureDropped: boolean }> => {
            // Set saving status (subtle indicator, not blocking)
            updateSaveStatus('saving');

            try {
                // Support both 'edges' (API format) and 'connections' (UI format)
                const { nodes = [], edges, connections } = body;
                const edgesData = edges ?? connections ?? [];

                // Always send the whole working copy: the server replaces the flow's node
                // and edge lists with whatever this body carries, so anything left out is
                // dropped from the flow. That is also how deletes are expressed.
                //
                // The body is a snapshot in the workspace sense, not merely shaped like
                // one. That is what lets it become the next baseline below, and what makes
                // "is there anything to save" and "does the graph differ from the baseline"
                // the same question rather than two that drift apart.
                const { blockRegistry } = useFlowsStore.getState();
                const saveBody: SaveFlowBody = toSnapshot({ nodes, edges: edgesData }, blockRegistry);

                // Store for retry on failure
                lastSaveBodyRef.current = saveBody;

                let flowId = currentFlowId;

                // If no current flow ID, create new flow
                if (!flowId) {
                    console.log('[useFlows] Creating new flow via POST /flows/0/save');
                    const result = await createFlowMutation.mutateAsync(saveBody);
                    flowId = result.id ?? null;

                    if (flowId) {
                        setCurrentFlowId(flowId);
                        flowStorage.setFlowId(flowId);
                    }
                } else {
                    // Save to existing flow (uses optimistic update)
                    console.log('[useFlows] Saving to existing flow:', flowId);
                    await saveFlowMutation.mutateAsync({ id: flowId, body: saveBody });
                }

                const structureDropped = rebaseline(saveBody);

                // The server has it now, so the local copy has nothing left to protect.
                // Leaving it would offer to recover work that is already saved on the next
                // boot. A dropped structure is the exception: that work really is still
                // only here, so the draft stays as the one place it survives a refresh.
                if (!structureDropped) void clearDraft();

                setLastSavedAt(new Date());
                updateSaveStatus('success');
                return { success: true, id: flowId || '', structureDropped };
            } catch (error) {
                console.error('[useFlows] Failed to save flow:', error);
                updateSaveStatus('error', error instanceof Error ? error : new Error('Failed to save flow'));
                return { success: false, id: '', structureDropped: false };
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
            return { success: false, id: '', structureDropped: false };
        }
        // Retry with stored save body
        return saveCurrentFlow(lastSaveBodyRef.current);
    }, [saveCurrentFlow, updateSaveStatus]);

    /**
     * Start a new flow on a local working copy. No network — the flow claims an ID from
     * its first save, and stays purely local until then.
     */
    const createNewFlow = useCallback((): void => {
        setCurrentFlowId(null);
        flowStorage.clearFlowId();
        setFlowName('Untitled Workflow');
        setFlowDescription('');
        setLastSavedAt(null);
        setChannelId(null);
        setIsPublic(false);
        setIsEditable(true);
        setHasOwned(true);
        setFlowThumbnail('');
        setBaseline(emptySnapshot());
    }, [
        setBaseline,
        setCurrentFlowId,
        setFlowName,
        setFlowDescription,
        setLastSavedAt,
        setChannelId,
        setIsPublic,
        setIsEditable,
        setHasOwned,
        setFlowThumbnail,
    ]);

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
     * Publish flow with name/description
     * POST /flows/:id with { name, description, isPublic }
     */
    const publishFlow = useCallback(
        async (body: UpdateFlowBody): Promise<boolean> => {
            if (!currentFlowId) return false;

            updateSaveStatus('saving');
            try {
                await updateFlowMutation.mutateAsync({
                    id: currentFlowId,
                    body,
                });
                if (body.name) setFlowName(body.name);
                if (body.description !== undefined) setFlowDescription(body.description);
                if (body.isPublic !== undefined) setIsPublic(body.isPublic);
                if (body.thumbnail !== undefined) setFlowThumbnail(body.thumbnail);
                setLastSavedAt(new Date());
                updateSaveStatus('success');
                return true;
            } catch (error) {
                console.error('[useFlows] Failed to publish flow:', error);
                updateSaveStatus('error', error instanceof Error ? error : new Error('Failed to publish'));
                return false;
            }
        },
        [
            currentFlowId,
            updateFlowMutation,
            setFlowName,
            setFlowDescription,
            setIsPublic,
            setFlowThumbnail,
            setLastSavedAt,
            updateSaveStatus,
        ]
    );

    /**
     * Toggle flow public/private state
     * POST /flows/:id with { isPublic }
     */
    const togglePublic = useCallback(async (): Promise<boolean> => {
        if (!currentFlowId) return false;

        const newIsPublic = !isPublic;
        try {
            await updateFlowMutation.mutateAsync({
                id: currentFlowId,
                body: { isPublic: newIsPublic },
            });
            setIsPublic(newIsPublic);
            return true;
        } catch (error) {
            console.error('[useFlows] Failed to toggle public:', error);
            return false;
        }
    }, [currentFlowId, isPublic, updateFlowMutation, setIsPublic]);

    // Derive loading state from TanStack Query (only for initial load)
    const isLoading = loadFlowQuery.isLoading || loadFlowQuery.isFetching;

    // isSaving is now derived from saveStatus for backward compatibility
    const isSaving = saveStatus === 'saving';

    // lastSavedAt is already destructured from useFlowsStore at line 28

    return {
        // State
        currentFlowId,
        flowName,
        flowDescription,
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
        isPublic,
        isEditable,
        hasOwned,
        flowThumbnail,
        togglePublic,
        publishFlow,
    };
};
