import { createAnthropicToolLlmGateway } from './AnthropicToolLlmGateway';
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
    // gpt-5.2) to match this registry's pick-the-cheap-tier-first pattern. Not yet run against
    // this provider-native path — offline-wired only until a real run happens.
    models: ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-5-mini'],
    defaultModel: 'gpt-4o-mini',
    apiKeyEnv: 'OPENAI_API_KEY',
    modelEnvOverride: 'OPENAI_TEST_MODEL',
    supportsToolCalls: true,
    // Message-mapping code handles role:'tool' and assistant tool_calls natively, offline-verified
    // (OpenAiLlmGateway.spec.ts). No live run has exercised the multi-turn round trip yet.
    supportsMultiTurnToolResults: true,
    status: 'implemented',
    offlineVerified: true,
    realVerifiedModels: ['gpt-4o-mini'],
    notes:
        'OpenAI-wire-compatible — OpenRouter (see OPENROUTER_ENTRY) already reuses this same ' +
        'gateway via a baseUrl override. DeepSeek/Qwen could too, but are not registered yet. ' +
        'Old/new coverage: gpt-4o-mini (real-verified, current default) and gpt-4.1-mini are ' +
        'both 4.x-generation; gpt-5-mini is the newest-candidate addition, confirmed to exist in ' +
        "eureka's own model catalog but not yet run through this provider-native path — pending " +
        'a real-key run (see provider-tool-calling.md §5).',
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
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3-flash-preview'],
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
        'to upstream rename/retirement given the -preview suffix.',
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
    models: ['openrouter/free', 'openai/gpt-4o-mini'],
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
        'model identity or every OpenRouter model. openai/gpt-4o-mini remains an untested candidate.',
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
    models: ['claude-haiku-4-5'],
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
        'not mark real-verified until an actual key run confirms this live. UNRESOLVED: a general ' +
        'web search suggests the full/current Haiku 4.5 model id may require a date suffix (e.g. ' +
        'claude-haiku-4-5-20251001) rather than the bare "claude-haiku-4-5" used here — lower ' +
        "confidence than this file's other model ids, which come from a provider's own " +
        'docs/pricing page, not a search summary. NOT changed here because existing offline tests ' +
        'assert against the current literal value and no primary-source (Anthropic docs) ' +
        'confirmation has been done — pending official model ID confirmation before either ' +
        'changing defaultModel or adding a second dated entry to models[].',
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
