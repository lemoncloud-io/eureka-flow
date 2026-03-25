/**
 * Demo workflow definitions - example workflows for demo mode
 */

import type { EdgeData, NodeData } from '@flows/flows';

export interface DemoWorkflow {
    id: string;
    name: string;
    description: string;
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    nodes: NodeData[];
    edges: EdgeData[];
}

/**
 * AI 콘텐츠 생성기 - 템플릿 기반 AI 텍스트 생성 파이프라인
 *
 * Flow:
 *   [프롬프트 템플릿] ──→ [템플릿 변환기] ──→ [AI 텍스트] ──→ [미리보기]
 *   [주제]           ──↗       ↑
 *   [스타일]         ──────────↗
 *
 * Demonstrates: input → mustache template → AI generation → output
 */
export const DEMO_WORKFLOWS: DemoWorkflow[] = [
    {
        id: 'ai-content-generator',
        name: 'AI 콘텐츠 생성기',
        description: '템플릿 기반 AI 텍스트 생성 파이프라인',
        difficulty: 'intermediate',
        nodes: [
            // ── Inputs ──
            {
                id: 'prompt-template',
                type: 'input-text',
                blockId: '0004',
                position: { x: 100, y: 150 },
                customLabel: '프롬프트 템플릿',
                config: {
                    text: '{{topic}}에 대한 {{style}} 형식의 글을 작성하세요.\n\n요구사항:\n- 독자의 흥미를 끌 수 있는 도입부\n- 핵심 내용 3가지 포함\n- 자연스러운 마무리',
                },
            },
            {
                id: 'topic-input',
                type: 'input-text',
                blockId: '0004',
                position: { x: 100, y: 400 },
                customLabel: '주제',
                config: { text: '한국의 전통 음식 문화' },
            },
            {
                id: 'style-input',
                type: 'input-text',
                blockId: '0004',
                position: { x: 100, y: 600 },
                customLabel: '스타일',
                config: { text: '블로그 포스트' },
            },

            // ── Process ──
            {
                id: 'template-engine',
                type: 'mustache-text-generator',
                blockId: '0009',
                position: { x: 500, y: 300 },
                customLabel: '템플릿 변환',
                config: { text0: 'topic', text1: 'style' },
            },
            {
                id: 'ai-generator',
                type: 'single-output-generator',
                blockId: '0003',
                position: { x: 900, y: 300 },
                customLabel: 'AI 생성',
                config: { model: 'gemini-2.5-flash' },
            },

            // ── Outputs ──
            {
                id: 'result-preview',
                type: 'output-preview',
                blockId: '0007',
                position: { x: 1300, y: 200 },
                customLabel: '결과',
                config: {},
            },
            {
                id: 'debug-log',
                type: 'output-console',
                blockId: '0008',
                position: { x: 1300, y: 480 },
                customLabel: '디버그',
                config: { prefix: '[AI 콘텐츠]' },
            },
        ],
        edges: [
            // 템플릿 → 변환기
            {
                id: 'e1',
                sourceNodeId: 'prompt-template',
                sourcePortId: 'out',
                targetNodeId: 'template-engine',
                targetPortId: 'in',
            },
            // 주제 → 변환기 p0
            {
                id: 'e2',
                sourceNodeId: 'topic-input',
                sourcePortId: 'out',
                targetNodeId: 'template-engine',
                targetPortId: 'p0',
            },
            // 스타일 → 변환기 p1
            {
                id: 'e3',
                sourceNodeId: 'style-input',
                sourcePortId: 'out',
                targetNodeId: 'template-engine',
                targetPortId: 'p1',
            },
            // 변환기 → AI 생성 prompt
            {
                id: 'e4',
                sourceNodeId: 'template-engine',
                sourcePortId: 'out',
                targetNodeId: 'ai-generator',
                targetPortId: 'prompt',
            },
            // AI 결과 → 미리보기
            {
                id: 'e5',
                sourceNodeId: 'ai-generator',
                sourcePortId: 'out',
                targetNodeId: 'result-preview',
                targetPortId: 'in',
            },
            // AI 결과 → 디버그
            {
                id: 'e6',
                sourceNodeId: 'ai-generator',
                sourcePortId: 'out',
                targetNodeId: 'debug-log',
                targetPortId: 'in',
            },
        ],
    },
];

/**
 * Get a demo workflow by ID
 */
export const getDemoWorkflow = (id: string): DemoWorkflow | undefined => {
    return DEMO_WORKFLOWS.find(w => w.id === id);
};
