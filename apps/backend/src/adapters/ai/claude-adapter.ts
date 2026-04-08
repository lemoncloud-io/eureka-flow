import Anthropic from '@anthropic-ai/sdk';

import { log } from '../../utils/logger';

/**
 * Claude API adapter.
 * Wraps @anthropic-ai/sdk with:
 * - Latency tracking
 * - Token usage extraction
 * - API key masking in logs
 * - Error classification
 */

let _client: Anthropic | null = null;

const getClient = (): Anthropic => {
    if (!_client) {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
        _client = new Anthropic({ apiKey });
    }
    return _client;
};

export interface ClaudeRequest {
    model: string;
    systemPrompt: string;
    userMessage: string;
    maxTokens?: number;
    temperature?: number;
}

export interface ClaudeResponse {
    content: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    stopReason: string | null;
}

export const claudeAdapter = {
    async chat(request: ClaudeRequest): Promise<ClaudeResponse> {
        const client = getClient();
        const start = Date.now();

        log.info('Claude API call', {
            model: request.model,
            maxTokens: request.maxTokens,
            // Never log API key or full prompt content
            systemPromptLength: request.systemPrompt.length,
            userMessageLength: request.userMessage.length,
        });

        try {
            const response = await client.messages.create({
                model: request.model,
                max_tokens: request.maxTokens ?? 4096,
                temperature: request.temperature ?? 0.7,
                system: request.systemPrompt,
                messages: [{ role: 'user', content: request.userMessage }],
            });

            const latencyMs = Date.now() - start;
            const content = response.content
                .filter((block): block is Anthropic.TextBlock => block.type === 'text')
                .map(block => block.text)
                .join('\n');

            const result: ClaudeResponse = {
                content,
                model: response.model,
                inputTokens: response.usage.input_tokens,
                outputTokens: response.usage.output_tokens,
                latencyMs,
                stopReason: response.stop_reason,
            };

            log.info('Claude API response', {
                model: result.model,
                inputTokens: result.inputTokens,
                outputTokens: result.outputTokens,
                latencyMs: result.latencyMs,
                stopReason: result.stopReason,
                contentLength: content.length,
            });

            return result;
        } catch (err) {
            const latencyMs = Date.now() - start;
            log.error('Claude API error', { latencyMs, error: err instanceof Error ? err.message : String(err) });
            throw err;
        }
    },
};
