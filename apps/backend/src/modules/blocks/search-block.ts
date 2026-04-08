import type { BlockExecutor, BlockExecutorResult } from './types';

export const searchBlock: BlockExecutor = {
    blockType: 'search',
    async execute(input: unknown, _config?: Record<string, unknown>): Promise<BlockExecutorResult> {
        const start = Date.now();
        const output = {
            keywords: ['입시', '2026', '수능', '대입전형', '정시모집'],
            articles: [
                {
                    title: '[dummy] 2026 수능 출제 경향 분석 — 국어·수학 변화 예고',
                    url: 'fake://news.example.com/article/001',
                    source: '[dummy] EduNews',
                    summary: '2026학년도 수능에서 국어 비문학 지문 비중이 늘어날 것으로 예상된다.',
                },
                {
                    title: '[dummy] 대입 정시 모집 일정 확정 — 원서 접수 12월 초 시작',
                    url: 'fake://news.example.com/article/002',
                    source: '[dummy] 입시타임즈',
                    summary: '교육부가 2026학년도 정시 원서 접수 일정을 공식 발표했다.',
                },
                {
                    title: '[dummy] 수험생 10명 중 7명 "수능 수학 어렵다" 체감',
                    url: 'fake://news.example.com/article/003',
                    source: '[dummy] 스터디채널',
                    summary: '최근 설문조사에서 수험생 대다수가 수학 영역에 부담을 느끼는 것으로 나타났다.',
                },
            ],
            trendScore: 85,
        };
        return { output, durationMs: Date.now() - start };
    },
};
