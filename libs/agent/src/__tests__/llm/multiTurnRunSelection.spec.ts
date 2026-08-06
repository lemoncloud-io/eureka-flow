import { describe, expect, it } from 'vitest';

import { parseModelFilter, planMultiTurnModelSelection } from '../../llm/multiTurnRunSelection';

import type { ProviderModelEntry } from '../../llm/providerRegistry';

/** A minimal synthetic registry entry — enough for `planMultiTurnModelSelection`, never the real
 * `PROVIDER_REGISTRY` — so these tests exercise the pure selection/validation logic without
 * depending on (or being broken by future changes to) the real model catalog. */
const entry = (overrides: Partial<ProviderModelEntry> = {}): ProviderModelEntry => ({
    providerId: 'openai',
    displayName: 'OpenAI',
    gatewayType: 'openai-compatible',
    models: ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-5-mini'],
    defaultModel: 'gpt-4o-mini',
    apiKeyEnv: 'OPENAI_API_KEY',
    supportsToolCalls: true,
    supportsMultiTurnToolResults: true,
    status: 'implemented',
    offlineVerified: true,
    realVerifiedModels: [],
    ...overrides,
});

const OPENAI = entry();
const GEMINI = entry({ providerId: 'gemini', displayName: 'Gemini', apiKeyEnv: 'GEMINI_API_KEY', models: ['gemini-2.5-flash', 'gemini-2.5-pro'] });
const REGISTRY = [OPENAI, GEMINI];
const resolveModelsToRun = (e: ProviderModelEntry): readonly string[] => e.models;

describe('parseModelFilter', () => {
    it('undefined input (env var unset) means "no filter" — returns undefined, not an empty array', () => {
        expect(parseModelFilter(undefined)).toBeUndefined();
    });

    it('a single model value continues to work unchanged — degenerates to a one-element list', () => {
        expect(parseModelFilter('gpt-5-mini')).toEqual(['gpt-5-mini']);
    });

    it('splits a comma-separated list, preserving given order', () => {
        expect(parseModelFilter('gpt-4o-mini,gpt-5-mini')).toEqual(['gpt-4o-mini', 'gpt-5-mini']);
    });

    it('trims whitespace around each entry and around commas', () => {
        expect(parseModelFilter(' gpt-4o-mini , gpt-5-mini  ')).toEqual(['gpt-4o-mini', 'gpt-5-mini']);
    });

    it('removes empty entries from stray/doubled commas', () => {
        expect(parseModelFilter('gpt-4o-mini,,gpt-5-mini,')).toEqual(['gpt-4o-mini', 'gpt-5-mini']);
    });

    it('deduplicates repeated entries, keeping only the first occurrence position', () => {
        expect(parseModelFilter('gpt-4o-mini,gpt-5-mini,gpt-4o-mini')).toEqual(['gpt-4o-mini', 'gpt-5-mini']);
    });

    it('throws when the value resolves to zero models (empty or all-whitespace)', () => {
        expect(() => parseModelFilter('')).toThrow(/resolved to zero models/);
        expect(() => parseModelFilter('   ,  ,')).toThrow(/resolved to zero models/);
    });
});

describe('planMultiTurnModelSelection: one model (existing behavior unchanged)', () => {
    it('a single-model filter selects exactly that one (entry, model) pair', () => {
        const selection = planMultiTurnModelSelection({
            registry: REGISTRY,
            providerFilter: 'openai',
            modelFilter: 'gpt-5-mini',
            resolveModelsToRun,
        });
        expect(selection.requestedModels).toEqual(['gpt-5-mini']);
        expect(selection.pairs).toEqual([{ entry: OPENAI, model: 'gpt-5-mini' }]);
    });

    it('no model filter at all selects every model for the selected provider(s), in registry order', () => {
        const selection = planMultiTurnModelSelection({
            registry: REGISTRY,
            providerFilter: 'openai',
            modelFilter: undefined,
            resolveModelsToRun,
        });
        expect(selection.requestedModels).toEqual([]);
        expect(selection.pairs.map(p => p.model)).toEqual(['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-5-mini']);
    });
});

