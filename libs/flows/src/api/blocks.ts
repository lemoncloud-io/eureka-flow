import { api, withRetry } from '@flows/web-core';

import { EXECUTE_FUNCTIONS } from './execute-functions';

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
 * Fetch all available block definitions from server
 * GET /blocks/0/list?cores=1
 *
 * Server response contains $definition for each block with:
 * - id: block ID (e.g., "1000006")
 * - type: block type (e.g., "input-text")
 * - label, description, inputs, outputs, configSchema, etc.
 */
export const listBlocks = async (): Promise<BlockDefinition[]> => {
    _log('> listBlocks()');
    await delay(500);

    const response = await withRetry(() => api.get<ListResult<BlockView>>('/blocks/0/list?cores=1'), 3, 'listBlocks');

    const list = response.data?.list
        ?.map(item => item?.$definition)
        .filter((def): def is BlockDefinition => !!def?.label);

    _log('> API listBlocks?.len =', list?.length);

    if (!list?.length) {
        throw new Error('No block definitions returned from server');
    }

    // Attach execute functions for client-side processing blocks
    // Backend blocks (BACKEND_PROCESSOR_TYPES) use POST /nodes/:id/run instead
    return list.map(block => {
        const isBackendBlock = BACKEND_PROCESSOR_TYPES.includes(block.type);
        const execute = isBackendBlock ? undefined : EXECUTE_FUNCTIONS[block.type];

        return {
            ...block,
            execute,
        };
    });
};
