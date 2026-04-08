import type { BlockExecutor, BlockExecutorResult } from './types';

export const dataBlock: BlockExecutor = {
    blockType: 'data',
    async execute(input: unknown, _config?: Record<string, unknown>): Promise<BlockExecutorResult> {
        const start = Date.now();
        const output = {
            normalizedScenes: [
                {
                    sceneNumber: 1,
                    narration: '[dummy] 매년 11월, 수험생들의 운명을 가르는 수능이 다가옵니다.',
                    imagePrompt:
                        '[dummy] A student nervously studying late at night, books and notes spread on desk, warm lamp light, cinematic',
                    keywords: ['수능', '수험생', '11월'],
                },
                {
                    sceneNumber: 2,
                    narration: '[dummy] 2026학년도 수능, 국어 비문학이 달라집니다.',
                    imagePrompt:
                        '[dummy] Close-up of Korean language exam paper with highlighted passages, clean white background',
                    keywords: ['2026', '국어', '비문학'],
                },
                {
                    sceneNumber: 3,
                    narration: '[dummy] 수학 영역은 여전히 수험생들의 최대 난관.',
                    imagePrompt:
                        '[dummy] Complex math equations floating in a blue abstract digital space, dramatic lighting',
                    keywords: ['수학', '난관', '영역'],
                },
                {
                    sceneNumber: 4,
                    narration: '[dummy] 전문가들은 올해 수능 난이도가 작년보다 소폭 높아질 것으로 예측합니다.',
                    imagePrompt:
                        '[dummy] Expert teacher pointing at a graph showing difficulty trends, professional setting',
                    keywords: ['난이도', '전문가', '예측'],
                },
                {
                    sceneNumber: 5,
                    narration: '[dummy] 정시 원서 접수는 12월 초, 지금부터 전략이 필요합니다.',
                    imagePrompt: '[dummy] Calendar showing December dates circled in red, urgency visual',
                    keywords: ['정시', '원서접수', '전략'],
                },
                {
                    sceneNumber: 6,
                    narration: '[dummy] 합격의 비결은 단 하나 — 꾸준한 기출 분석과 약점 보완.',
                    imagePrompt:
                        '[dummy] Stack of past exam papers with sticky notes, organized study setup, motivational atmosphere',
                    keywords: ['합격', '기출', '약점보완'],
                },
                {
                    sceneNumber: 7,
                    narration: '[dummy] 지금 바로 전략을 세우세요. 당신의 합격을 응원합니다!',
                    imagePrompt:
                        '[dummy] Triumphant student raising fists in celebration, graduation cap flying, sunny campus background',
                    keywords: ['응원', '합격', '전략'],
                },
            ],
            metadata: {
                source: '[dummy] content-block',
                normalizedAt: new Date().toISOString(),
                sceneCount: 7,
                totalDurationSec: 45,
                language: 'ko',
            },
        };
        return { output, durationMs: Date.now() - start };
    },
};
