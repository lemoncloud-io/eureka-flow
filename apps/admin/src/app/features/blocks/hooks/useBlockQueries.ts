import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createBlock, listBlocks, updateBlock } from '../apis';
import { blockKeys } from './blockKeys';

import type { Block, BlockFormData } from '../types';

/** List all blocks from the server. */
export const useBlocksQuery = () =>
    useQuery({
        queryKey: blockKeys.lists(),
        queryFn: listBlocks,
        staleTime: 30_000,
    });

/**
 * Create a block. On success, append to the list cache directly (setQueryData) —
 * the backend is eventually consistent, so invalidateQueries would return stale data.
 */
export const useCreateBlockMutation = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (form: BlockFormData) => createBlock(form),
        onSuccess: created => {
            qc.setQueryData<Block[]>(blockKeys.lists(), (old = []) => [...old, created]);
            qc.setQueryData<Block>(blockKeys.detail(created.id), created);
        },
    });
};

/**
 * Update a block. Optimistically writes to the list + detail caches, rolls back on error,
 * then reconciles with the server result — never invalidateQueries (backend is eventually consistent).
 */
export const useUpdateBlockMutation = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, form }: { id: string; form: BlockFormData }) => updateBlock(id, form),
        onMutate: async ({ id, form }) => {
            await qc.cancelQueries({ queryKey: blockKeys.lists() });
            const prevList = qc.getQueryData<Block[]>(blockKeys.lists());
            const optimistic = (prevList ?? []).map(b => (b.id === id ? { ...b, ...form } : b));
            qc.setQueryData<Block[]>(blockKeys.lists(), optimistic);
            return { prevList };
        },
        onError: (_err, _vars, ctx) => {
            if (ctx?.prevList) qc.setQueryData(blockKeys.lists(), ctx.prevList);
        },
        onSuccess: updated => {
            qc.setQueryData<Block[]>(blockKeys.lists(), (old = []) =>
                old.map(b => (b.id === updated.id ? updated : b))
            );
            qc.setQueryData<Block>(blockKeys.detail(updated.id), updated);
        },
    });
};
