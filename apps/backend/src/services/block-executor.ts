/**
 * Block executor — runs a single block's logic via the block registry.
 * Phase 3C: wired to real per-block executors (dummy output).
 * Phase 4 will swap dummy executors for real AI/tool calls.
 */

import { blockRegistry } from '../modules/blocks';
import { log } from '../utils/logger';

import type { BlockExecutorResult } from '../modules/blocks/types';

export const blockExecutor = {
    /**
     * Execute a single block by type.
     * Returns the output payload, timing, and any produced assets.
     *
     * @param blockType  The type identifier of the block (e.g. "search", "content")
     * @param input      The resolved input payload for this block
     */
    async execute(blockType: string, input: unknown): Promise<BlockExecutorResult> {
        const executor = blockRegistry.get(blockType);

        if (!executor) {
            log.warn(`Unknown block type: ${blockType}, using fallback`);
            return {
                output: { error: `Unknown block type: ${blockType}`, blockType },
                durationMs: 0,
            };
        }

        const start = Date.now();
        const result = await executor.execute(input);
        return {
            output: result.output,
            durationMs: Date.now() - start,
            assets: result.assets ?? [],
        };
    },
};
