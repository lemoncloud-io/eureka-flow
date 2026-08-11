import type { ProviderModelEntry } from './providerRegistry';

/**
 * Pure, offline-testable model-selection logic for `realMultiTurnLocatorScenarios.spec.ts`'s
 * `LIVE_MULTI_TURN_MODEL_FILTER`. Extracted out of that file (rather than inlined) specifically so
 * comma-list parsing, dedup/trim, registry-order preservation, and "fail before any network call"
 * validation can be unit-tested directly (construct a synthetic registry + fake `resolveModelsToRun`,
 * no env vars, no gateway, no network) instead of only being exercisable by re-running the whole
 * live-gated spec file under different environments. No `process.env` access happens in this file —
 * every input arrives as a plain argument, same "the live spec owns env parsing" boundary
 * `multiTurnVerificationMetrics.ts` documents for itself.
 */

/**
 * Parses `LIVE_MULTI_TURN_MODEL_FILTER` into a deduplicated, trimmed, order-preserving list.
 * `undefined` (env var unset) returns `undefined` — meaning "no filter, every registered model for
 * the selected provider(s) is eligible" — deliberately never an empty array, which would instead
 * mean "match nothing". A single bare value with no comma degenerates to a one-element list, so
 * existing single-model behavior is unchanged. Throws only when the value is present but resolves
 * to zero non-empty entries (e.g. `""` or `" , "`).
 */
export const parseModelFilter = (raw: string | undefined): string[] | undefined => {
    if (raw === undefined) return undefined;
    const seen = new Set<string>();
    const requested: string[] = [];
    for (const part of raw.split(',')) {
        const trimmed = part.trim();
        if (trimmed.length === 0 || seen.has(trimmed)) continue;
        seen.add(trimmed);
        requested.push(trimmed);
    }
    if (requested.length === 0) {
        throw new Error('LIVE_MULTI_TURN_MODEL_FILTER resolved to zero models (empty or all-whitespace value)');
    }
    return requested;
};

export interface PlannedModelPair {
    entry: ProviderModelEntry;
    model: string;
}

export interface MultiTurnModelSelection {
    /** The parsed `LIVE_MULTI_TURN_MODEL_FILTER` list, in the order given — empty array means no
     * filter was set (every registered model for the selected provider(s) was eligible), never
     * used to mean "matched nothing". This is the exact value the run manifest's
     * `requestedModels` field should store. */
    requestedModels: string[];
    /** Every (registry entry, model) pair in scope, in registry order — never reordered to match
     * `requestedModels`'s order, so a caller-given filter order (e.g. `gpt-5-mini,gpt-4o-mini`)
     * never changes execution/reporting order. */
    pairs: readonly PlannedModelPair[];
}

export interface PlanMultiTurnModelSelectionOptions {
    registry: readonly ProviderModelEntry[];
    providerFilter: string | undefined;
    modelFilter: string | undefined;
    /** Resolves the models to consider for one entry — the caller applies its own
     * `entry.modelEnvOverride` env lookup here, keeping this function free of `process.env` access. */
    resolveModelsToRun: (entry: ProviderModelEntry) => readonly string[];
}

/**
 * Resolves which (provider entry, model) pairs are in scope for a multi-turn live run, given an
 * optional provider filter and an optional (comma-list-capable) model filter.
 *
 * Throws synchronously — before the caller could make any network call — if any requested model in
 * `modelFilter` doesn't exist in ANY selected provider's resolved model list. Never silently drops
 * an unrecognized model the way a plain `.filter()` would.
 */
export const planMultiTurnModelSelection = (options: PlanMultiTurnModelSelectionOptions): MultiTurnModelSelection => {
    const requestedModels = parseModelFilter(options.modelFilter) ?? [];
    const modelFilterSet = requestedModels.length > 0 ? new Set(requestedModels) : null;

    const selectableEntries = options.registry.filter(
        entry => !options.providerFilter || options.providerFilter === entry.providerId
    );

    const validModels = new Set<string>();
    const pairs: PlannedModelPair[] = [];
    for (const entry of selectableEntries) {
        for (const model of options.resolveModelsToRun(entry)) {
            validModels.add(model);
            if (!modelFilterSet || modelFilterSet.has(model)) {
                pairs.push({ entry, model });
            }
        }
    }

    if (modelFilterSet) {
        for (const model of requestedModels) {
            if (!validModels.has(model)) {
                throw new Error(
                    `LIVE_MULTI_TURN_MODEL_FILTER has an unknown model "${model}" for the selected provider(s) — ` +
                        `valid models: ${[...validModels].join(', ') || '(none match LIVE_MULTI_TURN_PROVIDER_FILTER)'}`
                );
            }
        }
    }

    return { requestedModels, pairs };
};
