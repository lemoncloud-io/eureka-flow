import type { BlockDefinition } from './types';

// The Registry is now a mutable object populated at runtime via API
export const BLOCK_REGISTRY: Record<string, BlockDefinition> = {};

export const initBlockRegistry = (blocks: BlockDefinition[]) => {
    // Clear existing to avoid duplicates if re-initialized (though mostly used once)
    Object.keys(BLOCK_REGISTRY).forEach(key => delete BLOCK_REGISTRY[key]);

    // Populate
    blocks.forEach(block => {
        BLOCK_REGISTRY[block.type] = block;
    });

    console.log(`[Registry] Initialized with ${blocks.length} blocks.`);
};
