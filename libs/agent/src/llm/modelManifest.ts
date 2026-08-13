import { PROVIDER_REGISTRY } from './providerRegistry';

import type { ProviderModelEntry } from './providerRegistry';

/**
 * A reproducible model-manifest system: one row per (provider, model) candidate, derived from
 * `providerRegistry.ts` plus curated discovery metadata (source + timestamp) added alongside each
 * registry entry. This is additive over `ProviderModelEntry` — it does not replace or duplicate
 * the registry, only projects it into the richer per-model shape a benchmark/qualification report
 * needs (its status vocabulary implements a qualification policy).
 *
 * Every model id here traces to a real discovery source (a provider's own docs/pricing page, or
 * OpenRouter's public Models API — `GET https://openrouter.ai/api/v1/models`, no auth required,
 * confirmed reachable and returning 338 models / 272 tool-capable at the time this module was
 * written) — never an invented id. See the per-model comments in `providerRegistry.ts` for the
 * specific source of each.
 */

/** Full status vocabulary a model can occupy across its qualification lifecycle. Distinct from
 * `ProviderStatus` on `ProviderModelEntry` (which is a coarser, gateway-implementation-level
 * claim) — this tracks progress on the *specific model*, not the gateway that serves it. */
export type ModelManifestStatus =
    | 'discovered'
    | 'configured'
    | 'offline-verified'
    | 'live-attempted'
    | 'live-verified'
    | 'browser-e2e-verified'
    | 'production-qualified'
    | 'failed'
    | 'unavailable'
    | 'preview-only'
    | 'dynamic-route';

export type ModelKind = 'fixed' | 'dynamic-route';

export interface ModelManifestEntry {
    provider: string;
    displayName: string;
    requestedModel: string;
    /** False for any model with a known "-preview"/experimental marker in its id. */
    stable: boolean;
    kind: ModelKind;
    expectedToolSupport: boolean;
    /** Where this model id was sourced from — a provider docs page, a pricing table, or the
     * OpenRouter public Models API — never "assumed". */
    discoverySource: string;
    /** ISO date the id was confirmed against `discoverySource`. */
    discoveryTimestamp: string;
    benchmarkEnabled: boolean;
    productionCandidate: boolean;
    status: ModelManifestStatus;
    skipReason?: string;
}

interface DiscoveryMeta {
    discoverySource: string;
    discoveryTimestamp: string;
    preview?: boolean;
    /** False only for a model this repo has deliberately decided not to benchmark yet. */
    benchmarkEnabled?: boolean;
    /** False for anything not intended as a real production candidate (e.g. kept only for
     * comparison/diversity). Defaults to true. */
    productionCandidate?: boolean;
}

const PROVIDER_DOCS_SOURCE = "provider's own docs/pricing page";
const OPENROUTER_MODELS_API_SOURCE = 'OpenRouter public Models API (GET https://openrouter.ai/api/v1/models, no auth)';
/**
 * Direct-gateway (OpenAI/Gemini) model ids must be confirmed against that provider's OWN official
 * source, never inferred from OpenRouter's mirrored catalog alone (an `openai/...` or
 * `google/...` OpenRouter id is not automatically a valid direct-API id) — a correction applied
 * 2026-08-04 after an initial version of this file cited only the OpenRouter Models API for
 * gpt-4.1/gemini-2.5-flash-lite/gemini-3.1-pro-preview. Each is now independently confirmed:
 * gpt-4.1 and gpt-4.1-mini against developers.openai.com/api/docs/models/{id} (exact id, current
 * status, and explicit `function_calling` support each verified directly); gemini-2.5-flash-lite
 * and gemini-3.1-pro-preview against ai.google.dev/gemini-api/docs/models (exact id and
 * stable/preview status verified directly). OpenRouter's own Models API is still the correct,
 * sufficient discovery source for every `openrouter:*` entry below — those ARE called through
 * OpenRouter, so an OpenRouter-sourced id is a direct confirmation for that gateway, not an
 * inference.
 */
