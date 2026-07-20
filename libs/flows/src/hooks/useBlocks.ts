import { useCallback, useEffect } from 'react';

import { useBlocksListQuery } from './queries';
import { useFlowsStore } from '../stores/useFlowsStore';

/**
 * Hook for managing block definitions
 *
 * Uses TanStack Query for fetching block definitions.
 * Syncs to Zustand store for components that need direct registry access.
 */
export const useBlocks = () => {
    const { setBlockRegistry, setBlocksLoaded, blockRegistry, isBlocksLoaded } = useFlowsStore();

    // TanStack Query hook
    const blocksQuery = useBlocksListQuery();

    // Sync TanStack Query data to Zustand store for backward compatibility
    useEffect(() => {
        if (blocksQuery.data && blocksQuery.data.length > 0) {
            setBlockRegistry(blocksQuery.data);
            setBlocksLoaded(true);
        }
    }, [blocksQuery.data, setBlockRegistry, setBlocksLoaded]);

    /**
     * Manually refetch blocks.
     *
     * Throws on a failed fetch — refetch() alone resolves with the error tucked in its
     * result, which let a dead blocks endpoint boot the editor with an empty registry
     * instead of the error screen. Callers that can live without the server catch and
     * fall back (the tutorials); the editors let it reach their boot error.
     */
    const loadBlocks = useCallback(async () => {
        const result = await blocksQuery.refetch({ throwOnError: true });
        return result.data ?? [];
    }, [blocksQuery]);

    /**
     * Get a specific block definition by type
     */
    const getBlockDefinition = useCallback(
        (type: string) => {
            return blockRegistry[type];
        },
        [blockRegistry]
    );

    return {
        // State
        blockRegistry,
        isBlocksLoaded: isBlocksLoaded || blocksQuery.isSuccess,
        isLoading: blocksQuery.isLoading,

        // Actions
        loadBlocks,
        getBlockDefinition,

        // Query state for advanced usage
        blocksQuery,
    };
};
