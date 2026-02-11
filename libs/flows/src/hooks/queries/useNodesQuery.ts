import { useMutation } from '@tanstack/react-query';

import { upsertEdge, upsertNode } from '../../api';

import type { NodeView, UpsertNodeResult } from '../../types';
import type { EdgeData } from '@lemoncloud/eureka-flows-api';
import type { UseMutationResult } from '@tanstack/react-query';

interface UpsertNodeVariables {
    id: string;
    flowId: string;
    body: Partial<NodeView>;
}

/**
 * Mutation hook for upserting a node (create or update)
 * POST /nodes/:id/upsert?flowId=<flowId>
 *
 * New unified endpoint for node operations.
 * - id="0" with no body.id → create new node
 * - id="0" with body.id → upsert by body.id
 * - id=<nodeId> → upsert existing node
 */
export const useUpsertNodeMutation = (): UseMutationResult<UpsertNodeResult, Error, UpsertNodeVariables> => {
    return useMutation({
        mutationFn: ({ id, flowId, body }: UpsertNodeVariables) => upsertNode(id, flowId, body),
        onError: (error: Error, { id }) => {
            console.error(`[useUpsertNodeMutation] Failed to upsert node ${id}:`, error);
        },
    });
};

interface CreateNodeVariables {
    flowId: string;
    body: Partial<NodeView>;
}

/**
 * Mutation hook for creating a new node with server-assigned ID
 * POST /nodes/0/upsert?flowId=<flowId>
 *
 * Server assigns the node ID and returns it in the response.
 * Use this for optimistic UI pattern:
 * 1. Create node in UI with temp ID
 * 2. Call this mutation
 * 3. Replace temp ID with server-assigned ID from response
 *
 * @returns UpsertNodeResult with nodes$$[0].id containing server-assigned ID
 */
export const useCreateNodeMutation = (): UseMutationResult<UpsertNodeResult, Error, CreateNodeVariables> => {
    return useMutation({
        mutationFn: ({ flowId, body }: CreateNodeVariables) => upsertNode('0', flowId, body),
        onError: (error: Error) => {
            console.error('[useCreateNodeMutation] Failed to create node:', error);
        },
    });
};

interface CreateEdgeVariables {
    flowId: string;
    edge: EdgeData;
}

/**
 * Mutation hook for creating a new edge with server-assigned ID
 * POST /nodes/0/upsert?flowId=<flowId> with { edges: [edge] }
 *
 * Server assigns the edge ID and returns it in the response.
 * Use this for optimistic UI pattern:
 * 1. Create edge in UI with temp ID
 * 2. Call this mutation
 * 3. Replace temp ID with server-assigned ID from response
 *
 * @returns UpsertNodeResult with edges$$[0].id containing server-assigned ID
 */
export const useCreateEdgeMutation = (): UseMutationResult<UpsertNodeResult, Error, CreateEdgeVariables> => {
    return useMutation({
        mutationFn: ({ flowId, edge }: CreateEdgeVariables) => upsertEdge(flowId, edge),
        onError: (error: Error) => {
            console.error('[useCreateEdgeMutation] Failed to create edge:', error);
        },
    });
};
