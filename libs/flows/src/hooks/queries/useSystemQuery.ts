import { useQuery } from '@tanstack/react-query';

import { systemKeys } from './keys';
import { getSystemInfo } from '../../api';

import type { SystemInfo } from '../../types';

/**
 * Query hook for fetching system info (backend version)
 *
 * System info rarely changes, so we use staleTime: Infinity.
 * Refetch only on mount or manual invalidation.
 */
export const useSystemInfoQuery = () => {
    return useQuery({
        queryKey: systemKeys.info(),
        queryFn: getSystemInfo,
        staleTime: Infinity,
        retry: 1,
    });
};

// Re-export types for convenience
export type { SystemInfo };