describe('planMultiTurnModelSelection: two comma-separated models', () => {
    it('selects both (entry, model) pairs, in REGISTRY order — never reordered to match filter order', () => {
        const selection = planMultiTurnModelSelection({
            registry: REGISTRY,
            providerFilter: 'openai',
            modelFilter: 'gpt-5-mini,gpt-4o-mini', // reversed vs. registry order on purpose
            resolveModelsToRun,
        });
        expect(selection.requestedModels).toEqual(['gpt-5-mini', 'gpt-4o-mini']);
        // registry order (gpt-4o-mini before gpt-5-mini), NOT the filter's gpt-5-mini-first order.
        expect(selection.pairs.map(p => p.model)).toEqual(['gpt-4o-mini', 'gpt-5-mini']);
        expect(selection.pairs.every(p => p.entry === OPENAI)).toBe(true);
    });

    it('an unset provider filter can select models across multiple providers, still in registry order', () => {
        const selection = planMultiTurnModelSelection({
            registry: REGISTRY,
            providerFilter: undefined,
            modelFilter: 'gemini-2.5-pro,gpt-4o-mini',
            resolveModelsToRun,
        });
        expect(selection.pairs.map(p => ({ providerId: p.entry.providerId, model: p.model }))).toEqual([
            { providerId: 'openai', model: 'gpt-4o-mini' },
            { providerId: 'gemini', model: 'gemini-2.5-pro' },
        ]);
    });
});

describe('planMultiTurnModelSelection: whitespace and duplicate handling', () => {
    it('tolerates whitespace and duplicate model ids without changing the resulting pair set', () => {
        const selection = planMultiTurnModelSelection({
            registry: REGISTRY,
            providerFilter: 'openai',
            modelFilter: ' gpt-4o-mini ,gpt-4o-mini, gpt-5-mini ',
            resolveModelsToRun,
        });
        expect(selection.requestedModels).toEqual(['gpt-4o-mini', 'gpt-5-mini']);
        expect(selection.pairs.map(p => p.model)).toEqual(['gpt-4o-mini', 'gpt-5-mini']);
    });
});

describe('planMultiTurnModelSelection: invalid model rejection before any gateway/network call', () => {
    it('throws synchronously for a model absent from every selected provider — never silently dropped', () => {
        expect(() =>
            planMultiTurnModelSelection({
                registry: REGISTRY,
                providerFilter: 'openai',
                modelFilter: 'gpt-4o-mini,not-a-real-model',
                resolveModelsToRun,
            })
        ).toThrow(/unknown model "not-a-real-model"/);
    });

    it('the thrown error lists the actually-valid models for the selected provider(s)', () => {
        expect(() =>
            planMultiTurnModelSelection({
                registry: REGISTRY,
                providerFilter: 'openai',
                modelFilter: 'not-a-real-model',
                resolveModelsToRun,
            })
        ).toThrow(/gpt-4o-mini, gpt-4\.1-mini, gpt-5-mini/);
    });

    it('a model that is valid for a DIFFERENT (non-selected) provider is still rejected', () => {
        // gemini-2.5-pro is real, but the provider filter narrows to openai only — it must not
        // silently validate against providers that were filtered out.
        expect(() =>
            planMultiTurnModelSelection({
                registry: REGISTRY,
                providerFilter: 'openai',
                modelFilter: 'gemini-2.5-pro',
                resolveModelsToRun,
            })
        ).toThrow(/unknown model "gemini-2\.5-pro"/);
    });
});

describe('planMultiTurnModelSelection: consolidated expected-task-count arithmetic', () => {
    it('2 models x 3 scenarios x 2 repetitions = 12 consolidated expected tasks, from ONE selection call', () => {
        const selection = planMultiTurnModelSelection({
            registry: REGISTRY,
            providerFilter: 'openai',
            modelFilter: 'gpt-4o-mini,gpt-5-mini',
            resolveModelsToRun,
        });
        const scenarios = ['move-node-right', 'ambiguous-instruction', 'unknown-target'];
        const repetitions = 2;
        expect(selection.pairs).toHaveLength(2);
        expect(selection.pairs.length * scenarios.length * repetitions).toBe(12);
    });
});
