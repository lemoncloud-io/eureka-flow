import { useQuery } from '@tanstack/react-query';

import { blocksKeys } from './keys';
import { listBlocks } from '../../api';

import type { BlockDefinition } from '@lemoncloud/eureka-flows-api';

/**
 * Query hook for listing all block definitions
 *
 * Block definitions are relatively static, so we use a longer staleTime
 */
export const useBlocksListQuery = () => {
    return useQuery({
        queryKey: blocksKeys.lists(),
        queryFn: listBlocks,
        staleTime: 5 * 60 * 1000, // 5 minutes - block definitions rarely change
    });
};

// Re-export types for convenience
export type { BlockDefinition };
