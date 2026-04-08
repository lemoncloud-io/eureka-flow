import type { BlockExecutor, BlockExecutorResult } from './types';

export const integrationBlock: BlockExecutor = {
    blockType: 'integration',
    async execute(input: unknown, _config?: Record<string, unknown>): Promise<BlockExecutorResult> {
        const start = Date.now();
        const output = {
            title: '[dummy] 2026 수능 완벽 분석 — 합격을 위한 최후 전략 #shorts',
            description:
                '[dummy] 2026학년도 수능 트렌드와 정시 전략을 60초 안에 정리했습니다. 구독하고 매일 입시 정보를 받아보세요!',
            hashtags: ['#수능2026', '#입시', '#정시', '#수험생', '#공부법', '#shorts', '#교육'],
            publicUrl: 'fake://cdn.example.com/published/shorts-2026-suneung-abc123',
            thumbnailUrl: 'fake://cdn.example.com/thumbnails/shorts-2026-suneung-thumb.jpg',
            seoMetadata: {
                category: 'Education',
                language: 'ko',
                targetAudience: '수험생,학부모,교육관계자',
                publishedAt: new Date().toISOString(),
            },
        };
        return { output, durationMs: Date.now() - start };
    },
};
