import { DEFAULT_MAX_TOKENS as ANTHROPIC_DEFAULT_MAX_TOKENS, createAnthropicToolLlmGateway } from './AnthropicToolLlmGateway';
import { createGeminiToolLlmGateway } from './GeminiToolLlmGateway';
import { createOpenAiLlmGateway } from './OpenAiLlmGateway';

import type { AgentEnvironmentSupportable } from '../environment';
import type { HttpRequestSupportable } from '../http';
import type { LlmGateway } from './llmGateway';

/**
 * Config-driven provider/model registry for real-provider verification — a registry-driven matrix
 * covering OpenAI, Gemini, OpenRouter, DeepSeek, Qwen, Anthropic/Claude, and GLM. OpenRouter,
 * DeepSeek, Qwen, and GLM need zero new gateway code (they reuse `createOpenAiLlmGateway` via
 * `baseUrl` — see each entry below for exactly what is and isn't verified). Claude is the one
 * entry needing a genuinely new gateway (`AnthropicToolLlmGateway` — see `ANTHROPIC_ENTRY`), since
 * Anthropic's Messages API isn't OpenAI-wire-compatible.
 *
 * `status`/`offlineVerified`/`realVerifiedModels` are three separate claims on purpose: a gateway
 * can exist (`status: 'implemented'`) with its offline scripted-HTTP suite passing
 * (`offlineVerified: true`) while still having zero — or only some — of its `models` actually run
 * against the live API (`realVerifiedModels`). Conflating these is exactly the overclaiming this
 * registry is meant to make structurally harder, not just document in prose.
 */

/** Which concrete gateway factory an entry dispatches to. */
export type GatewayType = 'openai-compatible' | 'gemini-native' | 'anthropic-native';

export type ProviderStatus = 'implemented' | 'planned' | 'blocked';

/**
 * `'explicit'` — the request path sends a concrete, known value (either the caller configured it,
 * or the gateway itself always sends a specific default of its own — see `maxOutputTokens` on
 * `anthropic-native`, where Anthropic requires the field on every call). `value` is always present.
 *
 * `'provider-default'` — the underlying provider's API genuinely accepts this parameter, but
 * nothing in this request path ever sends it, so the provider silently applies whatever default
 * behavior it has server-side. `value` is deliberately absent: this codebase's gateways never read
 * or hardcode the provider's own numeric/string default, so stating one here would be a guess, not
 * a fact the request path actually knows (see `deriveGenerationConfiguration`'s own doc for why
 * this distinction matters and how each gatewayType was classified).
 *
 * `'unsupported'` — the parameter cannot be sent meaningfully through this request path: either
 * the provider's actual API has no such concept at all (e.g. OpenAI Chat Completions has no
 * `top_k`), or this codebase's type-level shape for the parameter (e.g. a `reasoningEffort` string)
 * doesn't correspond to anything the provider's request format accepts (e.g. Anthropic's opt-in,
 * token-budget-based "extended thinking" is a categorically different mechanism). `value` is absent.
 */
export type GenerationParameterStatus = 'explicit' | 'provider-default' | 'unsupported';

export interface GenerationParameterValue<T> {
    status: GenerationParameterStatus;
    /** Present only when `status === 'explicit'`. */
    value?: T;
}

/**
 * The effective generation/sampling configuration a gatewayType's request path actually sends —
 * see {@link deriveGenerationConfiguration}. Deliberately independent of any specific model: every
 * model behind the same `gatewayType` shares the same request-shape capabilities (a model choice
 * doesn't change which fields THIS CODE knows how to send), even though a specific model's own
 * provider-side default behavior could differ from another model's.
 */
export interface GenerationConfiguration {
    temperature: GenerationParameterValue<number>;
    topP: GenerationParameterValue<number>;
    topK: GenerationParameterValue<number>;
    maxOutputTokens: GenerationParameterValue<number>;
    reasoningEffort: GenerationParameterValue<string>;
}

