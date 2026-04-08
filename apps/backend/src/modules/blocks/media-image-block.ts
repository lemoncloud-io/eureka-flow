import type { BlockExecutor, BlockExecutorResult } from './types';

export const mediaImageBlock: BlockExecutor = {
    blockType: 'media-image',
    async execute(input: unknown, _config?: Record<string, unknown>): Promise<BlockExecutorResult> {
        const start = Date.now();
        const output = {
            images: [
                {
                    sceneNumber: 1,
                    url: 'fake://cdn.example.com/images/scene-001-student-study.jpg',
                    width: 1080,
                    height: 1920,
                    prompt: '[dummy] A student nervously studying late at night, books and notes spread on desk, warm lamp light, cinematic',
                },
                {
                    sceneNumber: 2,
                    url: 'fake://cdn.example.com/images/scene-002-exam-paper.jpg',
                    width: 1080,
                    height: 1920,
                    prompt: '[dummy] Close-up of Korean language exam paper with highlighted passages, clean white background',
                },
                {
                    sceneNumber: 3,
                    url: 'fake://cdn.example.com/images/scene-003-math-equations.jpg',
                    width: 1080,
                    height: 1920,
                    prompt: '[dummy] Complex math equations floating in a blue abstract digital space, dramatic lighting',
                },
                {
                    sceneNumber: 4,
                    url: 'fake://cdn.example.com/images/scene-004-expert-graph.jpg',
                    width: 1080,
                    height: 1920,
                    prompt: '[dummy] Expert teacher pointing at a graph showing difficulty trends, professional setting',
                },
                {
                    sceneNumber: 5,
                    url: 'fake://cdn.example.com/images/scene-005-calendar-december.jpg',
                    width: 1080,
                    height: 1920,
                    prompt: '[dummy] Calendar showing December dates circled in red, urgency visual',
                },
                {
                    sceneNumber: 6,
                    url: 'fake://cdn.example.com/images/scene-006-study-papers.jpg',
                    width: 1080,
                    height: 1920,
                    prompt: '[dummy] Stack of past exam papers with sticky notes, organized study setup, motivational atmosphere',
                },
                {
                    sceneNumber: 7,
                    url: 'fake://cdn.example.com/images/scene-007-student-celebration.jpg',
                    width: 1080,
                    height: 1920,
                    prompt: '[dummy] Triumphant student raising fists in celebration, graduation cap flying, sunny campus background',
                },
            ],
        };
        return { output, durationMs: Date.now() - start };
    },
};
