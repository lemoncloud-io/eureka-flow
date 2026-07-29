import type { AgentEnvironmentSupportable } from '../environment';
import type { HttpRequestSupportable } from '../http';
import type { ChatRequest, Chunk, LlmGateway, LlmGatewayCapabilities } from './llmGateway';

export interface GeminiLlmGatewayOptions {
    /** Provides tracing, time, and cancellation. */
    environment: AgentEnvironmentSupportable;
    /** HTTP port. */
    http: HttpRequestSupportable;
    /** Gemini API key; sent as the x-goog-api-key header, never traced. */
    apiKey: string;
    /** Defaults to gemini-2.5-flash. */
    model?: string;
    /** Override to route through a backend proxy. */
    baseUrl?: string;
    /** Optional generation parameters applied to every request. */
    generation?: { temperature?: number; maxOutputTokens?: number };
}

/** The Gemini gateway: the shared contract plus provider/model identity. */
export interface GeminiLlmGateway extends LlmGateway {
    readonly capabilities: LlmGatewayCapabilities;
    readonly provider: 'gemini';
    readonly model: string;
}

const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com';
const ERROR_BODY_SNIPPET_LENGTH = 200;
const TEXT_ONLY = 'Gemini gateway is text-only in this slice (capabilities.toolCalls = false)';

/** A provider/proxy could echo request data back; scrub the key before it reaches an error. */
const redactText = (value: string, secret: string): string =>
    secret.length > 0 ? value.split(secret).join('[redacted]') : value;

interface GeminiContent {
    role: 'user' | 'model';
    parts: Array<{ text: string }>;
}

/** Map the provider-neutral request onto Gemini's generateContent shape; system messages become the systemInstruction. */
const toGeminiRequest = (req: ChatRequest, generation?: GeminiLlmGatewayOptions['generation']) => {
    if (req.tools.length > 0) {
        throw new Error(`${TEXT_ONLY}: tool definitions are not supported`);
    }

    const systemTexts: string[] = [];
    const contents: GeminiContent[] = [];

    for (const message of req.messages) {
        if (message.role === 'tool' || (message.toolCalls?.length ?? 0) > 0) {
            throw new Error(`${TEXT_ONLY}: tool messages are not supported`);
        }
        if (message.role === 'system') {
            systemTexts.push(message.content ?? '');
            continue;
        }
        contents.push({
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: message.content ?? '' }],
        });
    }

    const generationConfig = {
        ...(generation?.temperature !== undefined ? { temperature: generation.temperature } : {}),
        ...(generation?.maxOutputTokens !== undefined ? { maxOutputTokens: generation.maxOutputTokens } : {}),
    };

    return {
        contents,
        ...(systemTexts.length > 0 ? { systemInstruction: { parts: [{ text: systemTexts.join('\n\n') }] } } : {}),
        ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : {}),
    };
};

interface GeminiResponse {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

/** LlmGateway backed by Google Gemini's generateContent API; text-only (no tool calls). */
export const createGeminiLlmGateway = (options: GeminiLlmGatewayOptions): GeminiLlmGateway => {
    const { environment, http, apiKey } = options;
    const model = options.model ?? DEFAULT_MODEL;
    const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    const trace = environment.traceReporter;

    async function* chat(req: ChatRequest, opts?: { signal?: AbortSignal }): AsyncIterable<Chunk> {
        const startedAt = environment.now();
        const body = toGeminiRequest(req, options.generation);

        trace?.debug('llm.gemini.request', { model, messageCount: req.messages.length });

        const response = await http.request({
            method: 'POST',
            url: `${baseUrl}/v1beta/models/${model}:generateContent`,
            headers: { 'x-goog-api-key': apiKey },
            body,
            ...(opts?.signal ? { signal: opts.signal } : {}),
        });

        if (!response.ok) {
            const errorBody = await response.text().catch(() => '');
            const safeBody = redactText(errorBody, apiKey);

            trace?.error('llm.gemini.error', { model, status: response.status });
            throw new Error(
                `Gemini request failed with status ${response.status}: ${safeBody.slice(0, ERROR_BODY_SNIPPET_LENGTH)}`
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

        if (text) {
            yield { text };
        }
        yield { done: true, ...(usage ? { usage } : {}) };
    }

    return {
        capabilities: { toolCalls: false },
        provider: 'gemini',
        model,
        chat,
    };
};
