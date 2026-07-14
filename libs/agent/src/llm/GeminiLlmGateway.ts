import type { AgentEnvironmentSupportable } from '../environment';
import type { HttpRequestSupportable } from '../http';
import type { LlmCompletionInput, LlmCompletionResult, LlmGatewaySupportable, LlmMessage } from './types';

export interface GeminiLlmGatewayOptions {
    /** Provides tracing, time, and cancellation; the gateway touches no browser globals. */
    environment: AgentEnvironmentSupportable;
    /** HTTP port. Swap the implementation (or baseUrl) for a backend proxy when direct browser calls are blocked. */
    http: HttpRequestSupportable;
    /** Gemini API key. Sent as the x-goog-api-key header — never in the URL, never traced. */
    apiKey: string;
    /** Defaults to gemini-2.5-flash, the W04 first provider. */
    model?: string;
    /** Override to route through a backend proxy without changing the gateway. */
    baseUrl?: string;
}

const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com';
const ERROR_BODY_SNIPPET_LENGTH = 200;

interface GeminiContent {
    role: 'user' | 'model';
    parts: Array<{ text: string }>;
}

/** Gemini has no system role in contents; system messages become the systemInstruction. */
const toGeminiRequest = (input: LlmCompletionInput) => {
    const systemMessages = input.messages.filter(message => message.role === 'system');
    const turnMessages = input.messages.filter(message => message.role !== 'system');

    const contents: GeminiContent[] = turnMessages.map((message: LlmMessage) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
    }));

    const generationConfig = {
        ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
        ...(input.maxOutputTokens !== undefined ? { maxOutputTokens: input.maxOutputTokens } : {}),
    };

    return {
        contents,
        ...(systemMessages.length > 0
            ? { systemInstruction: { parts: [{ text: systemMessages.map(message => message.content).join('\n\n') }] } }
            : {}),
        ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : {}),
    };
};

interface GeminiResponse {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

/**
 * LlmGateway implementation for Google Gemini (generateContent API). Errors carry the
 * HTTP status and a short body snippet for diagnosis; the API key appears in neither
 * errors nor traces.
 */
export const createGeminiLlmGateway = (options: GeminiLlmGatewayOptions): LlmGatewaySupportable => {
    const { environment, http, apiKey } = options;
    const model = options.model ?? DEFAULT_MODEL;
    const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    const trace = environment.traceReporter;

    return {
        provider: 'gemini',
        model,
        complete: async (input): Promise<LlmCompletionResult> => {
            const startedAt = environment.now();

            trace?.debug('llm.gemini.request', { model, messageCount: input.messages.length });

            const response = await http.request({
                method: 'POST',
                url: `${baseUrl}/v1beta/models/${model}:generateContent`,
                headers: { 'x-goog-api-key': apiKey },
                body: toGeminiRequest(input),
                ...(input.signal ? { signal: input.signal } : {}),
            });

            if (!response.ok) {
                const body = await response.text().catch(() => '');

                trace?.error('llm.gemini.error', { model, status: response.status });
                throw new Error(
                    `Gemini request failed with status ${response.status}: ${body.slice(0, ERROR_BODY_SNIPPET_LENGTH)}`
                );
            }

            const payload = (await response.json()) as GeminiResponse;
            const parts = payload.candidates?.[0]?.content?.parts;

            if (!parts || parts.length === 0) {
                trace?.error('llm.gemini.error', { model, status: response.status, reason: 'no candidates' });
                throw new Error('Gemini response contained no candidates');
            }

            const text = parts.map(part => part.text ?? '').join('');
            const usage = payload.usageMetadata
                ? {
                      ...(payload.usageMetadata.promptTokenCount !== undefined
                          ? { inputTokens: payload.usageMetadata.promptTokenCount }
                          : {}),
                      ...(payload.usageMetadata.candidatesTokenCount !== undefined
                          ? { outputTokens: payload.usageMetadata.candidatesTokenCount }
                          : {}),
                  }
                : undefined;

            trace?.debug('llm.gemini.response', {
                model,
                status: response.status,
                textLength: text.length,
                durationMs: environment.now() - startedAt,
                ...(usage ? { usage } : {}),
            });

            return {
                text,
                provider: 'gemini',
                model,
                ...(usage ? { usage } : {}),
            };
        },
    };
};
