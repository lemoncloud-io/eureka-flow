import { SearchOutputSchema } from './types';
import { claudeAdapter } from '../../adapters/ai/claude-adapter';
import { log } from '../../utils/logger';

import type { BlockExecutor, BlockExecutorResult } from './types';

// ── Prompts ──────────────────────────────────────────────────────────────────

const SEARCH_SYSTEM_PROMPT = `You are a Korean education and university-admission trends researcher.
Given a topic, identify:
1. Top 5 relevant Korean keywords (단어/구문)
2. 3 recent news article summaries (realistic Korean titles, plausible source names, informative summaries)
3. A trend score from 0 to 100 reflecting how trending the topic is right now

Respond with JSON only — no markdown fences, no extra text:
{
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "articles": [
    { "title": "...", "url": "https://example.com/...", "source": "...", "summary": "..." },
    { "title": "...", "url": "https://example.com/...", "source": "...", "summary": "..." },
    { "title": "...", "url": "https://example.com/...", "source": "...", "summary": "..." }
  ],
  "trendScore": 80
}`;

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Safely extract a topic string from an unknown block input payload.
 * - null/undefined  → default "입시 트렌드"
 * - string          → use directly
 * - object with keywords array → join first 3 keywords
 * - object with content/text string → use as topic
 * - anything else   → JSON stringify (truncated)
 */
export function extractTopic(input: unknown): string {
    if (input == null) return '입시 트렌드';
    if (typeof input === 'string') return input.slice(0, 200);

    if (typeof input === 'object' && !Array.isArray(input)) {
        const obj = input as Record<string, unknown>;

        if (Array.isArray(obj['keywords']) && (obj['keywords'] as unknown[]).length > 0) {
            return (obj['keywords'] as unknown[])
                .slice(0, 3)
                .map(k => String(k))
                .join(', ');
        }

        if (typeof obj['content'] === 'string') return obj['content'].slice(0, 200);
        if (typeof obj['text'] === 'string') return obj['text'].slice(0, 200);
        if (typeof obj['topic'] === 'string') return obj['topic'].slice(0, 200);
    }

    return String(JSON.stringify(input)).slice(0, 200);
}

// ── Dummy (mock mode) ─────────────────────────────────────────────────────────

function dummySearch(): BlockExecutorResult {
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
}

// ── Executor ──────────────────────────────────────────────────────────────────

export const searchBlock: BlockExecutor = {
    blockType: 'search',

    async execute(input: unknown, _config?: Record<string, unknown>): Promise<BlockExecutorResult> {
        const mode = process.env.ORCHESTRATOR_MODE ?? 'mock';
        if (mode !== 'claude') return dummySearch();

        const start = Date.now();
        const topic = extractTopic(input);

        log.info('[search-block] Starting AI search', { topicLength: topic.length });

        const response = await claudeAdapter.chat({
            model: 'claude-haiku-4-5',
            systemPrompt: SEARCH_SYSTEM_PROMPT,
            userMessage: `주제: ${topic}`,
            maxTokens: 1024,
            temperature: 0.5,
        });

        let parsed: unknown;
        try {
            parsed = JSON.parse(response.content);
        } catch {
            throw new Error(`[search-block] Claude returned non-JSON response (length=${response.content.length})`);
        }

        const validated = SearchOutputSchema.safeParse(parsed);
        if (!validated.success) {
            throw new Error(`[search-block] Output schema validation failed: ${validated.error.message}`);
        }

        log.info('[search-block] AI search complete', {
            keywords: validated.data.keywords.length,
            articles: validated.data.articles.length,
            trendScore: validated.data.trendScore,
            latencyMs: response.latencyMs,
        });

        return { output: validated.data as Record<string, unknown>, durationMs: Date.now() - start };
    },
};