const DIRECT_OPENAI_DOCS_SOURCE =
    'developers.openai.com/api/docs/models/{id} — exact id, status, and function_calling support confirmed directly, 2026-08-04';
const DIRECT_GEMINI_DOCS_SOURCE =
    'ai.google.dev/gemini-api/docs/models — exact id and stable/preview status confirmed directly, 2026-08-04';
/** A live call to the provider's own model-list endpoint using this repo's real API key — stronger
 * than a docs page (docs can lag a launch) and stronger than OpenRouter's mirror (a third party).
 * Used for the four OpenAI and three Gemini models added 2026-08-07. */
const DIRECT_OPENAI_LIVE_API_SOURCE = "a live call to OpenAI's own GET /v1/models endpoint, 2026-08-07";
const DIRECT_GEMINI_LIVE_API_SOURCE = "a live call to Google's own GET /v1beta/models endpoint, 2026-08-07";

/** Keyed by `${providerId}:${requestedModel}`. Every model in `PROVIDER_REGISTRY` must have an
 * entry here — enforced by `modelManifest.spec.ts` — so a newly registered model can never be
 * silently missing discovery metadata. */
const DISCOVERY: Record<string, DiscoveryMeta> = {
    'openai:gpt-4o-mini': { discoverySource: PROVIDER_DOCS_SOURCE, discoveryTimestamp: '2026-01-01' },
    'openai:gpt-4.1-mini': { discoverySource: PROVIDER_DOCS_SOURCE, discoveryTimestamp: '2026-01-01' },
    'openai:gpt-5-mini': {
        discoverySource: "eureka-flows-api's own live model catalog (GET /runs/0/models)",
        discoveryTimestamp: '2026-01-01',
    },
    'openai:gpt-4.1': { discoverySource: DIRECT_OPENAI_DOCS_SOURCE, discoveryTimestamp: '2026-08-04' },
    'openai:gpt-5.5': { discoverySource: DIRECT_OPENAI_LIVE_API_SOURCE, discoveryTimestamp: '2026-08-07' },
    // sol/terra/luna are parallel candidates, not a tier ladder — none is marked `preview: true`
    // since OpenAI's own /v1/models listing gives no preview/experimental marker for any of them.
    'openai:gpt-5.6-sol': { discoverySource: DIRECT_OPENAI_LIVE_API_SOURCE, discoveryTimestamp: '2026-08-07' },
    'openai:gpt-5.6-terra': { discoverySource: DIRECT_OPENAI_LIVE_API_SOURCE, discoveryTimestamp: '2026-08-07' },
    'openai:gpt-5.6-luna': { discoverySource: DIRECT_OPENAI_LIVE_API_SOURCE, discoveryTimestamp: '2026-08-07' },

    'gemini:gemini-2.5-flash': { discoverySource: PROVIDER_DOCS_SOURCE, discoveryTimestamp: '2026-01-01' },
    'gemini:gemini-2.5-pro': { discoverySource: PROVIDER_DOCS_SOURCE, discoveryTimestamp: '2026-01-01' },
    'gemini:gemini-3-flash-preview': {
        discoverySource: "eureka-flows-api's own live model catalog (GET /runs/0/models)",
        discoveryTimestamp: '2026-01-01',
        preview: true,
    },
    'gemini:gemini-2.5-flash-lite': { discoverySource: DIRECT_GEMINI_DOCS_SOURCE, discoveryTimestamp: '2026-08-04' },
    'gemini:gemini-3.1-pro-preview': {
        discoverySource: DIRECT_GEMINI_DOCS_SOURCE,
        discoveryTimestamp: '2026-08-04',
        preview: true,
    },
    'gemini:gemini-3.5-flash': { discoverySource: DIRECT_GEMINI_LIVE_API_SOURCE, discoveryTimestamp: '2026-08-07' },
    'gemini:gemini-3.5-flash-lite': {
        discoverySource: DIRECT_GEMINI_LIVE_API_SOURCE,
        discoveryTimestamp: '2026-08-07',
    },
    'gemini:gemini-3.6-flash': { discoverySource: DIRECT_GEMINI_LIVE_API_SOURCE, discoveryTimestamp: '2026-08-07' },

    'openrouter:openrouter/free': {
        discoverySource: "OpenRouter's own free-router documentation",
        discoveryTimestamp: '2026-01-01',
    },
    'openrouter:openai/gpt-4o-mini': {
        discoverySource: OPENROUTER_MODELS_API_SOURCE,
        discoveryTimestamp: '2026-01-01',
    },
    'openrouter:google/gemini-2.5-flash': {
        discoverySource: OPENROUTER_MODELS_API_SOURCE,
        discoveryTimestamp: '2026-08-04',
    },
    'openrouter:anthropic/claude-haiku-4.5': {
        discoverySource: OPENROUTER_MODELS_API_SOURCE,
        discoveryTimestamp: '2026-08-04',
    },
    'openrouter:openai/gpt-oss-20b:free': {
        discoverySource: OPENROUTER_MODELS_API_SOURCE,
        discoveryTimestamp: '2026-08-04',
    },
    'openrouter:meta-llama/llama-3.3-70b-instruct': {
        discoverySource: OPENROUTER_MODELS_API_SOURCE,
        discoveryTimestamp: '2026-08-04',
    },
    'openrouter:deepseek/deepseek-chat-v3.1': {
        discoverySource: OPENROUTER_MODELS_API_SOURCE,
        discoveryTimestamp: '2026-08-04',
    },
    // Anthropic models reachable only via OpenRouter (no ANTHROPIC_API_KEY available) — see
    // providerRegistry.ts's OPENROUTER_ENTRY note: a pass here verifies OpenRouter's routing to
    // Claude, not a direct-provider Anthropic call.
    'openrouter:anthropic/claude-sonnet-5': {
        discoverySource: OPENROUTER_MODELS_API_SOURCE,
        discoveryTimestamp: '2026-08-07',
    },
    'openrouter:anthropic/claude-opus-5': {
        discoverySource: OPENROUTER_MODELS_API_SOURCE,
        discoveryTimestamp: '2026-08-07',
    },
    'openrouter:google/gemini-3.6-flash': {
        discoverySource: OPENROUTER_MODELS_API_SOURCE,
        discoveryTimestamp: '2026-08-07',
    },
    // Presence confirmed by the user directly, NOT by this codebase independently re-querying
    // OpenRouter's public Models API the way every other `openrouter:*` entry above was — a
    // deliberately weaker provenance than OPENROUTER_MODELS_API_SOURCE, named explicitly so it's
    // never mistaken for an independently-verified discovery. Upgrade this source string once an
    // offline-safe (or live, with approval) check against the public Models API confirms it directly.
    'openrouter:anthropic/claude-fable-5': {
        discoverySource:
            "user-reported: confirmed present in OpenRouter's catalog by the user directly (not yet independently re-checked by this codebase)",
        discoveryTimestamp: '2026-08-07',
    },

    'deepseek:deepseek-v4-flash': {
        discoverySource: "DeepSeek's own migration notice (api-docs.deepseek.com)",
        discoveryTimestamp: '2026-01-01',
    },
    'deepseek:deepseek-v4-pro': {
        discoverySource: "DeepSeek's own migration notice (api-docs.deepseek.com)",
        discoveryTimestamp: '2026-01-01',
    },

    'qwen:qwen-turbo': { discoverySource: "Alibaba Cloud Model Studio's own docs", discoveryTimestamp: '2026-01-01' },
    'qwen:qwen-plus': { discoverySource: "Alibaba Cloud Model Studio's own docs", discoveryTimestamp: '2026-01-01' },
    'qwen:qwen-max': { discoverySource: "Alibaba Cloud Model Studio's own docs", discoveryTimestamp: '2026-01-01' },

    'anthropic:claude-haiku-4-5': {
        discoverySource: "Anthropic's own tool-use pricing table",
        discoveryTimestamp: '2026-01-01',
    },
    'anthropic:claude-sonnet-5': {
        discoverySource: 'platform.claude.com/docs/en/about-claude/models/overview (this audit, 2026-08-04)',
        discoveryTimestamp: '2026-08-04',
    },

    'glm:glm-4.5-flash': { discoverySource: "Z.ai's own API reference", discoveryTimestamp: '2026-01-01' },
    'glm:glm-4.6': {
        discoverySource: 'general web search (lower confidence — not confirmed against Z.ai API reference)',
        discoveryTimestamp: '2026-01-01',
    },
};

