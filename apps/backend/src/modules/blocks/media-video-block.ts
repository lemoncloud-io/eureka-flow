import { randomUUID } from 'crypto';

import { BUCKET, putObject } from '../../adapters/aws/s3';
import { ffmpegAdapter } from '../../adapters/external/ffmpeg-adapter';
import { traceService } from '../../services/trace-service';

import type { BlockExecutor, BlockExecutorResult } from './types';

// ─── dummy output ─────────────────────────────────────────────────────────────

function dummyVideoOutput() {
    return {
        video: {
            url: 'fake://cdn.example.com/video/shorts-2026-suneung-final.mp4',
            durationSec: 45,
            width: 1080,
            height: 1920,
            format: 'mp4',
            sizeBytes: 15000000,
        },
    };
}

// ─── block ───────────────────────────────────────────────────────────────────

export const mediaVideoBlock: BlockExecutor = {
    blockType: 'media-video',

    async execute(input: unknown, _config?: Record<string, unknown>): Promise<BlockExecutorResult> {
        const start = Date.now();

        // Mock mode (default): return dummy output immediately
        if ((process.env.ORCHESTRATOR_MODE || 'mock') !== 'claude') {
            return { output: dummyVideoOutput(), durationMs: Date.now() - start };
        }

        // ── Real mode ──────────────────────────────────────────────────────────

        // Extract image URLs from media-image block output and audio URL from media-tts block output.
        // Input may contain merged output from multiple upstream blocks.
        const inp = input as Record<string, unknown> | null;

        type RawImage = { url?: string; durationSec?: number };
        const rawImages: RawImage[] = (inp?.images as RawImage[] | undefined) ?? [];

        // Build image entries for ffmpegAdapter; default 5 sec per scene if not specified
        const images = rawImages
            .filter(img => typeof img.url === 'string')
            .map(img => ({
                url: img.url as string,
                durationSec: typeof img.durationSec === 'number' ? img.durationSec : 5,
            }));

        // Extract audio URL from merged input (media-tts output shape: { audio: { url } })
        const audioObj = inp?.audio as { url?: string } | undefined;
        const audioUrl = typeof audioObj?.url === 'string' ? audioObj.url : undefined;

        // If no images, fall back to a single placeholder entry so we still produce a file
        if (images.length === 0) {
            images.push({ url: 'fake://placeholder/no-images', durationSec: 45 });
        }

        try {
            const result = await ffmpegAdapter.compose({
                images,
                audioUrl,
                outputWidth: 1080,
                outputHeight: 1920,
                outputFormat: 'mp4',
            });

            const s3Key = `media/video/${randomUUID()}/output.mp4`;
            await putObject(s3Key, result.videoBuffer, 'video/mp4');
            const s3Url = `s3://${BUCKET}/${s3Key}`;

            const assets: BlockExecutorResult['assets'] = [
                {
                    assetType: 'VIDEO',
                    mimeType: 'video/mp4',
                    data: result.videoBuffer,
                    metadata: {
                        s3Key,
                        durationSec: result.durationSec,
                        sizeBytes: result.sizeBytes,
                        width: 1080,
                        height: 1920,
                    },
                },
            ];

            try {
                await traceService.record('pending', null, 'STATUS', 'media-video: video composed', {
                    s3Key,
                    durationSec: result.durationSec,
                    sizeBytes: result.sizeBytes,
                });
            } catch {
                /* non-fatal */
            }

            return {
                output: {
                    video: {
                        url: s3Url,
                        durationSec: result.durationSec,
                        width: 1080,
                        height: 1920,
                        format: 'mp4',
                        sizeBytes: result.sizeBytes,
                    },
                },
                durationMs: Date.now() - start,
                assets,
            };
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[media-video-block] video composition failed: ${msg}`);
            try {
                await traceService.record('pending', null, 'ERROR', `media-video: failed: ${msg}`);
            } catch {
                /* non-fatal */
            }
            throw err;
        }
    },
};
