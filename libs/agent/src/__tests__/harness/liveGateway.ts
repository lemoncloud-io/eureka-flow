import { createVirtualAgentEnvironment } from '../../environment/createVirtualAgentEnvironment';
import { createFetchHttpRequest } from '../../http/FetchHttpRequest';
import { createGeminiLlmGateway, createVertexLlmGateway } from '../../llm/GeminiLlmGateway';

import type { GeminiGenerationConfig } from '../../llm/GeminiLlmGateway';
import type { LlmGateway } from '../../llm/llmGateway';

/**
 * The ONE seam that picks which real provider a live spec talks to (vertex-migration.md). Every live spec routes
 * its gateway through here instead of constructing one inline, so switching the whole suite to Vertex is a matter
 * of setting env — no per-spec edit. Selection, in order:
 *   1. VERTEX_PROJECT + VERTEX_ACCESS_TOKEN set → Vertex AI (draws the $300 trial credit). The token comes from
 *      `gcloud auth print-access-token` (valid ~1h; re-export when it lapses) or any OAuth2 source.
 *   2. else GEMINI_API_KEY set → the Gemini Developer API (the prior default; behavior unchanged).
 *   3. else → undefined: no credential, so the spec skips (SKIP_LIVE = !gateway || !RUN_LIVE).
 */

export interface LiveGatewayConfig {
    /** Model id; defaults to GEMINI_MODEL, else gemini-2.5-flash. */
    model?: string;
    /** Per-spec generation params (temperature, thinkingBudget, maxOutputTokens). */
    generation?: GeminiGenerationConfig;
}

/** The model a live run targets: GEMINI_MODEL override, else gemini-2.5-flash. */
export const liveModel = (): string => process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

/**
 * Which provider {@link resolveLiveGateway} would pick from the current env — for scorecard/log labelling.
 * `LLM_PROVIDER` (vertex|gemini) forces it; otherwise auto (Vertex if configured, else the Developer key).
 */
export const liveProvider = (): 'vertex' | 'gemini' | 'none' => {
    const forced = process.env.LLM_PROVIDER?.toLowerCase();
    const hasVertex = !!(process.env.VERTEX_PROJECT && process.env.VERTEX_ACCESS_TOKEN);
    const hasGemini = !!process.env.GEMINI_API_KEY;
    if (forced === 'vertex') return hasVertex ? 'vertex' : 'none';
    if (forced === 'gemini' || forced === 'developer') return hasGemini ? 'gemini' : 'none';
    if (hasVertex) return 'vertex';
    if (hasGemini) return 'gemini';
    return 'none';
};

/** Resolve the real gateway a live spec should use from the environment (see the module doc); undefined = skip. */
export const resolveLiveGateway = ({ model, generation }: LiveGatewayConfig = {}): LlmGateway | undefined => {
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
    // generation + optional retry, spread into whichever provider is built.
    const gen = { ...(generation ? { generation } : {}), ...(retry ? { retry } : {}) };

    const project = process.env.VERTEX_PROJECT;
    const token = process.env.VERTEX_ACCESS_TOKEN;
    const apiKey = process.env.GEMINI_API_KEY;

    const buildVertex = (): LlmGateway | undefined =>
        project && token
            ? createVertexLlmGateway({
                  environment,
                  http,
                  project,
                  location: process.env.VERTEX_LOCATION ?? 'global',
                  // Re-read per call so a refreshed VERTEX_ACCESS_TOKEN is picked up without rebuilding the gateway.
                  getAccessToken: () => process.env.VERTEX_ACCESS_TOKEN ?? token,
                  model: resolvedModel,
                  ...gen,
              })
            : undefined;

    const buildGemini = (): LlmGateway | undefined =>
        apiKey ? createGeminiLlmGateway({ environment, http, apiKey, model: resolvedModel, ...gen }) : undefined;

    // Explicit LLM_PROVIDER wins so two parallel runs can each pin a different provider (Developer API + Vertex
    // draw from SEPARATE quota pools); otherwise auto — Vertex if configured (draws the credit), else Developer.
    const forced = process.env.LLM_PROVIDER?.toLowerCase();
    if (forced === 'vertex') return buildVertex();
    if (forced === 'gemini' || forced === 'developer') return buildGemini();
    return buildVertex() ?? buildGemini();
};