const statusForModel = (entry: ProviderModelEntry, model: string, isDynamicRoute: boolean): ModelManifestStatus => {
    if (isDynamicRoute) return 'dynamic-route';
    if (entry.realVerifiedModels.includes(model)) return 'live-verified';
    if (entry.offlineVerified) return 'offline-verified';
    return 'configured';
};

/** Build the full model manifest from `PROVIDER_REGISTRY` + curated `DISCOVERY` metadata. Pure —
 * no network/filesystem access, safe to call in any offline test. */
export const buildModelManifest = (): ModelManifestEntry[] => {
    const rows: ModelManifestEntry[] = [];
    for (const entry of PROVIDER_REGISTRY) {
        for (const model of entry.models) {
            const key = `${entry.providerId}:${model}`;
            const meta = DISCOVERY[key];
            if (!meta) {
                throw new Error(`modelManifest: no discovery metadata registered for "${key}" — add one to DISCOVERY`);
            }
            const isDynamicRoute = (entry.dynamicRouteModels ?? []).includes(model);
            rows.push({
                provider: entry.providerId,
                displayName: entry.displayName,
                requestedModel: model,
                stable: !meta.preview,
                kind: isDynamicRoute ? 'dynamic-route' : 'fixed',
                expectedToolSupport: entry.supportsToolCalls,
                discoverySource: meta.discoverySource,
                discoveryTimestamp: meta.discoveryTimestamp,
                benchmarkEnabled: meta.benchmarkEnabled ?? true,
                productionCandidate: meta.productionCandidate ?? true,
                status: statusForModel(entry, model, isDynamicRoute),
                ...(entry.status === 'blocked'
                    ? { skipReason: `provider status is "blocked": ${entry.notes ?? ''}` }
                    : {}),
            });
        }
    }
    return rows;
};

