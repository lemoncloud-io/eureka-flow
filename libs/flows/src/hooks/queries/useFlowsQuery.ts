import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { flowsKeys } from './keys';
import { createFlow, loadFlow, saveFlow } from '../../api';

import type { LoadFlowResult, SaveFlowBody, SaveFlowView } from '../../types';

// NOTE: useFlowsListQuery and useFlowQuery are removed because
// the backend does not support GET /flows or GET /flows/:id endpoints.
// Only POST /flows/:id/save and GET /flows/:id/load are supported.

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

// Re-export types for convenience
export type { LoadFlowResult, SaveFlowBody, SaveFlowView };
