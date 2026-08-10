import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    buildModelManifest,
    countFixedModels,
    formatModelManifestCsv,
    formatModelManifestJson,
} from '../../llm/modelManifest';

import type { ProviderModelEntry } from '../../llm/providerRegistry';

/** A minimal synthetic registry entry, matching the pattern `multiTurnRunSelection.spec.ts` uses —
 * never the real `PROVIDER_REGISTRY` — so these mocked-registry tests below exercise exactly the
 * `buildModelManifest` branch under test without depending on today's real model catalog (which
 * has no `offlineVerified: false` or `status: 'blocked'` entry to reach these branches with). */
const syntheticEntry = (overrides: Partial<ProviderModelEntry> = {}): ProviderModelEntry => ({
    providerId: 'openai',
    displayName: 'OpenAI',
    gatewayType: 'openai-compatible',
    models: ['gpt-4o-mini'],
    defaultModel: 'gpt-4o-mini',
    apiKeyEnv: 'OPENAI_API_KEY',
    supportsToolCalls: true,
    supportsMultiTurnToolResults: true,
    status: 'implemented',
    offlineVerified: true,
    realVerifiedModels: [],
    ...overrides,
});

describe('buildModelManifest', () => {
    it('builds a manifest row for every model in PROVIDER_REGISTRY without throwing', () => {
        const manifest = buildModelManifest();
        expect(manifest.length).toBeGreaterThan(0);
        for (const row of manifest) {
            expect(row.provider).toBeTruthy();
            expect(row.requestedModel).toBeTruthy();
            expect(row.discoverySource).toBeTruthy();
            expect(row.discoveryTimestamp).toBeTruthy();
        }
    });

    it('meets the Phase 6 benchmark-breadth targets: >=4 OpenAI, >=5 Gemini, >=6 fixed OpenRouter', () => {
        const manifest = buildModelManifest();
        expect(countFixedModels(manifest, 'openai')).toBeGreaterThanOrEqual(4);
        expect(countFixedModels(manifest, 'gemini')).toBeGreaterThanOrEqual(5);
        expect(countFixedModels(manifest, 'openrouter')).toBeGreaterThanOrEqual(6);
    });

    it('never counts openrouter/free as a fixed model', () => {
        const manifest = buildModelManifest();
        const free = manifest.find(m => m.provider === 'openrouter' && m.requestedModel === 'openrouter/free');
        expect(free?.kind).toBe('dynamic-route');
        expect(free?.status).toBe('dynamic-route');
    });

    it('flags -preview-suffixed models as not stable', () => {
        const manifest = buildModelManifest();
        const preview = manifest.filter(m => m.requestedModel.includes('-preview'));
        expect(preview.length).toBeGreaterThan(0);
        for (const row of preview) {
            expect(row.stable).toBe(false);
        }
    });

    it('has no duplicate (provider, requestedModel) rows', () => {
        const manifest = buildModelManifest();
        const keys = manifest.map(m => `${m.provider}:${m.requestedModel}`);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('marks openrouter/free real-verified models as live-verified, not merely configured', () => {
        const manifest = buildModelManifest();
        const gpt4oMini = manifest.find(m => m.provider === 'openai' && m.requestedModel === 'gpt-4o-mini');
        expect(gpt4oMini?.status).toBe('live-verified');
    });

    it('registers anthropic/claude-fable-5 (openrouter) with a distinct, honestly-weaker discovery source than the other openrouter:* entries, and status offline-verified (not live-verified — no live run has happened yet)', () => {
        const manifest = buildModelManifest();
        const fable = manifest.find(
            m => m.provider === 'openrouter' && m.requestedModel === 'anthropic/claude-fable-5'
        );
        expect(fable).toBeDefined();
        expect(fable?.kind).toBe('fixed');
        expect(fable?.status).toBe('offline-verified');
        // Every other openrouter:* entry cites OpenRouter's own public Models API as its discovery
        // source (an independent, live-checkable claim) — Fable's is deliberately labeled
        // "user-reported" instead, since this codebase has not yet independently re-confirmed it the
        // same way. The two must never read as equally strong.
        expect(fable?.discoverySource).toMatch(/user-reported/i);
        const opus = manifest.find(m => m.provider === 'openrouter' && m.requestedModel === 'anthropic/claude-opus-5');
        expect(opus?.discoverySource).not.toMatch(/user-reported/i);
    });
});

describe('buildModelManifest: branches unreachable through the real PROVIDER_REGISTRY (mocked registry)', () => {
    // Every real registry entry today is offlineVerified: true and status is never 'blocked' — so
    // statusForModel's 'configured' fallback and the status==='blocked' skipReason branch can only
    // be reached by substituting a synthetic registry. `vi.doMock` + a fresh dynamic `import()` per
    // test (rather than a file-level `vi.mock`) keeps every other test in this file working against
    // the real, unmocked PROVIDER_REGISTRY via its already-evaluated static import at the top.
    beforeEach(() => {
        vi.resetModules();
    });

    it('statusForModel falls back to "configured" for a model that is not a dynamic route, not real-verified, and not offline-verified', async () => {
        vi.doMock('../../llm/providerRegistry', () => ({
            PROVIDER_REGISTRY: [syntheticEntry({ offlineVerified: false, realVerifiedModels: [] })],
        }));
        const { buildModelManifest: mockedBuildModelManifest } = await import('../../llm/modelManifest');

        const manifest = mockedBuildModelManifest();
        expect(manifest).toHaveLength(1);
        expect(manifest[0].status).toBe('configured');
    });

    it('throws when a registered model has no matching DISCOVERY entry', async () => {
        vi.doMock('../../llm/providerRegistry', () => ({
            PROVIDER_REGISTRY: [
                syntheticEntry({
                    providerId: 'totally-unknown-provider',
                    models: ['totally-unknown-model'],
                    defaultModel: 'totally-unknown-model',
                }),
            ],
        }));
        const { buildModelManifest: mockedBuildModelManifest } = await import('../../llm/modelManifest');

        expect(() => mockedBuildModelManifest()).toThrow(
            'modelManifest: no discovery metadata registered for "totally-unknown-provider:totally-unknown-model" — add one to DISCOVERY'
        );
    });

    it('populates skipReason from notes when a provider entry has status "blocked" with notes set', async () => {
        vi.doMock('../../llm/providerRegistry', () => ({
            PROVIDER_REGISTRY: [syntheticEntry({ status: 'blocked', notes: 'account suspended pending review' })],
        }));
        const { buildModelManifest: mockedBuildModelManifest } = await import('../../llm/modelManifest');

        const manifest = mockedBuildModelManifest();
        expect(manifest[0].skipReason).toBe('provider status is "blocked": account suspended pending review');
    });

    it('populates skipReason with an empty notes fallback when a "blocked" provider entry has no notes at all', async () => {
        vi.doMock('../../llm/providerRegistry', () => ({
            PROVIDER_REGISTRY: [syntheticEntry({ status: 'blocked', notes: undefined })],
        }));
        const { buildModelManifest: mockedBuildModelManifest } = await import('../../llm/modelManifest');

        const manifest = mockedBuildModelManifest();
        expect(manifest[0].skipReason).toBe('provider status is "blocked": ');
    });

    it('a non-"blocked" status never adds a skipReason at all', async () => {
        vi.doMock('../../llm/providerRegistry', () => ({
            PROVIDER_REGISTRY: [syntheticEntry({ status: 'planned' })],
        }));
        const { buildModelManifest: mockedBuildModelManifest } = await import('../../llm/modelManifest');

        const manifest = mockedBuildModelManifest();
        expect(manifest[0].skipReason).toBeUndefined();
    });
});

describe('formatModelManifestCsv', () => {
    it('preserves canonical model ids exactly — slashes, colons, and :free suffixes are never sanitized', () => {
        const manifest = buildModelManifest();
        const csv = formatModelManifestCsv(manifest);
        expect(csv).toContain('openai/gpt-oss-20b:free');
        expect(csv).toContain('anthropic/claude-haiku-4.5');
        expect(csv).toContain('openrouter/free');
    });

    it('quote-escapes a field containing a comma without altering the value semantically', () => {
        const csv = formatModelManifestCsv([
            {
                provider: 'test',
                displayName: 'Test',
                requestedModel: 'model-x',
                stable: true,
                kind: 'fixed',
                expectedToolSupport: true,
                discoverySource: 'a, b',
                discoveryTimestamp: '2026-08-04',
                benchmarkEnabled: true,
                productionCandidate: true,
                status: 'configured',
            },
        ]);
        expect(csv).toContain('"a, b"');
    });
});

describe('formatModelManifestJson', () => {
    it('round-trips to valid JSON preserving every field', () => {
        const manifest = buildModelManifest();
        const parsed = JSON.parse(formatModelManifestJson(manifest));
        expect(parsed).toHaveLength(manifest.length);
        expect(parsed[0]).toEqual(manifest[0]);
    });
});