/** Count of *fixed* (non-dynamic-route) models registered for a provider — the number a Phase 6
 * style benchmark-breadth target (">= N fixed models") should be checked against. */
export const countFixedModels = (manifest: ModelManifestEntry[], provider: string): number =>
    manifest.filter(m => m.provider === provider && m.kind === 'fixed').length;

const csvEscape = (value: string): string => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/** Canonical, unsanitized model ids — CSV cells are only quote-escaped for CSV syntax, never
 * stripped of slashes/colons/etc. (`verificationMetrics.ts`'s `buildElapsedVsTokensChart` uses
 * opaque `M01`/`M02`-style point ids for its own Mermaid block display, a concern that never
 * applies to this exact-value export). */
export const formatModelManifestCsv = (manifest: ModelManifestEntry[]): string => {
    const header = [
        'provider',
        'displayName',
        'requestedModel',
        'stable',
        'kind',
        'expectedToolSupport',
        'discoverySource',
        'discoveryTimestamp',
        'benchmarkEnabled',
        'productionCandidate',
        'status',
        'skipReason',
    ];
    const lines = [header.join(',')];
    for (const m of manifest) {
        lines.push(
            [
                m.provider,
                m.displayName,
                m.requestedModel,
                String(m.stable),
                m.kind,
                String(m.expectedToolSupport),
                m.discoverySource,
                m.discoveryTimestamp,
                String(m.benchmarkEnabled),
                String(m.productionCandidate),
                m.status,
                m.skipReason ?? '',
            ]
                .map(csvEscape)
                .join(',')
        );
    }
    return lines.join('\n');
};

export const formatModelManifestJson = (manifest: ModelManifestEntry[]): string => JSON.stringify(manifest, null, 2);
