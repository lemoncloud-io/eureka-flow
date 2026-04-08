import { randomUUID } from 'crypto';

import { ttsAdapter } from '../../adapters/ai/tts-adapter';
import { BUCKET, putObject } from '../../adapters/aws/s3';
import { traceService } from '../../services/trace-service';

import type { BlockExecutor, BlockExecutorResult } from './types';

// ─── dummy output ─────────────────────────────────────────────────────────────

function dummyTtsOutput() {
    return {
        audio: {
            url: 'fake://cdn.example.com/audio/narration-2026-suneung.mp3',
            durationSec: 45,
            format: 'mp3',
            sampleRate: 44100,
        },
    };
}

// ─── block ───────────────────────────────────────────────────────────────────

export const mediaTtsBlock: BlockExecutor = {
    blockType: 'media-tts',

    async execute(input: unknown, _config?: Record<string, unknown>): Promise<BlockExecutorResult> {
        const start = Date.now();

        // Mock mode (default): return dummy output immediately
        if ((process.env.ORCHESTRATOR_MODE || 'mock') !== 'claude') {
            return { output: dummyTtsOutput(), durationMs: Date.now() - start };
        }

        // ── Real mode ──────────────────────────────────────────────────────────

        // Extract narration text from upstream content/data block output.
        // Supports two upstream shapes:
        //   content block: { scenes: [{ narration }], hook, cta }
        //   data block:    { normalizedScenes: [{ narration }] }
        const inp = input as Record<string, unknown> | null;
        type RawScene = { narration?: string };

        const rawScenes: RawScene[] =
            (inp?.normalizedScenes as RawScene[] | undefined) ?? (inp?.scenes as RawScene[] | undefined) ?? [];

        const hook = typeof inp?.hook === 'string' ? inp.hook : '';
        const cta = typeof inp?.cta === 'string' ? inp.cta : '';

        const narrationParts: string[] = [];
        if (hook) narrationParts.push(hook);
        for (const scene of rawScenes) {
            if (scene.narration) narrationParts.push(scene.narration);
        }
        if (cta) narrationParts.push(cta);

        // Fall back to a generic placeholder if no narration was found
        const fullText = narrationParts.length > 0 ? narrationParts.join(' ') : '안녕하세요. 오늘의 숏츠를 시작합니다.';

        try {
            const result = await ttsAdapter.synthesize({ text: fullText });

            const s3Key = `media/audio/${randomUUID()}/narration.mp3`;
            await putObject(s3Key, result.audioBuffer, result.contentType);
            const s3Url = `s3://${BUCKET}/${s3Key}`;

            const assets: BlockExecutorResult['assets'] = [
                {
                    assetType: 'AUDIO',
                    mimeType: result.contentType,
                    data: result.audioBuffer,
                    metadata: {
                        s3Key,
                        durationSec: result.estimatedDurationSec,
                        textLength: fullText.length,
                    },
                },
            ];

            try {
                await traceService.record('pending', null, 'STATUS', 'media-tts: audio generated', {
                    s3Key,
                    estimatedDurationSec: result.estimatedDurationSec,
                });
            } catch {
                /* non-fatal */
            }

            return {
                output: {
                    audio: {
                        url: s3Url,
                        durationSec: result.estimatedDurationSec,
                        format: 'mp3',
                        sampleRate: 44100,
                    },
                },
                durationMs: Date.now() - start,
                assets,
            };
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[media-tts-block] TTS generation failed: ${msg}`);
            try {
                await traceService.record('pending', null, 'ERROR', `media-tts: failed: ${msg}`);
            } catch {
                /* non-fatal */
            }
            throw err;
        }
    },
};
