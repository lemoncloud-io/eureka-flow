import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { flowsKeys } from './keys';
import { createFlow, deleteFlow, listFlows, listPublicFlows, loadFlow, saveFlow, updateFlowMetadata } from '../../api';

import type {
    ApiListResult,
    FlowView,
    LoadFlowPortData,
    LoadFlowResult,
    SaveFlowBody,
    SaveFlowView,
    UpdateFlowBody,
} from '../../types';

/**
 * Query hook for listing all flows
 * GET /flows
 */
export const useFlowsListQuery = (enabled = true) => {
    return useQuery<ApiListResult<FlowView>>({
        queryKey: flowsKeys.lists(),
        queryFn: listFlows,
        enabled,
    });
};

/**
 * Infinite query hook for listing public flows with pagination
 * GET /public/flows?page=N
 */
export const usePublicFlowsInfiniteQuery = (enabled = true) => {
    return useInfiniteQuery({
        queryKey: flowsKeys.publicList(),
        queryFn: ({ pageParam }) => listPublicFlows(pageParam),
        initialPageParam: 0,
        getNextPageParam: lastPage => {
            const limit = lastPage.limit ?? 10;
            const page = lastPage.page ?? 0;
            const total = lastPage.total ?? 0;
            const fetched = (page + 1) * limit;
            return fetched < total ? page + 1 : undefined;
        },
        enabled,
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
 * Mutation hook for creating a new flow via POST /flows/0/save
 * Returns SaveFlowView which includes the server-generated flow ID
 */
export const useCreateFlowMutation = () => {
    return useMutation({
        mutationFn: (body?: Partial<SaveFlowBody>) => createFlow(body),
    });
};

/**
 * Mutation hook for saving flow (full workflow state)
 * POST /flows/:id/save
 *
 * Uses optimistic updates for seamless UX:
 * - Immediately updates cache on mutate
 * - Rolls back on error
 * - No invalidateQueries to avoid unnecessary refetch
 */
export const useSaveFlowMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, body }: { id: string; body: SaveFlowBody }) => saveFlow(id, body),
        onMutate: async ({ id, body }) => {
            // Cancel any outgoing refetches to prevent overwriting optimistic update
            await queryClient.cancelQueries({ queryKey: flowsKeys.snapshot(id) });

            // Snapshot the previous value for rollback
            const previousData = queryClient.getQueryData<LoadFlowResult>(flowsKeys.snapshot(id));

            // Optimistically update the cache
            if (previousData) {
                queryClient.setQueryData<LoadFlowResult>(flowsKeys.snapshot(id), old => ({
                    ...old!,
                    nodes: body.nodes,
                    edges: body.edges,
                }));
            }

            // Return context for rollback
            return { previousData };
        },
        onError: (_error, { id }, context) => {
            // Rollback to previous data on error
            if (context?.previousData) {
                queryClient.setQueryData(flowsKeys.snapshot(id), context.previousData);
            }
        },
        // No onSuccess/onSettled invalidateQueries - optimistic update is sufficient
        // This prevents unnecessary refetch after save
        retry: 2,
        retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 10000),
    });
};

/**
 * Mutation hook for updating flow metadata (name, etc.)
 * POST /flows/:id
 *
 * @see eureka-flows-api v0.26.126
 */
export const useUpdateFlowMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, body }: { id: string; body: UpdateFlowBody }) => updateFlowMetadata(id, body),
        onSuccess: (data, { id }) => {
            // Update the flow snapshot cache with new metadata
            queryClient.setQueryData<LoadFlowResult>(flowsKeys.snapshot(id), old => {
                if (!old) return old;
                return {
                    ...old,
                    name: data.name ?? old.name,
                    description: data.description ?? old.description,
                    thumbnail: data.thumbnail ?? old.thumbnail,
                    isPublic: data.isPublic ?? old.isPublic,
                };
            });
            // Refresh the flows list so updated metadata is visible
            queryClient.invalidateQueries({ queryKey: flowsKeys.lists() });
        },
    });
};

/**
 * Mutation hook for deleting a flow
 * DELETE /flows/:id
 */
export const useDeleteFlowMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => deleteFlow(id),
        onMutate: async id => {
            await queryClient.cancelQueries({ queryKey: flowsKeys.lists() });
            const previous = queryClient.getQueryData<ApiListResult<FlowView>>(flowsKeys.lists());

            // Optimistically remove from cache
            if (previous) {
                queryClient.setQueryData<ApiListResult<FlowView>>(flowsKeys.lists(), {
                    ...previous,
                    list: previous.list.filter(f => f.id !== id),
                    total: Math.max((previous.total ?? previous.list.length) - 1, 0),
                });
            }
            return { previous };
        },
        onError: (_error, _id, context) => {
            // Rollback on error
            if (context?.previous) {
                queryClient.setQueryData(flowsKeys.lists(), context.previous);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: flowsKeys.lists() });
        },
    });
};

// Re-export types for convenience
export type { ApiListResult, FlowView, LoadFlowPortData, LoadFlowResult, SaveFlowBody, SaveFlowView, UpdateFlowBody };
