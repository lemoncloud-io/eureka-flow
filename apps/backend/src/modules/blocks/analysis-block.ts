import type { BlockExecutor, BlockExecutorResult } from './types';

export const analysisBlock: BlockExecutor = {
    blockType: 'analysis',
    async execute(input: unknown, _config?: Record<string, unknown>): Promise<BlockExecutorResult> {
        const start = Date.now();
        const output = {
            safetyScore: 95,
            qualityScore: 88,
            issues: [],
            approved: true,
        };
        return { output, durationMs: Date.now() - start };
    },
};
