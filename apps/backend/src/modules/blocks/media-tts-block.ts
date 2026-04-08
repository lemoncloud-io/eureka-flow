import type { BlockExecutor, BlockExecutorResult } from './types';

export const mediaTtsBlock: BlockExecutor = {
    blockType: 'media-tts',
    async execute(input: unknown, _config?: Record<string, unknown>): Promise<BlockExecutorResult> {
        const start = Date.now();
        const output = {
            audio: {
                url: 'fake://cdn.example.com/audio/narration-2026-suneung.mp3',
                durationSec: 45,
                format: 'mp3',
                sampleRate: 44100,
            },
        };
        return { output, durationMs: Date.now() - start };
    },
};