/**
 * Derives the effective generation configuration a `gatewayType`'s request path actually sends,
 * given the (optional) generation options a caller configured. Grounded ONLY in what each
 * gateway's own request-body builder does — never in an assumption about what a provider's API
 * "really" supports beyond what this codebase's code demonstrates awareness of:
 *
 * - `temperature`: every gatewayType has a real, if currently always-unpopulated (see
 *   `createGatewayForEntry`, which never passes `generation`), conditional field for it — so this
 *   is always `'provider-default'` today, becoming `'explicit'` the moment a caller configures it.
 * - `topP`: OpenAI, Anthropic, and Gemini's request formats all genuinely document a `top_p`
 *   parameter — but no gateway in this codebase has a field for it, so it is always
 *   `'provider-default'`, never `'unsupported'` (none of these providers lacks the concept).
 * - `topK`: Anthropic's and Gemini's request formats genuinely document `top_k` (unlike `top_p`,
 *   this is NOT universal) — `'provider-default'` for those two, but OpenAI's Chat Completions API
 *   has no such parameter at all, so it is `'unsupported'` for `openai-compatible`. Never claim
 *   OpenAI supports `top_k` merely because other providers do.
 * - `maxOutputTokens`: `openai-compatible`/`gemini-native` only send it when configured (optional
 *   field, provider decides otherwise) — `'provider-default'` when unset. `anthropic-native` is
 *   different: Anthropic's Messages API REQUIRES `max_tokens` on every call, so this gateway always
 *   sends a concrete number — the caller's value, or its own `DEFAULT_MAX_TOKENS` (1024) otherwise
 *   — making this `'explicit'` unconditionally, never `'provider-default'` (there is no provider
 *   default to fall back to; a real number is always on the wire, and this function always knows
 *   exactly what it is).
 * - `reasoningEffort`: OpenAI's reasoning-model family (o-series/gpt-5) documents a
 *   `reasoning_effort` string parameter this codebase never sends — `'provider-default'` (OpenAI
 *   applies its own default effort). Anthropic's and Gemini's "extended thinking"/`thinkingConfig`
 *   mechanisms are token-budget-based, not an effort-level string, and neither is ever sent by
 *   these gateways at all — `'unsupported'` for both, since there is no equivalent of this
 *   string-shaped parameter to fall back to a provider default on.
 */
export const deriveGenerationConfiguration = (
    gatewayType: GatewayType,
    generation?: { temperature?: number; maxOutputTokens?: number }
): GenerationConfiguration => {
    const temperature: GenerationParameterValue<number> =
        generation?.temperature !== undefined
            ? { status: 'explicit', value: generation.temperature }
            : { status: 'provider-default' };
    const optionalMaxOutputTokens: GenerationParameterValue<number> =
        generation?.maxOutputTokens !== undefined
            ? { status: 'explicit', value: generation.maxOutputTokens }
            : { status: 'provider-default' };

    switch (gatewayType) {
        case 'openai-compatible':
            return {
                temperature,
                topP: { status: 'provider-default' },
                topK: { status: 'unsupported' },
                maxOutputTokens: optionalMaxOutputTokens,
                reasoningEffort: { status: 'provider-default' },
            };
        case 'anthropic-native':
            return {
                temperature,
                topP: { status: 'provider-default' },
                topK: { status: 'provider-default' },
                maxOutputTokens: { status: 'explicit', value: generation?.maxOutputTokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS },
                reasoningEffort: { status: 'unsupported' },
            };
        case 'gemini-native':
            return {
                temperature,
                topP: { status: 'provider-default' },
                topK: { status: 'provider-default' },
                maxOutputTokens: optionalMaxOutputTokens,
                reasoningEffort: { status: 'unsupported' },
            };
        default: {
            const exhaustiveCheck: never = gatewayType;
            throw new Error(`deriveGenerationConfiguration: no derivation for gatewayType "${String(exhaustiveCheck)}"`);
        }
    }
};

export interface ProviderModelEntry {
    /** Stable id, e.g. 'openai' | 'gemini'. */
    providerId: string;
    displayName: string;
    gatewayType: GatewayType;
    /** Every model version this provider should be run against once verification proceeds. */
    models: string[];
    /** Must be a member of `models` — enforced by an offline test. */
    defaultModel: string;
    /** Node-only env var name carrying the real API key. Never a `VITE_`-prefixed var. */
    apiKeyEnv: string;
    /** Optional env var that narrows a real-key run to exactly one model (fast/cheap iteration). */
    modelEnvOverride?: string;
    /** Only for gateways reused via a baseUrl override (e.g. OPENROUTER_ENTRY). */
    baseUrl?: string;
    /**
     * Subset of `models` that are dynamic *routes* rather than fixed model identities (e.g.
     * `openrouter/free`, which may serve a different underlying model per call — see
     * `Chunk.actualModel`). A model-manifest/benchmark consumer (see `modelManifest.ts`) must
     * never count an entry in this list toward a "fixed model" qualification total, and must
     * always separate its results by `actualModel` rather than aggregating them under the route
     * id. Empty/absent means every model in `models` is a fixed identity.
     */
    dynamicRouteModels?: string[];
    /**
     * Per-scenario timeout for real-key runs only (never applies to offline tests). Overrides the
     * real-provider test harness's default when this provider/model is known to be slower — e.g.
     * a free-tier OpenRouter model. Omit to use the harness default (see
     * `realLocatorScenarios.spec.ts`'s `DEFAULT_REAL_TEST_TIMEOUT_MS`).
     */
    realTestTimeoutMs?: number;
    supportsToolCalls: boolean;
    /** Can this gateway map a tool-result message back into the provider's follow-up-turn format? */
    supportsMultiTurnToolResults: boolean;
    status: ProviderStatus;
    /** Does an offline (scripted-HTTP, no network) spec suite pass for this gateway? */
    offlineVerified: boolean;
    /** Subset of `models` actually confirmed passing against the live API. Empty until a real run happens. */
    realVerifiedModels: string[];
    notes?: string;
}

