import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { flowsKeys } from './keys';
import { createFlow, deleteFlow, getFlow, listFlows, loadFlow, saveFlow, updateFlow } from '../../api';

import type { FlowBody, FlowView, LoadFlowResult, SaveFlowBody, SaveFlowView } from '../../types';

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
 * Query hook for loading flow (full design with nodes and edges)
 * GET /flows/:id/load
 */
export const useLoadFlowQuery = (flowId: string | null) => {
    return useQuery({
        queryKey: flowsKeys.snapshot(flowId ?? ''),
        queryFn: () => loadFlow(flowId!),
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
 * Mutation hook for saving flow (full workflow state)
 * POST /flows/:id/save
 */
export const useSaveFlowMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, body }: { id: string; body: SaveFlowBody }) => saveFlow(id, body),
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: flowsKeys.snapshot(variables.id) });
        },
    });
};

// Re-export types for convenience
export type { FlowView, FlowBody, LoadFlowResult, SaveFlowBody, SaveFlowView };
