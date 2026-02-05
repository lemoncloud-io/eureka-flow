import { useMutation } from '@tanstack/react-query';

import { updateNode } from '../../api';

import type { NodeView } from '../../types';

/**
 * Mutation hook for updating/creating a node
 * PUT /nodes/:id
 *
 * Used for syncing node changes (config, label, description, position, etc.) to backend.
 * Also used for creating new nodes (upsert behavior).
 * Does not use optimistic updates - local state is source of truth.
 */
export const useUpdateNodeMutation = () => {
    return useMutation({
        mutationFn: ({ id, body }: { id: string; body: Partial<NodeView> }) => updateNode(id, body),
        onError: (error, { id }) => {
            console.error(`[useUpdateNodeMutation] Failed to update node ${id}:`, error);
        },
    });
};

// Re-export types
export type { NodeView };