const OPENAI_ENTRY: ProviderModelEntry = {
    providerId: 'openai',
    displayName: 'OpenAI',
    gatewayType: 'openai-compatible',
    // Old/new spread: gpt-4o-mini (real-verified, kept as defaultModel so no existing behavior
    // changes) and gpt-4.1-mini are both the 4.x generation. gpt-5-mini added as the newest
    // candidate — confirmed present in eureka-flows-api's own live model catalog (GET
    // /runs/0/models), which also lists gpt-5/gpt-5.1/gpt-5.2 above it. Picked gpt-5-mini (not
    // gpt-5.2) to match this registry's pick-the-cheap-tier-first pattern. Real-key-verified
    // 2026-08-06 through this same provider-native path (live single-turn and multi-turn runs,
    // including a genuine list_nodes → move_node multi-turn round trip on
    // move-named-node-without-id) — see `realVerifiedModels` below.
    // gpt-4.1 added 2026-08-04 as a 4th capability/cost tier, for benchmark breadth — initially
    // sourced only via OpenRouter's public Models API as a corroboration signal, then independently
    // confirmed 2026-08-04 directly against OpenAI's own official docs
    // (developers.openai.com/api/docs/models/gpt-4.1): exact id `gpt-4.1`, current (default
    // snapshot gpt-4.1-2025-04-14), directly callable via Chat Completions/Assistants/Batch. This
    // is a direct-provider confirmation, not an OpenRouter-namespace inference.
    models: ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-5-mini', 'gpt-4.1'],
    defaultModel: 'gpt-4o-mini',
    apiKeyEnv: 'OPENAI_API_KEY',
    modelEnvOverride: 'OPENAI_TEST_MODEL',
    supportsToolCalls: true,
    // Message-mapping code handles role:'tool' and assistant tool_calls natively, offline-verified
    // (OpenAiLlmGateway.spec.ts). Real-key-verified 2026-08-06: gpt-4o-mini and gpt-5-mini both
    // completed a genuine multi-turn round trip (list_nodes → real tool result → move_node) via
    // realMultiTurnLocatorScenarios.spec.ts's move-named-node-without-id scenario.
    supportsMultiTurnToolResults: true,
    status: 'implemented',
    offlineVerified: true,
    realVerifiedModels: ['gpt-4o-mini', 'gpt-5-mini'],
    notes:
        'OpenAI-wire-compatible — OpenRouter (see OPENROUTER_ENTRY) already reuses this same ' +
        'gateway via a baseUrl override. DeepSeek/Qwen could too, but are not registered yet. ' +
        'Old/new coverage: gpt-4o-mini (real-verified, current default) and gpt-4.1-mini are ' +
        'both 4.x-generation; gpt-5-mini is the newest-candidate addition, confirmed to exist in ' +
        "eureka's own model catalog and real-key-verified 2026-08-06 (single-turn smoke plus a " +
        'genuine multi-turn list_nodes → move_node round trip) through this same provider-native ' +
        'path. gpt-4.1 (full, non-mini tier) added 2026-08-04 for capability-tier breadth per the ' +
        "model-manifest benchmark target — see `modelManifest.ts`; confirmed directly against OpenAI's " +
        "own docs (not just OpenRouter's mirrored catalog), but not yet real-key-verified.",
};

