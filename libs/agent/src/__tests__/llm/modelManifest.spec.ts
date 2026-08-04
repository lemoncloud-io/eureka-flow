import { describe, expect, it } from 'vitest';

import {
    buildModelManifest,
    countFixedModels,
    formatModelManifestCsv,
    formatModelManifestJson,
} from '../../llm/modelManifest';

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
