/**
 * LlmGateway contract (W04)
 *
 * One narrow completion interface in front of every LLM provider. The first provider is
 * Gemini 2.5 Flash; GPT, Claude, and OpenRouter follow as further implementations of the
 * same contract. Gateways depend only on the Agent Environment (tracing, time,
 * cancellation) and the HTTP port — never on browser globals.
 */

export type LlmRole = 'system' | 'user' | 'assistant';

export interface LlmMessage {
    role: LlmRole;
    content: string;
}

export interface LlmCompletionInput {
    messages: LlmMessage[];
    temperature?: number;
    maxOutputTokens?: number;
    /** Cancellation signal, typically from AgentEnvironmentSupportable.createAbortController(). */
    signal?: AbortSignal;
}

export interface LlmUsage {
    inputTokens?: number;
    outputTokens?: number;
}

export interface LlmCompletionResult {
    text: string;
    provider: string;
    model: string;
    usage?: LlmUsage;
}

export interface LlmGatewaySupportable {
    readonly provider: string;
    readonly model: string;
    complete(input: LlmCompletionInput): Promise<LlmCompletionResult>;
}
