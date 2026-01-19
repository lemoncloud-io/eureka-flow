import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { edgesKeys, flowsKeys } from './keys';
import { createEdge, deleteEdge, getEdge, listEdges, updateEdge } from '../../api';

import type { EdgeBody, EdgeView } from '../../types';

/**
 * Query hook for listing edges by flow ID
 */
export const useEdgesListQuery = (flowId: string | null) => {
    return useQuery({
        queryKey: edgesKeys.listByFlow(flowId ?? ''),
        queryFn: () => listEdges(flowId!),
        enabled: !!flowId,
    });
};

/**
 * Query hook for getting a single edge by ID
 */
export const useEdgeQuery = (edgeId: string | null) => {
    return useQuery({
        queryKey: edgesKeys.detail(edgeId ?? ''),
        queryFn: () => getEdge(edgeId!),
        enabled: !!edgeId,
    });
};

/**
 * Mutation hook for creating a new edge
 */
export const useCreateEdgeMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (body: EdgeBody) => createEdge(body),
        onSuccess: (_data, variables) => {
            if (variables.flowId) {
                queryClient.invalidateQueries({ queryKey: edgesKeys.listByFlow(variables.flowId) });
                queryClient.invalidateQueries({ queryKey: flowsKeys.snapshot(variables.flowId) });
            }
        },
    });
};

/**
 * Mutation hook for updating an edge
 */
export const useUpdateEdgeMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, body }: { id: string; body: EdgeBody }) => updateEdge(id, body),
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: edgesKeys.detail(variables.id) });
            if (variables.body.flowId) {
                queryClient.invalidateQueries({ queryKey: edgesKeys.listByFlow(variables.body.flowId) });
                queryClient.invalidateQueries({ queryKey: flowsKeys.snapshot(variables.body.flowId) });
            }
        },
    });
};

/**
 * Mutation hook for deleting an edge
 */
export const useDeleteEdgeMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, flowId: _flowId }: { id: string; flowId?: string }) => deleteEdge(id),
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: edgesKeys.detail(variables.id) });
            if (variables.flowId) {
                queryClient.invalidateQueries({ queryKey: edgesKeys.listByFlow(variables.flowId) });
                queryClient.invalidateQueries({ queryKey: flowsKeys.snapshot(variables.flowId) });
            }
        },
    });
};

// Re-export types for convenience
export type { EdgeView, EdgeBody };