const GEMINI_ENTRY: ProviderModelEntry = {
    providerId: 'gemini',
    displayName: 'Gemini',
    gatewayType: 'gemini-native',
    // Old/new spread: gemini-2.5-flash (real-verified, kept as defaultModel) and gemini-2.5-pro
    // are both the 2.5 generation. gemini-3-flash-preview added as the newest candidate —
    // confirmed present in eureka-flows-api's own live model catalog (GET /runs/0/models), which
    // also lists gemini-3.1-pro-preview above it. Picked the flash (cheap) tier over the
    // pro-preview tier to match this registry's pick-the-cheap-tier-first pattern. It's a
    // "-preview" model id, so it may be renamed/retired upstream without notice — flagged, not
    // treated as stable. Not yet run against this provider-native path.
    // gemini-2.5-flash-lite and gemini-3.1-pro-preview added 2026-08-04 for benchmark breadth —
    // initially sourced only via OpenRouter's public Models API (under the `google/` namespace) as
    // a corroboration signal, then independently confirmed 2026-08-04 directly against Google's
    // own official docs (ai.google.dev/gemini-api/docs/models): gemini-2.5-flash-lite listed as
    // Stable; gemini-3.1-pro-preview listed as Preview. Both are direct-provider confirmations, not
    // OpenRouter-namespace inferences. gemini-2.5-flash-lite is the 2.5 generation's cheapest tier.
    // gemini-3.1-pro-preview is a newer, larger, explicitly "-preview"-suffixed candidate — same
    // upstream-rename/retire risk called out for gemini-3-flash-preview above; label as
    // preview-only in any benchmark report.
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3-flash-preview', 'gemini-2.5-flash-lite', 'gemini-3.1-pro-preview'],
    defaultModel: 'gemini-2.5-flash',
    apiKeyEnv: 'GEMINI_API_KEY',
    modelEnvOverride: 'GEMINI_TEST_MODEL',
    supportsToolCalls: true,
    // Maps tool-result/assistant-tool-call messages into functionResponse/functionCall parts,
    // correlated by function name (recovered from the earlier assistant tool-call message —
    // Gemini's wire format has no call-id concept at all). Offline-verified
    // (GeminiToolLlmGateway.spec.ts's multi-turn request-mapping/response-parsing tests).
    // No live run has exercised the multi-turn round trip yet.
    supportsMultiTurnToolResults: true,
    status: 'implemented',
    offlineVerified: true,
    realVerifiedModels: ['gemini-2.5-flash'],
    notes:
        'Real-key runs have also observed a lookup-first target-resolution tool-choice variance ' +
        'and a one-off "no candidates" provider error (see provider-tool-calling.md §9); neither ' +
        'affects this registry entry. realVerifiedModels above is about the single-turn scenario ' +
        'matrix; multi-turn real-key status is tracked separately (supportsMultiTurnToolResults ' +
        'note above), not implied by this field. ' +
        'Old/new coverage: gemini-2.5-flash (real-verified, current default) and gemini-2.5-pro ' +
        'are both 2.5-generation; gemini-3-flash-preview is the newest-candidate addition — a ' +
        "preview model id from eureka's own catalog, pending a real-key run and possibly subject " +
        'to upstream rename/retirement given the -preview suffix. gemini-2.5-flash-lite ' +
        '(stable, cheapest 2.5-gen tier) and gemini-3.1-pro-preview (newer, preview-suffixed) ' +
        'added 2026-08-04 for benchmark breadth per `modelManifest.ts`; both confirmed directly ' +
        'against ai.google.dev/gemini-api/docs/models (not just OpenRouter\'s mirrored catalog), ' +
        'not yet real-key-verified through this native path.',
};

const OPENROUTER_ENTRY: ProviderModelEntry = {
    providerId: 'openrouter',
    displayName: 'OpenRouter',
    gatewayType: 'openai-compatible',
    // openrouter/free (real-verified — see realVerifiedModels below) is OpenRouter's free
    // router, which may route to different underlying models over time; this confirms *the
    // free route's* current behavior, not a specific model's identity or a permanent guarantee.
    // openai/gpt-4o-mini stays registered as an untested candidate — OpenRouter's own model-id
    // convention (`<upstream-provider>/<model>`), not yet run against the live API.
    //
    // Five more fixed ids added 2026-08-04 for benchmark breadth (target: >= 6 fixed OpenRouter
    // models, excluding the openrouter/free route below) — all confirmed present via OpenRouter's
    // public Models API (GET https://openrouter.ai/api/v1/models, no auth required) with
    // tool-calling support (`supported_parameters` includes `tools`) at that check:
    //   - google/gemini-2.5-flash, anthropic/claude-haiku-4.5: same underlying models as
    //     GEMINI_ENTRY/ANTHROPIC_ENTRY, reachable here via OpenRouter's routing instead, for
    //     cross-path comparison.
    //   - openai/gpt-oss-20b:free — a genuinely FIXED model id (OpenRouter's own free-tier
    //     pricing for this specific open-weight model), NOT the same thing as the openrouter/free
    //     dynamic route below; kept distinct on purpose (see dynamicRouteModels below) and
    //     deliberately exercises the `:free`-suffix case in the chart's point-id/companion-table
    //     mapping (`verificationMetrics.ts`'s `buildElapsedVsTokensChart`).
    //   - meta-llama/llama-3.3-70b-instruct, deepseek/deepseek-chat-v3.1 — added for
    //     upstream-provider diversity within the OpenRouter benchmark pool.
    // None of the five are yet real-key-verified through this path.
    models: [
        'openrouter/free',
        'openai/gpt-4o-mini',
        'google/gemini-2.5-flash',
        'anthropic/claude-haiku-4.5',
        'openai/gpt-oss-20b:free',
        'meta-llama/llama-3.3-70b-instruct',
        'deepseek/deepseek-chat-v3.1',
    ],
    // openrouter/free is a dynamic route (may serve a different underlying model per call, see
    // Chunk.actualModel) — never a fixed model identity. Flagged here so a benchmark/manifest
    // consumer (modelManifest.ts) excludes it from any "N fixed models" count and always separates
    // its results by actualModel instead of aggregating under the route id itself.
    dynamicRouteModels: ['openrouter/free'],
    defaultModel: 'openrouter/free',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    modelEnvOverride: 'OPENROUTER_TEST_MODEL',
    baseUrl: 'https://openrouter.ai/api/v1',
    // Confirmed via a real-key run (5 strict pass + 3 known-variance = 8/8 accepted) — not just
    // documentation-based inference, for openrouter/free specifically.
    supportsToolCalls: true,
    // Same OpenAI message-mapping code path (role:'tool', assistant tool_calls) as OPENAI_ENTRY —
    // no OpenRouter-specific mapping exists or is needed. The scenario matrix is single-turn only,
    // so this still has not been exercised live for OpenRouter at all.
    supportsMultiTurnToolResults: true,
    // status: 'implemented' requires zero new gateway code (full reuse of createOpenAiLlmGateway),
    // tested offline dispatcher wiring, AND a real OPENROUTER_API_KEY run that came back 8/8
    // accepted for openrouter/free. This verifies the free route specifically, not every
    // OpenRouter model or upstream provider it might route to.
    status: 'implemented',
    offlineVerified: true,
    realVerifiedModels: ['openrouter/free'],
    notes:
        'Reuses createOpenAiLlmGateway via baseUrl — zero new gateway code. Real-key run ' +
        '(OPENROUTER_TEST_MODEL=openrouter/free): 8/8 accepted (5 strict pass, 3 known-variance, 0 ' +
        "fail, 0 timeout). openrouter/free is OpenRouter's free router and may route to different " +
        "underlying models over time, so this verifies that route's current behavior, not a fixed " +
        'model identity or every OpenRouter model — see dynamicRouteModels above. The other six ' +
        'entries (openai/gpt-4o-mini plus the five added 2026-08-04: google/gemini-2.5-flash, ' +
        'anthropic/claude-haiku-4.5, openai/gpt-oss-20b:free, meta-llama/llama-3.3-70b-instruct, ' +
        'deepseek/deepseek-chat-v3.1) are all fixed model identities and untested candidates.',
};

