import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { flowsKeys } from './keys';
import {
    createFlow,
    deleteFlow,
    getFlow,
    getFlowSnapshot,
    listFlows,
    runFlow,
    saveFlowSnapshot,
    stopFlow,
    updateFlow,
} from '../../api';

import type { FlowBody, FlowView, InputOverrideItem, SaveSnapshotBody, SnapShotResult } from '../../types';

/**
 * Query hook for listing all flows
 */
export const useFlowsListQuery = () => {
    return useQuery({
        queryKey: flowsKeys.lists(),
        queryFn: listFlows,
    });
};

/**
 * Query hook for getting a single flow by ID
 */
export const useFlowQuery = (flowId: string | null) => {
    return useQuery({
        queryKey: flowsKeys.detail(flowId ?? ''),
        queryFn: () => getFlow(flowId!),
        enabled: !!flowId,
    });
};

/**
 * Query hook for getting flow snapshot (full design with nodes and edges)
 */
export const useFlowSnapshotQuery = (flowId: string | null) => {
    return useQuery({
        queryKey: flowsKeys.snapshot(flowId ?? ''),
        queryFn: () => getFlowSnapshot(flowId!),
        enabled: !!flowId,
    });
};

/**
 * Mutation hook for creating a new flow
 */
export const useCreateFlowMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (body: FlowBody) => createFlow(body),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: flowsKeys.lists() });
        },
    });
};

/**
 * Mutation hook for updating a flow
 */
export const useUpdateFlowMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, body }: { id: string; body: FlowBody }) => updateFlow(id, body),
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: flowsKeys.detail(variables.id) });
            queryClient.invalidateQueries({ queryKey: flowsKeys.snapshot(variables.id) });
            queryClient.invalidateQueries({ queryKey: flowsKeys.lists() });
        },
    });
};

/**
 * Mutation hook for deleting a flow
 */
export const useDeleteFlowMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => deleteFlow(id),
        onSuccess: (_data, id) => {
            queryClient.invalidateQueries({ queryKey: flowsKeys.detail(id) });
            queryClient.invalidateQueries({ queryKey: flowsKeys.snapshot(id) });
            queryClient.invalidateQueries({ queryKey: flowsKeys.lists() });
        },
    });
};

/**
 * Mutation hook for saving flow snapshot (full workflow state)
 * POST /flows/:id/save
 */
export const useSaveFlowSnapshotMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, body }: { id: string; body: SaveSnapshotBody }) => saveFlowSnapshot(id, body),
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: flowsKeys.snapshot(variables.id) });
        },
    });
};

/**
 * Mutation hook for running a flow
 */
export const useRunFlowMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            flowId,
            nodeId,
            options,
        }: {
            flowId: string;
            nodeId: string;
            options?: { propagate?: boolean; inputOverrides?: InputOverrideItem[] };
        }) => runFlow(flowId, nodeId, options),
        onSuccess: (_data, variables) => {
            // Invalidate snapshot to refresh node states
            queryClient.invalidateQueries({ queryKey: flowsKeys.snapshot(variables.flowId) });
        },
    });
};

/**
 * Mutation hook for stopping a flow
 */
export const useStopFlowMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ flowId, nodeId }: { flowId: string; nodeId?: string }) => stopFlow(flowId, nodeId),
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: flowsKeys.snapshot(variables.flowId) });
        },
    });
};

// Re-export types for convenience
export type { FlowView, FlowBody, SaveSnapshotBody, SnapShotResult };
