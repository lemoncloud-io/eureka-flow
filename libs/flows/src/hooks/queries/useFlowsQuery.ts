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
export type { LoadFlowResult, SaveFlowBody, SaveFlowView };
