import { useQuery } from '@tanstack/react-query';

import { blocksKeys } from './keys';
import { listBlocks } from '../../api';

import type { BlockDefinitionWithFrontend } from '../../types';

/**
 * Query hook for listing all block definitions
 *
 * Block definitions are relatively static, so we use a longer staleTime.
 * Returns BlockDefinitionWithFrontend which includes the isFrontend flag.
 */
export const useBlocksListQuery = () => {
    return useQuery({
        queryKey: blocksKeys.lists(),
        queryFn: listBlocks,
        staleTime: 5 * 60 * 1000, // 5 minutes - block definitions rarely change
    });
};

// Re-export types for convenience
export type { BlockDefinitionWithFrontend };