const DEEPSEEK_ENTRY: ProviderModelEntry = {
    providerId: 'deepseek',
    displayName: 'DeepSeek',
    gatewayType: 'openai-compatible',
    // deepseek-chat/deepseek-reasoner are retiring 2026/07/24 15:59 UTC (DeepSeek's own migration
    // notice, confirmed against api-docs.deepseek.com the same day this entry was added) — using
    // deepseek-v4-flash instead, the documented direct successor (deepseek-chat's non-thinking
    // mode). Not yet run against a live key; this is an unverified-but-current model id choice,
    // not a verified one. deepseek-v4-pro added as the newest/larger sibling tier documented
    // alongside deepseek-v4-flash in the same migration notice (v4-flash's non-thinking
    // counterpart being the smaller of the two) — old/new coverage here is "current vs. newest
    // documented tier," not old vs. new generations, since the prior deepseek-chat/-reasoner
    // generation is being retired outright rather than staying available for comparison.
    models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
    defaultModel: 'deepseek-v4-flash',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    modelEnvOverride: 'DEEPSEEK_TEST_MODEL',
    // Confirmed against api-docs.deepseek.com: base https://api.deepseek.com, canonical endpoint
    // is {baseUrl}/chat/completions with no /v1 segment (unlike OpenAI's own baseUrl convention).
    baseUrl: 'https://api.deepseek.com',
    // DeepSeek documents its API as OpenAI/Anthropic-compatible, including tool calls as a listed
    // API capability — NOT yet independently verified by this repo, offline or live. Marketed
    // compatibility is not the same claim as `offlineVerified`/`realVerifiedModels` below.
    supportsToolCalls: true,
    // Same OpenAI message-mapping code path as OPENAI_ENTRY/OPENROUTER_ENTRY (role:'tool',
    // assistant tool_calls) — unverified live, same caveat as those two entries.
    supportsMultiTurnToolResults: true,
    status: 'planned',
    // The offline, scripted-HTTP, no-network dispatcher test in providerRegistry.spec.ts passes
    // (proves this entry routes through createOpenAiLlmGateway to the DeepSeek baseUrl) — that's
    // exactly what this field means, same as OPENROUTER_ENTRY's pre-real-key-run state. It does
    // NOT mean real-provider verified; see realVerifiedModels below for that separate claim.
    offlineVerified: true,
    realVerifiedModels: [],
    notes:
        'Reuses createOpenAiLlmGateway via baseUrl — zero new gateway code, mirroring ' +
        'OPENROUTER_ENTRY. Marketed as OpenAI-compatible (including tool calls); offline ' +
        'dispatcher-wiring is tested and passing, but NOT yet real-key-verified by this repo ' +
        '(balance check returned $0 available — no funded key to run against). ' +
        'deepseek-chat/deepseek-reasoner are being retired 2026/07/24 15:59 UTC in favor of ' +
        'deepseek-v4-flash/deepseek-v4-pro — deepseek-v4-flash is used here as the current model ' +
        'id (and defaultModel), not the deprecated deepseek-chat name; deepseek-v4-pro is now also ' +
        'registered as the newest/larger documented sibling, equally unverified pending a funded key.',
};

