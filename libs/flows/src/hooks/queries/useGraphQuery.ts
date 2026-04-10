import { useQuery } from '@tanstack/react-query';

import { graphKeys } from './keys';
import { fetchFlowGraph } from '../../api';

/**
 * Query hook for fetching Reagraph-compatible graph data.
 * Uses TanStack Query for caching and automatic refetch.
 *
 * @param flowId - Flow ID to fetch graph for (null to disable)
 */
export const useFlowGraphQuery = (flowId: string | null) => {
    return useQuery({
        queryKey: graphKeys.detail(flowId ?? ''),
        queryFn: () => fetchFlowGraph(flowId!),
        enabled: !!flowId,
        staleTime: 30_000,
        retry: false, // fetchFlowGraph uses withRetry internally
    });
};
