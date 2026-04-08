import { z } from 'zod';

/**
 * Block type identifiers — single source of truth.
 * Used by: block catalog, mock orchestrator, claude orchestrator,
 * proposal generation, block registry, execution engine.
 */
export const BLOCK_TYPES = [
    'search',
    'content',
    'data',
    'analysis',
    'media-image',
    'media-tts',
    'media-video',
    'integration',
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

export const BlockTypeSchema = z.enum(BLOCK_TYPES);

/**
 * Common block executor interface.
 * Every block implements this contract.
 */
export interface BlockExecutorResult {
    output: Record<string, unknown>;
    durationMs: number;
    /** Optional assets produced (media blocks) */
    assets?: Array<{
        assetType: 'IMAGE' | 'AUDIO' | 'VIDEO' | 'JSON' | 'TEXT';
        mimeType: string;
        data: Buffer | string;
        metadata?: Record<string, unknown>;
    }>;
}

export interface BlockExecutor {
    readonly blockType: BlockType;
    execute(input: unknown, config?: Record<string, unknown>): Promise<BlockExecutorResult>;
}

// ============================================================================
// Per-block input/output schemas
// ============================================================================

/** search block */
export const SearchOutputSchema = z.object({
    keywords: z.array(z.string()),
    articles: z.array(
        z.object({
            title: z.string(),
            url: z.string(),
            source: z.string(),
            summary: z.string().optional(),
        })
    ),
    trendScore: z.number().optional(),
});

/** content block */
export const ContentOutputSchema = z.object({
    hook: z.string(),
    scenes: z.array(
        z.object({
            sceneNumber: z.number(),
            narration: z.string(),
            imagePrompt: z.string(),
            durationSec: z.number().optional(),
        })
    ),
    cta: z.string(),
    totalDurationSec: z.number().optional(),
});

/** data block */
export const DataOutputSchema = z.object({
    normalizedScenes: z.array(
        z.object({
            sceneNumber: z.number(),
            narration: z.string(),
            imagePrompt: z.string(),
            keywords: z.array(z.string()).optional(),
        })
    ),
    metadata: z.record(z.unknown()).optional(),
});

/** analysis block */
export const AnalysisOutputSchema = z.object({
    safetyScore: z.number().min(0).max(100),
    qualityScore: z.number().min(0).max(100),
    issues: z.array(
        z.object({
            severity: z.enum(['low', 'medium', 'high', 'critical']),
            message: z.string(),
            sceneNumber: z.number().optional(),
        })
    ),
    approved: z.boolean(),
});

/** media-image block */
export const MediaImageOutputSchema = z.object({
    images: z.array(
        z.object({
            sceneNumber: z.number(),
            url: z.string(),
            width: z.number(),
            height: z.number(),
            prompt: z.string(),
        })
    ),
});

/** media-tts block */
export const MediaTtsOutputSchema = z.object({
    audio: z.object({
        url: z.string(),
        durationSec: z.number(),
        format: z.string(),
        sampleRate: z.number().optional(),
    }),
});

/** media-video block */
export const MediaVideoOutputSchema = z.object({
    video: z.object({
        url: z.string(),
        durationSec: z.number(),
        width: z.number(),
        height: z.number(),
        format: z.string(),
        sizeBytes: z.number().optional(),
    }),
});

/** integration block — final deliverable */
export const IntegrationOutputSchema = z.object({
    title: z.string(),
    description: z.string(),
    hashtags: z.array(z.string()),
    publicUrl: z.string(),
    video: z
        .object({
            url: z.string(),
            durationSec: z.number(),
            width: z.number(),
            height: z.number(),
            format: z.string(),
        })
        .optional(),
    audio: z
        .object({
            url: z.string(),
            durationSec: z.number(),
            format: z.string(),
        })
        .optional(),
    thumbnailUrl: z.string().nullable().optional(),
    sceneCount: z.number(),
    durationSec: z.number(),
    qualitySummary: z
        .object({
            safetyScore: z.number(),
            qualityScore: z.number(),
            approved: z.boolean(),
        })
        .optional(),
    artifacts: z.array(
        z.object({
            type: z.string(),
            url: z.string(),
            label: z.string().optional(),
        })
    ),
    warnings: z.array(z.string()).optional(),
    createdAt: z.string(),
    seoMetadata: z.record(z.string()).optional(),
});
