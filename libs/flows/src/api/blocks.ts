import { api, withRetry } from '@flows/web-core';

import { MOCKED_BLOCK_DEFINITIONS } from './mock-blocks';

import type { BlockDefinition, BlockView, DataPacket, ListResult } from '@lemoncloud/eureka-flows-api';

const _log = console.log.bind(console, '[blocks-api]');
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Create a DataPacket
 */
export const createPacket = (value: unknown, type: 'text' | 'image' | 'number'): DataPacket => ({
    value,
    type,
    timestamp: Date.now(),
});

/**
 * Block types that have backend processors and should use API execution
 * Other blocks will use their mock execute functions (client-side processing)
 *
 * These types must match the processor.type values registered in the backend:
 * - blog-title-generator: AI Blog Title Generator (Gemini API)
 * - blog-tags-generator: AI Blog Tags Generator (Gemini API)
 * - single-image-generator: AI Single Image Generator (Gemini API)
 */
export const BACKEND_PROCESSOR_TYPES = [
    'blog-title-generator',
    'blog-tags-generator',
    'single-image-generator',
    'title-generator', // Title Generator uses backend AI processing
];

/**
 * Check if a block type requires backend processing
 */
export const requiresBackendProcessing = (blockType: string): boolean => {
    return BACKEND_PROCESSOR_TYPES.includes(blockType);
};

/**
 * Fetch all available block definitions
 * GET /blocks/0/list?cores=1
 */
export const listBlocks = async (): Promise<BlockDefinition[]> => {
    _log('> listBlocks()');
    await delay(500);

    try {
        const response = await withRetry(
            () => api.get<ListResult<BlockView>>('/blocks/0/list?cores=1'),
            3,
            'listBlocks'
        );
        const list = response.data?.list
            ?.map(item => item?.$definition)
            .filter((def): def is BlockDefinition => !!def?.label);

        _log('> API listBlocks?.len =', list?.length);

        if (!list?.length) return MOCKED_BLOCK_DEFINITIONS;

        // Merge with mocked definitions
        // - Backend blocks (BACKEND_PROCESSOR_TYPES): No execute function needed (uses POST /nodes/:id/run)
        // - Frontend blocks: Use mock execute function for client-side processing
        return list.reduce<BlockDefinition[]>(
            (acc, apiBlock) => {
                const idx = acc.findIndex(m => m.type === apiBlock.type);
                const mockBlock = idx >= 0 ? acc[idx] : null;

                // For frontend blocks, use mock's execute function
                // For backend blocks, execute is undefined (handled by runNode API)
                const isBackendBlock = BACKEND_PROCESSOR_TYPES.includes(apiBlock.type);
                const execute = isBackendBlock ? undefined : mockBlock?.execute;

                const mergedBlock = {
                    ...apiBlock,
                    execute,
                };

                if (idx >= 0) {
                    acc[idx] = mergedBlock;
                } else {
                    acc.push(mergedBlock);
                }
                return acc;
            },
            [...MOCKED_BLOCK_DEFINITIONS]
        );
    } catch (err) {
        console.error('> API listBlocks error =', err);
        return MOCKED_BLOCK_DEFINITIONS;
    }
};

export { MOCKED_BLOCK_DEFINITIONS };
