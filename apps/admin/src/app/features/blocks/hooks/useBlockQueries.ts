import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createBlock, listBlocks } from '../apis';
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
