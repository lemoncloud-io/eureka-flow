import { AnalysisOutputSchema } from './types';
import { claudeAdapter } from '../../adapters/ai/claude-adapter';
import { log } from '../../utils/logger';

import type { BlockExecutor, BlockExecutorResult } from './types';

// ── Constants ─────────────────────────────────────────────────────────────────

const BANNED_KEYWORDS = ['정치', '성인', '도박', '폭력', '마약', '음란', '혐오', '사기', '불법'];

const MIN_NARRATION_CHARS = 10;
const MAX_NARRATION_CHARS = 300;
const EXPECTED_SCENE_COUNT = 7;

const SAFETY_THRESHOLD = 70;
const QUALITY_THRESHOLD = 60;

// ── Prompts ───────────────────────────────────────────────────────────────────

const ANALYSIS_SYSTEM_PROMPT = `You are a Korean YouTube Shorts content safety and quality reviewer.
Review the provided scene narrations and return a brief assessment.

Respond with JSON only — no markdown fences, no extra text:
{
  "safetyComment": "brief safety assessment in Korean (1–2 sentences)",
  "qualityComment": "brief quality assessment in Korean (1–2 sentences)",
  "flaggedScenes": [<sceneNumber>, ...],
  "suggestedIssues": [
    { "severity": "low|medium|high|critical", "message": "...", "sceneNumber": <optional> }
  ]
}`;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Issue {
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    sceneNumber?: number;
}

interface NormalizedScene {
    sceneNumber?: unknown;
    narration?: unknown;
    imagePrompt?: unknown;
    keywords?: unknown;
}

// ── Dummy (mock mode) ─────────────────────────────────────────────────────────

function dummyAnalysis(): BlockExecutorResult {
    const start = Date.now();
    const output = {
        safetyScore: 95,
        qualityScore: 88,
        issues: [],
        approved: true,
    };
    return { output, durationMs: Date.now() - start };
}

// ── Rule-based checks ─────────────────────────────────────────────────────────

function runRuleChecks(scenes: NormalizedScene[]): {
    safetyScore: number;
    qualityScore: number;
    issues: Issue[];
} {
    const issues: Issue[] = [];
    let safetyDeductions = 0;
    let qualityDeductions = 0;

    // 1. Scene count check
    if (scenes.length !== EXPECTED_SCENE_COUNT) {
        const severity = scenes.length === 0 ? 'critical' : 'medium';
        issues.push({
            severity,
            message: `씬 수가 ${EXPECTED_SCENE_COUNT}개여야 하나 ${scenes.length}개입니다.`,
        });
        qualityDeductions += scenes.length === 0 ? 40 : 10;
    }

    // 2. Per-scene checks
    for (const scene of scenes) {
        const sceneNum = typeof scene.sceneNumber === 'number' ? scene.sceneNumber : undefined;
        const narration = typeof scene.narration === 'string' ? scene.narration : '';

        // Narration length
        if (narration.length < MIN_NARRATION_CHARS) {
            issues.push({
                severity: 'medium',
                message: `나레이션이 너무 짧습니다 (${narration.length}자). 최소 ${MIN_NARRATION_CHARS}자 필요.`,
                sceneNumber: sceneNum,
            });
            qualityDeductions += 5;
        } else if (narration.length > MAX_NARRATION_CHARS) {
            issues.push({
                severity: 'low',
                message: `나레이션이 너무 깁니다 (${narration.length}자). 최대 ${MAX_NARRATION_CHARS}자 권장.`,
                sceneNumber: sceneNum,
            });
            qualityDeductions += 3;
        }

        // Banned keyword check
        const combinedText = [narration, typeof scene.imagePrompt === 'string' ? scene.imagePrompt : '']
            .join(' ')
            .toLowerCase();

        for (const banned of BANNED_KEYWORDS) {
            if (combinedText.includes(banned)) {
                issues.push({
                    severity: 'high',
                    message: `금지 키워드 "${banned}" 감지됨.`,
                    sceneNumber: sceneNum,
                });
                safetyDeductions += 20;
                break; // one deduction per scene
            }
        }
    }

    // 3. Empty scenes check
    const emptyNarrations = scenes.filter(
        s => typeof s.narration !== 'string' || (s.narration as string).trim().length === 0
    ).length;
    if (emptyNarrations > 0) {
        issues.push({
            severity: 'high',
            message: `${emptyNarrations}개 씬의 나레이션이 비어있습니다.`,
        });
        qualityDeductions += emptyNarrations * 8;
    }

    const safetyScore = Math.max(0, Math.min(100, 100 - safetyDeductions));
    const qualityScore = Math.max(0, Math.min(100, 100 - qualityDeductions));

    return { safetyScore, qualityScore, issues };
}

