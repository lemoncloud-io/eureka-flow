import { claudeAdapter } from '../../adapters/ai/claude-adapter';
import { log } from '../../utils/logger';

import type { BlockExecutor, BlockExecutorResult } from './types';

/**
 * Integration block — assembles upstream outputs into a final deliverable.
 *
 * Responsibilities:
 * - Combine video/audio/image URLs from upstream blocks
 * - Generate title/description/hashtags (deterministic or AI-enhanced)
 * - Build public URL strategy (mock/local/prod)
 * - Produce a single deliverable the frontend can render
 *
 * Does NOT: generate new media, make heavy API calls, or upload files.
 */

interface UpstreamData {
    search?: { keywords?: string[]; articles?: Array<{ title: string }> };
    content?: {
        hook?: string;
        scenes?: Array<{ narration: string; imagePrompt: string }>;
        cta?: string;
        totalDurationSec?: number;
    };
    analysis?: { safetyScore?: number; qualityScore?: number; approved?: boolean; issues?: unknown[] };
    mediaImage?: { images?: Array<{ url: string; sceneNumber: number; width: number; height: number }> };
    mediaTts?: { audio?: { url: string; durationSec: number; format: string } };
    mediaVideo?: {
        video?: { url: string; durationSec: number; width: number; height: number; format: string; sizeBytes?: number };
    };
}

function extractUpstream(input: unknown): UpstreamData {
    if (!input || typeof input !== 'object') return {};
    const data = input as Record<string, unknown>;

    return {
        search: data['keywords'] ? (data as UpstreamData['search']) : undefined,
        content: data['scenes'] ? (data as UpstreamData['content']) : undefined,
        analysis: data['safetyScore'] !== undefined ? (data as UpstreamData['analysis']) : undefined,
        mediaImage: data['images'] ? (data as UpstreamData['mediaImage']) : undefined,
        mediaTts: data['audio'] ? (data as UpstreamData['mediaTts']) : undefined,
        mediaVideo: data['video'] ? (data as UpstreamData['mediaVideo']) : undefined,
    };
}

