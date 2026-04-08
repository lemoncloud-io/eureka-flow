import { ORCHESTRATOR_SYSTEM_PROMPT, PROMPT_VERSION, buildUserPrompt } from './prompt-templates';
import { parseClaudeResponse } from './response-parser';
import { claudeAdapter } from '../../adapters/ai/claude-adapter';
import { traceService } from '../../services/trace-service';
import { generateNumericId } from '../../utils/id-generator';
import { log } from '../../utils/logger';

import type { Orchestrator, ProposalResult } from './types';

const MODEL = 'claude-sonnet-4-20250514';

const COST_ESTIMATES: Record<string, number> = {
    search: 0.02,
    content: 0.15,
    data: 0.01,
    analysis: 0.05,
    'media-image': 0.7,
    'media-tts': 0.1,
    'media-video': 0.2,
    integration: 0.02,
};

/**
 * Claude-based orchestrator.
 * Calls Claude API → parses JSON → validates with zod → builds proposal.
 * On failure: returns fallback error proposal with assistant error message.
 */
export const claudeOrchestrator: Orchestrator = {
    async generateProposal(flowId: string, userMessage: string): Promise<ProposalResult> {
        const startMs = Date.now();

        try {
            // 1. Call Claude
            const response = await claudeAdapter.chat({
                model: MODEL,
                systemPrompt: ORCHESTRATOR_SYSTEM_PROMPT,
                userMessage: buildUserPrompt(userMessage),
                maxTokens: 2048,
                temperature: 0.3,
            });

            // 2. Record trace: TOOL_CALL
            await traceService.record(flowId, null, 'TOOL_CALL', 'Claude orchestrator call', {
                promptVersion: PROMPT_VERSION,
                model: response.model,
                inputTokens: response.inputTokens,
                outputTokens: response.outputTokens,
                latencyMs: response.latencyMs,
                stopReason: response.stopReason,
            });

            // 3. Parse and validate
            const parseResult = parseClaudeResponse(response.content);

            if (!parseResult.ok) {
                // Record validation failure trace
                await traceService.record(flowId, null, 'ERROR', 'Claude output validation failed', {
                    error: parseResult.error,
                    zodErrors: parseResult.zodErrors,
                    rawContentLength: parseResult.rawContent.length,
                });

                // Return fallback error proposal
                return buildFallbackProposal(`AI 응답을 처리할 수 없습니다. 다시 시도해주세요. (${parseResult.error})`);
            }

            // 4. Convert to ProposalResult
            const { data } = parseResult;
            const nodes = data.blocks.map((block, i) => ({
                id: generateNumericId(),
                blockId: `blk-${block.type}`,
                name: block.label,
                blockType: block.type,
                position: { x: 300, y: 100 + i * 120 },
                state: 'IDLE',
                config: block.config,
            }));

            const edges = data.edges
                .map(edge => ({
                    id: generateNumericId(),
                    sourceNodeId: nodes[edge.from]?.id,
                    sourcePortId: 'out',
                    targetNodeId: nodes[edge.to]?.id,
                    targetPortId: 'in',
                }))
                .filter(e => e.sourceNodeId && e.targetNodeId);

            const breakdown = data.blocks.map(b => ({
                blockType: b.type,
                amount: COST_ESTIMATES[b.type] ?? 0.01,
            }));
            const total = data.estimatedCostUsd || breakdown.reduce((sum, b) => sum + b.amount, 0);

            // Record success trace
            await traceService.record(flowId, null, 'TOOL_RESULT', 'Claude proposal generated', {
                promptVersion: PROMPT_VERSION,
                blockCount: nodes.length,
                edgeCount: edges.length,
                estimatedCost: total,
                latencyMs: Date.now() - startMs,
            });

            return {
                proposedNodes: nodes,
                proposedEdges: edges,
                estimatedCost: {
                    currency: 'USD',
                    total: Math.round(total * 100) / 100,
                    breakdown,
                },
                approvalRequired: true,
                assistantMessage:
                    data.summary ||
                    `${nodes.length}개 블록이 필요합니다. 예상 비용: $${total.toFixed(2)}. 승인하시겠습니까?`,
            };
        } catch (err) {
            const latencyMs = Date.now() - startMs;
            log.error('Claude orchestrator failed', err);

            // Record provider failure trace
            await traceService.record(flowId, null, 'ERROR', 'Claude provider error', {
                error: err instanceof Error ? err.message : String(err),
                latencyMs,
                // Never log the full error stack in production traces
            });

            return buildFallbackProposal('AI 서비스에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해주세요.');
        }
    },
};

/**
 * Fallback proposal: empty blocks, error message as assistant response.
 * System doesn't crash; user gets a meaningful error message in chat.
 */
function buildFallbackProposal(errorMessage: string): ProposalResult {
    return {
        proposedNodes: [],
        proposedEdges: [],
        estimatedCost: { currency: 'USD', total: 0 },
        approvalRequired: false,
        assistantMessage: errorMessage,
    };
}
