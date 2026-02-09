import { useMutation } from '@tanstack/react-query';

import { upsertNode } from '../../api';

import type { NodeView, UpsertNodeResult } from '../../types';
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
