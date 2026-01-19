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
 */
const createExecuteFunction = (block: BlockDefinition): BlockDefinition['execute'] => {
    return async (inputs, config, onProgress) => {
        const id = block.id || block.type;
        const ep = `/blocks/${id}/process`;
        _log(`> Executing block[${id}]`);

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
            .filter((def): def is BlockDefinition => !!def?.label)
            .map(def => ({ ...def, execute: createExecuteFunction(def) }));

        _log('> API listBlocks?.len =', list?.length);

        if (!list?.length) return MOCKED_BLOCK_DEFINITIONS;

        // Merge with mocked definitions
        return list.reduce<BlockDefinition[]>(
            (acc, block) => {
                const idx = acc.findIndex(m => m.type === block.type);
                if (idx >= 0) {
                    acc[idx] = block;
                } else {
                    acc.push(block);
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