const QWEN_ENTRY: ProviderModelEntry = {
    providerId: 'qwen',
    displayName: 'Qwen',
    gatewayType: 'openai-compatible',
    // qwen-plus confirmed directly in Alibaba Cloud Model Studio's own OpenAI-SDK code sample
    // (model="qwen-plus"); their docs list qwen-turbo/qwen-plus/qwen-max as supporting the `tools`
    // parameter. No equivalent of DeepSeek's chat/reasoner retirement here as of this check.
    // qwen-turbo (older/cheaper tier) and qwen-max (newest/largest tier) both added from that same
    // documented three-tier lineup, giving old/current/new coverage instead of a single model —
    // neither has been independently confirmed beyond appearing in that docs page's tools list.
    models: ['qwen-turbo', 'qwen-plus', 'qwen-max'],
    defaultModel: 'qwen-plus',
    // The credential is a DashScope key (Alibaba Cloud Model Studio), not something separately
    // branded "Qwen" — official code samples read it as DASHSCOPE_API_KEY. QWEN_API_KEY is this
    // repo's own <PROVIDER>_API_KEY naming convention (matches OPENAI_/GEMINI_/DEEPSEEK_ style),
    // not Alibaba's — worth knowing when actually obtaining the key.
    apiKeyEnv: 'QWEN_API_KEY',
    modelEnvOverride: 'QWEN_TEST_MODEL',
    // Two fixed, still-documented-as-fully-functional regional endpoints exist: international
    // (used here, https://dashscope-intl.aliyuncs.com/compatible-mode/v1) and mainland/Beijing
    // (https://dashscope.aliyuncs.com/compatible-mode/v1). Alibaba also now offers newer
    // per-workspace-ID subdomains for better performance, but those can't be expressed as a single
    // static baseUrl the way this registry is designed, so the fixed international endpoint is
    // used instead. Picking the wrong region for a given key causes an auth/reachability failure,
    // not a silently-wrong response — confirmed as a real-world footgun (a public GitHub issue
    // reports exactly this: a hardcoded intl endpoint breaking standard mainland DashScope keys).
    // Whoever supplies QWEN_API_KEY needs to confirm which region it was issued for.
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    // Alibaba documents qwen-plus as supporting the `tools` parameter via this OpenAI-compatible
    // endpoint, with a full worked function-calling example — NOT yet independently verified by
    // this repo, offline or live.
    supportsToolCalls: true,
    // Same OpenAI message-mapping code path as OPENAI_ENTRY/OPENROUTER_ENTRY/DEEPSEEK_ENTRY
    // (role:'tool', assistant tool_calls) — unverified live, same caveat as those three entries.
    supportsMultiTurnToolResults: true,
    status: 'planned',
    // The offline, scripted-HTTP, no-network dispatcher test in providerRegistry.spec.ts passes
    // (proves this entry routes through createOpenAiLlmGateway to the Qwen/DashScope baseUrl) —
    // that's exactly what this field means, same as DEEPSEEK_ENTRY/OPENROUTER_ENTRY's
    // pre-real-key-run state. It does NOT mean real-provider verified.
    offlineVerified: true,
    realVerifiedModels: [],
    notes:
        'Reuses createOpenAiLlmGateway via baseUrl — zero new gateway code, mirroring ' +
        'OPENROUTER_ENTRY/DEEPSEEK_ENTRY. Marketed as OpenAI-compatible (including tool calls); ' +
        'offline dispatcher-wiring is tested and passing, but NOT yet real-key-verified by this ' +
        'repo — no QWEN_API_KEY/credits available at the time this entry was added. baseUrl is ' +
        'the international DashScope region; the mainland/Beijing endpoint ' +
        '(https://dashscope.aliyuncs.com/compatible-mode/v1) is the alternative if the actual key ' +
        'was issued for that region instead — using the wrong region fails auth, it does not ' +
        'silently misbehave. Old/new coverage: qwen-turbo (older/cheaper tier), qwen-plus (current ' +
        'default, unchanged), and qwen-max (newest/largest tier) — all three equally unverified ' +
        'pending a funded key, this only adds breadth to the untested candidate list.',
};

