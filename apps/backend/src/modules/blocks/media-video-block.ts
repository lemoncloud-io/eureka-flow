import type { BlockExecutor, BlockExecutorResult } from './types';

export const mediaVideoBlock: BlockExecutor = {
    blockType: 'media-video',
    async execute(input: unknown, _config?: Record<string, unknown>): Promise<BlockExecutorResult> {
        const start = Date.now();
        const output = {
            video: {
                url: 'fake://cdn.example.com/video/shorts-2026-suneung-final.mp4',
                durationSec: 45,
                width: 1080,
                height: 1920,
                format: 'mp4',
                sizeBytes: 15000000,
            },
        };
        return { output, durationMs: Date.now() - start };
    },
};
