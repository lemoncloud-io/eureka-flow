import { createGeminiLlmGateway } from './GeminiLlmGateway';
import { createVirtualAgentEnvironment } from '../environment/createVirtualAgentEnvironment';
import { createFetchHttpRequest } from '../http/FetchHttpRequest';

import type { GeminiGenerationConfig } from './GeminiLlmGateway';
import type { LlmGateway } from './llmGateway';

/**
 * The one seam that builds the real Gemini gateway from the environment — shared by the live specs and the
 * local terminal, so a credential/model change is one edit. GEMINI_API_KEY set → the Gemini Developer API;
 * else → undefined (a live spec skips; the terminal prints the env contract and exits).
 *
 * Reads `process.env` only inside the function, so it is safe to export from the barrel — the browser bundle
 * never invokes it.
 */

export interface LiveGatewayConfig {
    /** Model id; defaults to GEMINI_MODEL, else gemini-2.5-flash. */
    model?: string;
    /** Per-spec generation params (temperature, thinkingBudget, maxOutputTokens). */
    generation?: GeminiGenerationConfig;
}

/** The model a live run targets: GEMINI_MODEL override, else gemini-2.5-flash. */
export const liveModel = (): string => process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

/** Which provider {@link resolveLiveGateway} would pick from the current env — for scorecard/log labelling. */
export const liveProvider = (): 'gemini' | 'none' => (process.env.GEMINI_API_KEY ? 'gemini' : 'none');

/** Resolve the real gateway from the environment (see the module doc); undefined = no credential. */
export const resolveLiveGateway = ({ model, generation }: LiveGatewayConfig = {}): LlmGateway | undefined => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return undefined;

    const environment = createVirtualAgentEnvironment();
    const http = createFetchHttpRequest();
    const resolvedModel = model ?? liveModel();
    // Optional env-tuned 429/503 retry (LLM_RETRY_ATTEMPTS / LLM_RETRY_BASE_MS); unset → the gateway's 4×/1s default.
    const retryAttempts = Number(process.env.LLM_RETRY_ATTEMPTS);
    const retryBaseMs = Number(process.env.LLM_RETRY_BASE_MS);
    const retry =
        Number.isFinite(retryAttempts) || Number.isFinite(retryBaseMs)
            ? {
                  ...(Number.isFinite(retryAttempts) ? { maxAttempts: retryAttempts } : {}),
                  ...(Number.isFinite(retryBaseMs) ? { baseDelayMs: retryBaseMs } : {}),
              }
            : undefined;
    const gen = { ...(generation ? { generation } : {}), ...(retry ? { retry } : {}) };

    return createGeminiLlmGateway({ environment, http, apiKey, model: resolvedModel, ...gen });
};