// ── AI enhancement ────────────────────────────────────────────────────────────

async function runAIReview(scenes: NormalizedScene[], ruleIssues: Issue[]): Promise<Issue[]> {
    const narrationSummary = scenes
        .map(s => `씬 ${String(s.sceneNumber ?? '?')}: ${String(s.narration ?? '')}`)
        .join('\n');

    let response;
    try {
        response = await claudeAdapter.chat({
            model: 'claude-haiku-4-5',
            systemPrompt: ANALYSIS_SYSTEM_PROMPT,
            userMessage: `다음 씬 나레이션을 검토해주세요:\n\n${narrationSummary}`,
            maxTokens: 512,
            temperature: 0.2,
        });
    } catch (err) {
        log.warn('[analysis-block] AI review failed (non-fatal), using rule-based only', {
            error: err instanceof Error ? err.message : String(err),
        });
        return ruleIssues;
    }

    let aiResult: {
        flaggedScenes?: unknown[];
        suggestedIssues?: Array<{ severity?: string; message?: string; sceneNumber?: number }>;
    };

    try {
        aiResult = JSON.parse(response.content);
    } catch {
        log.warn('[analysis-block] AI review returned non-JSON, ignoring AI enhancement');
        return ruleIssues;
    }

    const aiIssues: Issue[] = [];
    if (Array.isArray(aiResult.suggestedIssues)) {
        for (const issue of aiResult.suggestedIssues) {
            const severities = ['low', 'medium', 'high', 'critical'] as const;
            const sev = severities.includes(issue.severity as (typeof severities)[number])
                ? (issue.severity as Issue['severity'])
                : 'low';

            aiIssues.push({
                severity: sev,
                message: String(issue.message ?? ''),
                sceneNumber: typeof issue.sceneNumber === 'number' ? issue.sceneNumber : undefined,
            });
        }
    }

    // Deduplicate: skip AI issues that overlap with rule-based issues
    const combined = [...ruleIssues];
    for (const ai of aiIssues) {
        const duplicate = combined.some(r => r.sceneNumber === ai.sceneNumber && r.message === ai.message);
        if (!duplicate) combined.push(ai);
    }

    return combined;
}

// ── Executor ──────────────────────────────────────────────────────────────────

export const analysisBlock: BlockExecutor = {
    blockType: 'analysis',

    async execute(input: unknown, _config?: Record<string, unknown>): Promise<BlockExecutorResult> {
        const mode = process.env.ORCHESTRATOR_MODE ?? 'mock';
        if (mode !== 'claude') return dummyAnalysis();

        const start = Date.now();

        // Extract normalizedScenes from data-block output
        let scenes: NormalizedScene[] = [];
        if (input != null && typeof input === 'object' && !Array.isArray(input)) {
            const obj = input as Record<string, unknown>;
            if (Array.isArray(obj['normalizedScenes'])) {
                scenes = obj['normalizedScenes'] as NormalizedScene[];
            }
        }

        if (scenes.length === 0) {
            log.warn('[analysis-block] No normalizedScenes found in input, running checks on empty set');
        }

        // Rule-based checks (always run)
        const { safetyScore, qualityScore, issues: ruleIssues } = runRuleChecks(scenes);

        // AI enhancement (claude mode only, non-fatal if fails)
        const allIssues = await runAIReview(scenes, ruleIssues);

        const approved = safetyScore >= SAFETY_THRESHOLD && qualityScore >= QUALITY_THRESHOLD;

        const output = {
            safetyScore,
            qualityScore,
            issues: allIssues,
            approved,
        };

        const validated = AnalysisOutputSchema.safeParse(output);
        if (!validated.success) {
            throw new Error(`[analysis-block] Output schema validation failed: ${validated.error.message}`);
        }

        log.info('[analysis-block] Analysis complete', {
            safetyScore,
            qualityScore,
            issueCount: allIssues.length,
            approved,
        });

        return { output: validated.data as Record<string, unknown>, durationMs: Date.now() - start };
    },
};