function buildPublicUrl(videoUrl: string | undefined): string {
    if (!videoUrl) return 'unavailable://no-video';
    // Mock/local: pass through fake URL
    if (videoUrl.startsWith('fake://')) return videoUrl;
    // S3: construct CloudFront URL
    if (videoUrl.startsWith('s3://')) {
        const cdnDomain = process.env.CDN_DOMAIN || 'cdn.example.com';
        const key = videoUrl.replace(/^s3:\/\/[^/]+\//, '');
        return `https://${cdnDomain}/${key}`;
    }
    return videoUrl;
}

function generateTitle(upstream: UpstreamData): string {
    const keywords = upstream.search?.keywords?.slice(0, 3).join(' ') || '입시 트렌드';
    const hook = upstream.content?.hook;
    if (hook && !hook.startsWith('[dummy]')) return hook;
    return `${keywords} — 60초 핵심 정리 #shorts`;
}

function generateDescription(upstream: UpstreamData): string {
    const hook = upstream.content?.hook || '';
    const cta = upstream.content?.cta || '구독하고 매일 입시 정보를 받아보세요!';
    const keywords = upstream.search?.keywords?.join(', ') || '입시';
    return `${hook}\n\n${cta}\n\n키워드: ${keywords}`;
}

function generateHashtags(upstream: UpstreamData): string[] {
    const base = ['#shorts', '#입시', '#교육'];
    const fromKeywords = (upstream.search?.keywords || []).slice(0, 4).map(k => `#${k.replace(/\s+/g, '')}`);
    return [...new Set([...base, ...fromKeywords])];
}

function dummyIntegrationOutput(): Record<string, unknown> {
    return {
        title: '[dummy] 2026 수능 완벽 분석 — 합격을 위한 최후 전략 #shorts',
        description: '[dummy] 2026학년도 수능 트렌드와 정시 전략을 60초 안에 정리했습니다.',
        hashtags: ['#수능2026', '#입시', '#정시', '#수험생', '#공부법', '#shorts', '#교육'],
        publicUrl: 'fake://cdn.example.com/published/shorts-2026-suneung-abc123',
        video: { url: 'fake://cdn.example.com/video.mp4', durationSec: 45, width: 1080, height: 1920, format: 'mp4' },
        audio: { url: 'fake://cdn.example.com/audio.mp3', durationSec: 45, format: 'mp3' },
        thumbnailUrl: 'fake://cdn.example.com/thumbnails/thumb.jpg',
        sceneCount: 7,
        durationSec: 45,
        qualitySummary: { safetyScore: 95, qualityScore: 88, approved: true },
        artifacts: [
            { type: 'video', url: 'fake://cdn.example.com/video.mp4', label: '최종 영상' },
            { type: 'audio', url: 'fake://cdn.example.com/audio.mp3', label: '나레이션' },
            { type: 'thumbnail', url: 'fake://cdn.example.com/thumbnails/thumb.jpg', label: '썸네일' },
        ],
        warnings: [],
        createdAt: new Date().toISOString(),
        seoMetadata: { category: 'Education', language: 'ko' },
    };
}

export const integrationBlock: BlockExecutor = {
    blockType: 'integration',

    async execute(input: unknown, _config?: Record<string, unknown>): Promise<BlockExecutorResult> {
        const mode = process.env.ORCHESTRATOR_MODE || 'mock';
        if (mode !== 'claude') {
            return { output: dummyIntegrationOutput(), durationMs: 0 };
        }

        const start = Date.now();
        const upstream = extractUpstream(input);
        const warnings: string[] = [];

        // Check required upstream outputs
        if (!upstream.mediaVideo?.video) {
            warnings.push('video asset missing — deliverable is incomplete');
        }
        if (!upstream.mediaTts?.audio) {
            warnings.push('audio asset missing');
        }
        if (!upstream.mediaImage?.images?.length) {
            warnings.push('no scene images available');
        }

        const videoUrl = upstream.mediaVideo?.video?.url;
        const publicUrl = buildPublicUrl(videoUrl);
        const durationSec = upstream.mediaVideo?.video?.durationSec || upstream.content?.totalDurationSec || 45;
        const sceneCount = upstream.content?.scenes?.length || upstream.mediaImage?.images?.length || 7;

        // Generate metadata — deterministic from upstream data
        let title = generateTitle(upstream);
        let description = generateDescription(upstream);
        let hashtags = generateHashtags(upstream);

        // Optional AI enhancement for title/description (non-fatal)
        try {
            if (process.env.ANTHROPIC_API_KEY) {
                const resp = await claudeAdapter.chat({
                    model: 'claude-haiku-4-5-20251001',
                    systemPrompt:
                        'Generate a catchy Korean YouTube Shorts title and description for an education video. Return JSON: { "title": "...", "description": "...", "hashtags": ["..."] }',
                    userMessage: `키워드: ${upstream.search?.keywords?.join(', ') || '입시'}\n훅: ${upstream.content?.hook || ''}\nCTA: ${upstream.content?.cta || ''}`,
                    maxTokens: 512,
                    temperature: 0.7,
                });
                try {
                    const enhanced = JSON.parse(resp.content) as {
                        title?: string;
                        description?: string;
                        hashtags?: string[];
                    };
                    if (enhanced.title) title = enhanced.title;
                    if (enhanced.description) description = enhanced.description;
                    if (enhanced.hashtags?.length) hashtags = [...new Set([...hashtags, ...enhanced.hashtags])];
                } catch {
                    log.warn('AI metadata enhancement parse failed, using deterministic');
                }
            }
        } catch (err) {
            log.warn('AI metadata enhancement failed, using deterministic', {
                error: err instanceof Error ? err.message : String(err),
            });
        }

        // Build artifacts list
        const artifacts: Array<{ type: string; url: string; label?: string }> = [];
        if (upstream.mediaVideo?.video?.url) {
            artifacts.push({ type: 'video', url: upstream.mediaVideo.video.url, label: '최종 영상' });
        }
        if (upstream.mediaTts?.audio?.url) {
            artifacts.push({ type: 'audio', url: upstream.mediaTts.audio.url, label: '나레이션' });
        }
        if (upstream.mediaImage?.images) {
            const firstImage = upstream.mediaImage.images[0];
            if (firstImage) {
                artifacts.push({ type: 'thumbnail', url: firstImage.url, label: '썸네일' });
            }
            for (const img of upstream.mediaImage.images) {
                artifacts.push({ type: 'image', url: img.url, label: `씬 ${img.sceneNumber}` });
            }
        }

        const output: Record<string, unknown> = {
            title,
            description,
            hashtags,
            publicUrl,
            video: upstream.mediaVideo?.video
                ? {
                      url: upstream.mediaVideo.video.url,
                      durationSec: upstream.mediaVideo.video.durationSec,
                      width: upstream.mediaVideo.video.width,
                      height: upstream.mediaVideo.video.height,
                      format: upstream.mediaVideo.video.format,
                  }
                : undefined,
            audio: upstream.mediaTts?.audio
                ? {
                      url: upstream.mediaTts.audio.url,
                      durationSec: upstream.mediaTts.audio.durationSec,
                      format: upstream.mediaTts.audio.format,
                  }
                : undefined,
            thumbnailUrl: upstream.mediaImage?.images?.[0]?.url || null,
            sceneCount,
            durationSec,
            qualitySummary: upstream.analysis
                ? {
                      safetyScore: upstream.analysis.safetyScore ?? 0,
                      qualityScore: upstream.analysis.qualityScore ?? 0,
                      approved: upstream.analysis.approved ?? false,
                  }
                : undefined,
            artifacts,
            warnings: warnings.length > 0 ? warnings : undefined,
            createdAt: new Date().toISOString(),
            seoMetadata: { category: 'Education', language: 'ko', targetAudience: '수험생,학부모' },
        };

        return { output, durationMs: Date.now() - start };
    },
};
