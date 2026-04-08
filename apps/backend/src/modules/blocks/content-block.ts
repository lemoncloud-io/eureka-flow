import { extractTopic } from './search-block';
import { ContentOutputSchema } from './types';
import { claudeAdapter } from '../../adapters/ai/claude-adapter';
import { log } from '../../utils/logger';

import type { BlockExecutor, BlockExecutorResult } from './types';

// ── Prompts ──────────────────────────────────────────────────────────────────

const CONTENT_SYSTEM_PROMPT = `You are a Korean YouTube Shorts scriptwriter specialising in education and university admission content.
Given keywords and/or article summaries, generate a complete 7-scene short-form video script in Korean.

Requirements:
- hook: a punchy opening question or statement (1–2 sentences)
- scenes: exactly 7 scenes, each with:
  - sceneNumber (1–7)
  - narration: Korean voice-over text (2–4 sentences, 20–60 characters each)
  - imagePrompt: English AI image generation prompt (vivid, cinematic)
  - durationSec: 5–8 seconds per scene
- cta: call-to-action closing line (subscribe/follow prompt in Korean)
- totalDurationSec: sum of all scene durations

Respond with JSON only — no markdown fences, no extra text:
{
  "hook": "...",
  "scenes": [
    { "sceneNumber": 1, "narration": "...", "imagePrompt": "...", "durationSec": 6 },
    ...
  ],
  "cta": "...",
  "totalDurationSec": 45
}`;

// ── Dummy (mock mode) ─────────────────────────────────────────────────────────

function dummyContent(): BlockExecutorResult {
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
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a descriptive user message from the search block's output (or any input).
 */
function buildUserMessage(input: unknown): string {
    if (input == null) return '주제: 입시 트렌드';

    if (typeof input === 'object' && !Array.isArray(input)) {
        const obj = input as Record<string, unknown>;
        const parts: string[] = [];

        if (Array.isArray(obj['keywords']) && (obj['keywords'] as unknown[]).length > 0) {
            parts.push(`키워드: ${(obj['keywords'] as unknown[]).map(k => String(k)).join(', ')}`);
        }

        if (Array.isArray(obj['articles']) && (obj['articles'] as unknown[]).length > 0) {
            const summaries = (obj['articles'] as Record<string, unknown>[])
                .slice(0, 3)
                .map(a => `- ${String(a['title'] ?? '')}${a['summary'] ? ': ' + String(a['summary']) : ''}`)
                .join('\n');
            parts.push(`관련 기사:\n${summaries}`);
        }

        if (parts.length > 0) return parts.join('\n\n');
    }

    // Fallback: use topic extraction
    return `주제: ${extractTopic(input)}`;
}

// ── Executor ──────────────────────────────────────────────────────────────────

export const contentBlock: BlockExecutor = {
    blockType: 'content',

    async execute(input: unknown, _config?: Record<string, unknown>): Promise<BlockExecutorResult> {
        const mode = process.env.ORCHESTRATOR_MODE ?? 'mock';
        if (mode !== 'claude') return dummyContent();

        const start = Date.now();
        const userMessage = buildUserMessage(input);

        log.info('[content-block] Starting AI script generation', { messageLength: userMessage.length });

        const response = await claudeAdapter.chat({
            model: 'claude-sonnet-4-5',
            systemPrompt: CONTENT_SYSTEM_PROMPT,
            userMessage,
            maxTokens: 2048,
            temperature: 0.7,
        });

        let parsed: unknown;
        try {
            parsed = JSON.parse(response.content);
        } catch {
            throw new Error(`[content-block] Claude returned non-JSON response (length=${response.content.length})`);
        }

        const validated = ContentOutputSchema.safeParse(parsed);
        if (!validated.success) {
            throw new Error(`[content-block] Output schema validation failed: ${validated.error.message}`);
        }

        if (validated.data.scenes.length !== 7) {
            throw new Error(`[content-block] Expected 7 scenes, got ${validated.data.scenes.length}`);
        }

        log.info('[content-block] Script generation complete', {
            sceneCount: validated.data.scenes.length,
            totalDurationSec: validated.data.totalDurationSec,
            latencyMs: response.latencyMs,
        });

        return { output: validated.data as Record<string, unknown>, durationMs: Date.now() - start };
    },
};
