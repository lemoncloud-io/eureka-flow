import { api, withRetry } from '@flows/web-core';

import { EXECUTE_FUNCTIONS } from './execute-functions';

import type { BlockDefinitionWithFrontend, BlockStereo } from '../types';
import type { BlockView, DataPacket, ListResult } from '@lemoncloud/eureka-flows-api';

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

/** @deprecated Fallback for servers without isFrontend flag. Remove when server is updated. */
const LEGACY_BACKEND_PROCESSOR_TYPES = [
    'blog-title-generator',
    'blog-tags-generator',
    'single-image-generator',
    'title-generator',
] as const;

/**
 * Extended BlockView with isFrontend flag from server
 *
 * This type is intentionally kept local to this module as it represents
 * the raw API response shape. The public type `BlockDefinitionWithFrontend`
 * in types/index.ts is what consumers should use.
 *
 * Note: Server returns `isFrontend` as BoolFlag (0 | 1), not boolean.
 * Conversion to boolean happens in listBlocks().
 */
interface BlockViewWithFrontend extends BlockView {
    /** Server-provided flag indicating frontend execution capability (0 or 1) */
    isFrontend?: 0 | 1;
    /** Block stereotype for categorization (input, process, output) */
    stereo?: BlockStereo;
}

/**
 * Check if a block definition requires backend processing
 *
 * Decision logic:
 * 1. If `isFrontend` is explicitly `true` → Frontend execution (no backend call)
 * 2. If `isFrontend` is explicitly `false` → Backend execution (call API)
 * 3. If `isFrontend` is `undefined` → Fallback to legacy BACKEND_PROCESSOR_TYPES check
 *
 * @param blockDef - The block definition to check
 * @returns `true` if backend processing is required, `false` otherwise
 */
export const requiresBackendProcessing = (blockDef: BlockDefinitionWithFrontend): boolean => {
    // If isFrontend is explicitly set, use it directly
    if (blockDef.isFrontend !== undefined) {
        return !blockDef.isFrontend;
    }

    // Fallback: use legacy hardcoded list for backward compatibility
    return LEGACY_BACKEND_PROCESSOR_TYPES.includes(blockDef.type);
};

/**
 * Fetch all available block definitions from server
 * GET /blocks/0/list?cores=1
 *
 * Server response contains $definition for each block with:
 * - id: block ID (e.g., "1000006")
 * - type: block type (e.g., "input-text")
 * - label, description, inputs, outputs, configSchema, etc.
 * - isFrontend: BoolFlag (0 | 1) indicating execution location, converted to boolean
 */
export const listBlocks = async (): Promise<BlockDefinitionWithFrontend[]> => {
    _log('> listBlocks()');
    await delay(500);

    const response = await withRetry(
        () => api.get<ListResult<BlockViewWithFrontend>>('/blocks/0/list?cores=1&limit=-1'),
        3,
        'listBlocks'
    );

    const rawList = response.data?.list;

    if (!rawList?.length) {
        throw new Error('No block definitions returned from server');
    }

    // Process blocks: extract $definition and attach isFrontend + execute function
    const list = rawList
        .filter(
            (item): item is BlockViewWithFrontend & { $definition: NonNullable<BlockView['$definition']> } =>
                !!item?.$definition?.label
        )
        .map((item): BlockDefinitionWithFrontend => {
            const definition = item.$definition;
            // Get isFrontend from the BlockView level (server response)
            // Convert BoolFlag (0 | 1) to boolean for type safety
            const isFrontend = item.isFrontend !== undefined ? Boolean(item.isFrontend) : undefined;
            // Get stereo for block categorization
            const stereo = item.stereo;

            // Build partial block def to reuse requiresBackendProcessing logic
            const blockDef: BlockDefinitionWithFrontend = { ...definition, isFrontend };
            const shouldRunOnFrontend = !requiresBackendProcessing(blockDef);

            // Attach execute function only for frontend blocks
            const execute = shouldRunOnFrontend ? EXECUTE_FUNCTIONS[definition.type] : undefined;

            return {
                ...definition,
                isFrontend,
                stereo,
                execute,
            };
        });

    _log('> API listBlocks.len =', list.length);

    if (!list.length) {
        throw new Error('No valid block definitions found');
    }

    return list;
};