const ANTHROPIC_ENTRY: ProviderModelEntry = {
    providerId: 'anthropic',
    displayName: 'Claude',
    gatewayType: 'anthropic-native',
    // claude-haiku-4-5 confirmed current (not deprecated/retired) in Anthropic's own tool-use
    // pricing table — the fastest/cheapest tier, matching this repo's pick-the-cheap-tier-first
    // pattern (gpt-4o-mini, gemini-2.5-flash, deepseek-v4-flash). Not yet run against a live key.
    // claude-sonnet-5 added 2026-08-04 as the old/new-tier counterpart (bigger/costlier,
    // "best combination of speed and intelligence" per Anthropic's own docs), giving this entry
    // the same cheap-tier + bigger-tier spread every other multi-model provider in this registry
    // has — confirmed directly against platform.claude.com/docs/en/about-claude/models/overview
    // (Claude API ID and alias both "claude-sonnet-5", generally available). Also not yet run
    // against a live key.
    models: ['claude-haiku-4-5', 'claude-sonnet-5'],
    defaultModel: 'claude-haiku-4-5',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    modelEnvOverride: 'ANTHROPIC_TEST_MODEL',
    baseUrl: 'https://api.anthropic.com',
    // Anthropic documents tool use (the `tools`/`input_schema` request shape, `tool_use` response
    // blocks) for this model — NOT yet independently verified by this repo, offline or live.
    supportsToolCalls: true,
    // Multi-turn tool-result mapping is implemented and offline-verified (not just "structurally
    // buildable"): AnthropicToolLlmGateway maps an assistant tool-call message into an assistant
    // content-block array (leading text block, if any, then one tool_use block per call) and a
    // tool-result message into a *user* message carrying a tool_result block, correlated by
    // tool_use_id — the same identifier as our own ChatMessage.toolCallId. This is offline-proven
    // only (AnthropicToolLlmGateway.spec.ts's multi-turn request-mapping/response-parsing tests);
    // no real Anthropic API call has ever been made, so this is NOT the same claim as OpenAI's
    // real-key-verified multi-turn result.
    supportsMultiTurnToolResults: true,
    status: 'planned',
    // The offline, scripted-HTTP, no-network suite in AnthropicToolLlmGateway.spec.ts passes (31
    // tests: single-turn request/response mapping, input_schema passthrough, text/tool_use
    // parsing, multi-block responses, key redaction, tracing — plus multi-turn request-mapping and
    // response parsing on the turn after a tool_result) — that's what this field means. It does
    // NOT mean real-provider verified; see realVerifiedModels below.
    offlineVerified: true,
    realVerifiedModels: [],
    notes:
        'Native gateway (AnthropicToolLlmGateway) — NOT a createOpenAiLlmGateway baseUrl reuse; ' +
        "Anthropic's Messages API differs in auth header (x-api-key), a required anthropic-version " +
        'header, input_schema instead of parameters, a required max_tokens, a top-level system ' +
        'field instead of a system-role message, and a content-block-array response shape. Both ' +
        'single-turn tool calling and multi-turn tool-result mapping are implemented and ' +
        'offline-verified; NOT yet real-key-verified by this repo — no ANTHROPIC_API_KEY used. Do ' +
        'not mark real-verified until an actual key run confirms this live. RESOLVED 2026-08-04: ' +
        "the bare \"claude-haiku-4-5\" used here is confirmed, via Anthropic's own official docs " +
        '(platform.claude.com/docs/en/about-claude/models/overview), to be the documented "Claude ' +
        'API alias" for this model — a convenience pointer that resolves to the pinned snapshot ' +
        '`claude-haiku-4-5-20251001`. Both ids are valid; this entry keeping the bare alias is a ' +
        'deliberate choice (matches this file\'s not-pinning-dated-snapshots convention elsewhere), ' +
        'not an unconfirmed guess. The prior lower-confidence, search-sourced doubt about this id is ' +
        'superseded by this primary-source confirmation. claude-sonnet-5 added 2026-08-04 as the ' +
        'old/new-tier spread this entry previously lacked; equally unverified pending a real key.',
};

