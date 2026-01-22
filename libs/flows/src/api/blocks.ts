import { api, withRetry } from '@flows/web-core';

import { MOCKED_BLOCK_DEFINITIONS } from './mock-blocks';

import type {
    BlockDefinition,
    BlockView,
    DataPacket,
    ListResult,
    ProcessBody,
    ProcessResult,
} from '@lemoncloud/eureka-flows-api';

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
 * Factory to create execute function for BlockDefinition from API
 * Only used for blocks that have backend processors (e.g., title-generator)
 */
const createExecuteFunction = (block: BlockDefinition): BlockDefinition['execute'] => {
    return async (inputs, config, onProgress) => {
        const id = block.id || block.type;
        const ep = `/blocks/${id}/process`;
        _log(`> Executing block[${id}] via API`);

        onProgress?.(10);
        const body: ProcessBody = { inputs, config };
        const result = await api.post<ProcessResult>(ep, body);
        _log(`> Received output from block[${id}]`);
        onProgress?.(100);

        return Object.entries(result.data.$output).reduce<Record<string, DataPacket>>((acc, [key, val]) => {
            acc[key] = createPacket(val?.value, val?.type || ('text' as 'text' | 'image' | 'number'));
            return acc;
        }, {});
    };
};

/**
 * Block types that have backend processors and should use API execution
 * Other blocks will use their mock execute functions (client-side processing)
 */
const BACKEND_PROCESSOR_TYPES = ['title-generator'];

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
        // - For blocks with backend processors: use API execute function
        // - For blocks with mock execute: preserve the mock execute function (client-side processing)
        return list.reduce<BlockDefinition[]>(
            (acc, apiBlock) => {
                const idx = acc.findIndex(m => m.type === apiBlock.type);
                const mockBlock = idx >= 0 ? acc[idx] : null;

                // Determine which execute function to use
                const hasBackendProcessor = BACKEND_PROCESSOR_TYPES.includes(apiBlock.type);
                const execute = hasBackendProcessor ? createExecuteFunction(apiBlock) : mockBlock?.execute; // Use mock's execute for client-side blocks

                const mergedBlock = {
                    ...apiBlock,
                    execute: execute || createExecuteFunction(apiBlock), // Fallback to API if no mock
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
