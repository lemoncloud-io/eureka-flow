/**
 * Query Keys for TanStack Query
 *
 * Centralized key management for cache invalidation and prefetching
 */

export const flowsKeys = {
    all: ['flows'] as const,
    lists: () => [...flowsKeys.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) => [...flowsKeys.lists(), filters] as const,
    details: () => [...flowsKeys.all, 'detail'] as const,
    detail: (id: string) => [...flowsKeys.details(), id] as const,
    snapshot: (id: string) => [...flowsKeys.all, 'snapshot', id] as const,
};

export const blocksKeys = {
    all: ['blocks'] as const,
    lists: () => [...blocksKeys.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) => [...blocksKeys.lists(), filters] as const,
    details: () => [...blocksKeys.all, 'detail'] as const,
    detail: (id: string) => [...blocksKeys.details(), id] as const,
};

export const nodesKeys = {
    all: ['nodes'] as const,
    lists: () => [...nodesKeys.all, 'list'] as const,
    listByFlow: (flowId: string) => [...nodesKeys.lists(), { flowId }] as const,
    details: () => [...nodesKeys.all, 'detail'] as const,
    detail: (id: string) => [...nodesKeys.details(), id] as const,
};

export const edgesKeys = {
    all: ['edges'] as const,
    lists: () => [...edgesKeys.all, 'list'] as const,
    listByFlow: (flowId: string) => [...edgesKeys.lists(), { flowId }] as const,
    details: () => [...edgesKeys.all, 'detail'] as const,
    detail: (id: string) => [...edgesKeys.details(), id] as const,
};

export const logsKeys = {
    all: ['logs'] as const,
    node: (nodeId: string) => [...logsKeys.all, 'node', nodeId] as const,
};

export const systemKeys = {
    all: ['system'] as const,
    info: () => [...systemKeys.all, 'info'] as const,
};