const GLM_ENTRY: ProviderModelEntry = {
    providerId: 'glm',
    displayName: 'GLM (Z.ai)',
    gatewayType: 'openai-compatible',
    // glm-4.5-flash confirmed in Z.ai's own API reference model enum with `tools` support — the
    // cheapest/fastest tier, matching this repo's pick-the-cheap-tier-first pattern (gpt-4o-mini,
    // gemini-2.5-flash, deepseek-v4-flash). Not yet run against a live key.
    // glm-4.6 added as a newer-generation candidate — LOWER CONFIDENCE than the rest of this
    // entry: sourced from a general web search, not confirmed against Z.ai's own API reference the
    // way glm-4.5-flash was. Treat as "pending official model ID confirmation," not documented.
    models: ['glm-4.5-flash', 'glm-4.6'],
    defaultModel: 'glm-4.5-flash',
    // Repo-internal naming (matches <PROVIDER>_API_KEY convention) — not necessarily Z.ai's own
    // documented env var name, same situation as QWEN_API_KEY not matching DashScope's own naming.
    apiKeyEnv: 'GLM_API_KEY',
    modelEnvOverride: 'GLM_TEST_MODEL',
    // International endpoint (used here). Mainland/legacy alternative is
    // https://open.bigmodel.cn/api/paas/v4 — same dual-region pattern as QWEN_ENTRY; picking the
    // wrong one for a given key likely fails auth/reachability rather than silently misbehaving,
    // though that specific failure mode is confirmed for Qwen (a public GitHub issue), not
    // independently confirmed for Z.ai.
    baseUrl: 'https://api.z.ai/api/paas/v4',
    // Z.ai's own API reference documents the `tools` request field and a `tool_calls` response
    // array with `id`/`type`/`function.{name, arguments}` — described as matching OpenAI's shape.
    // NOT yet independently verified by this repo, offline or live.
    supportsToolCalls: true,
    // Same OpenAI message-mapping code path as OPENAI_ENTRY/OPENROUTER_ENTRY/DEEPSEEK_ENTRY/
    // QWEN_ENTRY — unverified live, same caveat as those four entries.
    supportsMultiTurnToolResults: true,
    status: 'planned',
    // True only once an offline dispatcher-routing test exists and passes (see
    // providerRegistry.spec.ts) — proves this entry routes through createOpenAiLlmGateway to the
    // Z.ai baseUrl. Does NOT mean real-provider verified; see realVerifiedModels below.
    offlineVerified: true,
    realVerifiedModels: [],
    notes:
        'Reuses createOpenAiLlmGateway via baseUrl — zero new gateway code, mirroring ' +
        'OPENROUTER_ENTRY/DEEPSEEK_ENTRY/QWEN_ENTRY. Z.ai documents its chat-completions API as ' +
        'OpenAI-compatible (including a tools/tool_calls shape); offline dispatcher-wiring is ' +
        'tested and passing, but NOT yet real-key-verified by this repo — no GLM_API_KEY used. ' +
        'One specific unresolved risk, not yet confirmed either way: a docs summary described the ' +
        'response tool_calls[].function.arguments field as "JSON object format", which would be a ' +
        "real incompatibility if true (OpenAI's own arguments field, and what createOpenAiLlmGateway " +
        'assumes, is a JSON-encoded STRING, not a parsed object). This needs confirmation from an ' +
        'actual captured Z.ai response before being trusted either way — do not assume ' +
        'OpenAI-parity here beyond what a real response has shown. Old/new coverage: glm-4.5-flash ' +
        '(current default, API-reference-confirmed) plus glm-4.6 as a newer-generation candidate — ' +
        "the latter is web-search-sourced only (not confirmed against Z.ai's own API reference the " +
        'way glm-4.5-flash was), so treat it as pending official model ID confirmation, not as ' +
        'documented fact, until it is independently verified.',
};

/**
 * Implemented + real-verified: OpenAI, Gemini, and OpenRouter (`openrouter/free` specifically —
 * see OPENROUTER_ENTRY above for exactly what's verified vs. still an untested candidate).
 * DeepSeek, Qwen, Claude, and GLM are registered but `status: 'planned'` — offline wiring only, no
 * real-key run for any of the four yet (see DEEPSEEK_ENTRY, QWEN_ENTRY, ANTHROPIC_ENTRY,
 * GLM_ENTRY).
 */
export const PROVIDER_REGISTRY: readonly ProviderModelEntry[] = [
    OPENAI_ENTRY,
    GEMINI_ENTRY,
    OPENROUTER_ENTRY,
    DEEPSEEK_ENTRY,
    QWEN_ENTRY,
    ANTHROPIC_ENTRY,
    GLM_ENTRY,
];

export interface CreateGatewayForEntryOptions {
    apiKey: string;
    model: string;
    environment: AgentEnvironmentSupportable;
    http: HttpRequestSupportable;
}

/** Build the concrete gateway for a registry entry, dispatching on `gatewayType`. */
export const createGatewayForEntry = (entry: ProviderModelEntry, options: CreateGatewayForEntryOptions): LlmGateway => {
    const { apiKey, model, environment, http } = options;

    switch (entry.gatewayType) {
        case 'openai-compatible':
            return createOpenAiLlmGateway({
                environment,
                http,
                apiKey,
                model,
                ...(entry.baseUrl ? { baseUrl: entry.baseUrl } : {}),
            });
        case 'gemini-native':
            return createGeminiToolLlmGateway({
                environment,
                http,
                apiKey,
                model,
                ...(entry.baseUrl ? { baseUrl: entry.baseUrl } : {}),
            });
        case 'anthropic-native':
            return createAnthropicToolLlmGateway({
                environment,
                http,
                apiKey,
                model,
                ...(entry.baseUrl ? { baseUrl: entry.baseUrl } : {}),
            });
        default: {
            const exhaustiveCheck: never = entry.gatewayType;
            throw new Error(`providerRegistry: no gateway dispatcher for gatewayType "${String(exhaustiveCheck)}"`);
        }
    }
};

/**
 * Which models to actually run for a real-key pass: the entry's env override, if set, narrows to
 * exactly one model (fast/cheap iteration); otherwise every model in `models`. Pure — takes the
 * already-read env value rather than reading `process.env` itself, so it's trivially testable
 * offline without needing to fake environment variables.
 */
export const resolveModelsToRun = (entry: ProviderModelEntry, envOverrideValue: string | undefined): string[] =>
    envOverrideValue ? [envOverrideValue] : entry.models;
