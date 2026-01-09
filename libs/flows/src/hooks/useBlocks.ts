import { useCallback } from 'react';

import { listBlocks } from '../api';
import { useFlowsStore } from '../stores/useFlowsStore';

/**
 * Hook for managing block definitions
 */
export const useBlocks = () => {
    const { setBlockRegistry, setBlocksLoaded, blockRegistry, isBlocksLoaded } = useFlowsStore();

    const loadBlocks = useCallback(async () => {
        try {
            const blocks = await listBlocks();
            setBlockRegistry(blocks);
            setBlocksLoaded(true);
            return blocks;
        } catch (error) {
            console.error('Failed to load blocks:', error);
            throw error;
        }
    }, [setBlockRegistry, setBlocksLoaded]);

    const getBlockDefinition = useCallback(
        (type: string) => {
            return blockRegistry[type];
        },
        [blockRegistry]
    );

    return {
        blockRegistry,
        isBlocksLoaded,
        loadBlocks,
        getBlockDefinition,
    };
};
