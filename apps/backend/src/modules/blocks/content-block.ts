import type { BlockExecutor, BlockExecutorResult } from './types';

export const contentBlock: BlockExecutor = {
    blockType: 'content',
    async execute(input: unknown, _config?: Record<string, unknown>): Promise<BlockExecutorResult> {
        const start = Date.now();
        const output = {
            hook: '[dummy] 2026 수능, 올해 수험생들이 가장 두려워하는 과목은?',
            scenes: [
                {
                    sceneNumber: 1,
                    narration: '[dummy] 매년 11월, 수험생들의 운명을 가르는 수능이 다가옵니다.',
                    imagePrompt:
                        '[dummy] A student nervously studying late at night, books and notes spread on desk, warm lamp light, cinematic',
                    durationSec: 6,
                },
                {
                    sceneNumber: 2,
                    narration: '[dummy] 2026학년도 수능, 국어 비문학이 달라집니다.',
                    imagePrompt:
                        '[dummy] Close-up of Korean language exam paper with highlighted passages, clean white background',
                    durationSec: 6,
                },
                {
                    sceneNumber: 3,
                    narration: '[dummy] 수학 영역은 여전히 수험생들의 최대 난관.',
                    imagePrompt:
                        '[dummy] Complex math equations floating in a blue abstract digital space, dramatic lighting',
                    durationSec: 7,
                },
                {
                    sceneNumber: 4,
                    narration: '[dummy] 전문가들은 올해 수능 난이도가 작년보다 소폭 높아질 것으로 예측합니다.',
                    imagePrompt:
                        '[dummy] Expert teacher pointing at a graph showing difficulty trends, professional setting',
                    durationSec: 7,
                },
                {
                    sceneNumber: 5,
                    narration: '[dummy] 정시 원서 접수는 12월 초, 지금부터 전략이 필요합니다.',
                    imagePrompt: '[dummy] Calendar showing December dates circled in red, urgency visual',
                    durationSec: 6,
                },
                {
                    sceneNumber: 6,
                    narration: '[dummy] 합격의 비결은 단 하나 — 꾸준한 기출 분석과 약점 보완.',
                    imagePrompt:
                        '[dummy] Stack of past exam papers with sticky notes, organized study setup, motivational atmosphere',
                    durationSec: 7,
                },
                {
                    sceneNumber: 7,
                    narration: '[dummy] 지금 바로 전략을 세우세요. 당신의 합격을 응원합니다!',
                    imagePrompt:
                        '[dummy] Triumphant student raising fists in celebration, graduation cap flying, sunny campus background',
                    durationSec: 6,
                },
            ],
            cta: '[dummy] 구독하고 매일 입시 트렌드를 받아보세요!',
            totalDurationSec: 45,
        };
        return { output, durationMs: Date.now() - start };
    },
};
