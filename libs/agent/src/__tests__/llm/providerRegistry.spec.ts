import { describe, expect, it } from 'vitest';

import { createVirtualAgentEnvironment } from '../../environment/createVirtualAgentEnvironment';
import { ScriptedHttpRequest } from '../../http/ScriptedHttpRequest';
import { PROVIDER_REGISTRY, createGatewayForEntry, resolveModelsToRun } from '../../llm/providerRegistry';

import type { Chunk } from '../../llm/llmGateway';
import type { ProviderModelEntry, ProviderStatus } from '../../llm/providerRegistry';

const VALID_STATUSES: ProviderStatus[] = ['implemented', 'planned', 'blocked'];

const drain = async (stream: AsyncIterable<Chunk>): Promise<Chunk[]> => {
    const chunks: Chunk[] = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return chunks;
};

const findEntry = (providerId: string): ProviderModelEntry => {
    const entry = PROVIDER_REGISTRY.find(e => e.providerId === providerId);
    if (!entry) throw new Error(`test setup: no registry entry for providerId "${providerId}"`);
    return entry;
};

describe('PROVIDER_REGISTRY', () => {
    it('registers OpenAI, Gemini, OpenRouter, DeepSeek, Qwen, Claude, and GLM — nothing else yet', () => {
        expect(PROVIDER_REGISTRY.map(e => e.providerId).sort()).toEqual([
            'anthropic',
            'deepseek',
            'gemini',
            'glm',
            'openai',
            'openrouter',
            'qwen',
        ]);
    });

    it('OpenAI, Gemini, and OpenRouter are implemented; DeepSeek, Qwen, Claude, and GLM are planned only', () => {
        const statuses = Object.fromEntries(PROVIDER_REGISTRY.map(e => [e.providerId, e.status]));
        expect(statuses).toEqual({
            openai: 'implemented',
            gemini: 'implemented',
            openrouter: 'implemented',
            deepseek: 'planned',
            qwen: 'planned',
            anthropic: 'planned',
            glm: 'planned',
        });
    });

    it('OpenRouter is implemented and real-verified for openrouter/free specifically, not every model', () => {
        const entry = findEntry('openrouter');

        expect(entry.status).toBe('implemented');
        expect(entry.offlineVerified).toBe(true);
        expect(entry.realVerifiedModels).toEqual(['openrouter/free']);
        // openai/gpt-4o-mini stays a registered-but-unverified candidate.
        expect(entry.models).toContain('openai/gpt-4o-mini');
        expect(entry.realVerifiedModels).not.toContain('openai/gpt-4o-mini');
    });

    describe('DeepSeek entry (planned, offline-wired only — no real-key run yet)', () => {
        const entry = findEntry('deepseek');

        it('exists in the registry, planned (not implemented) — offline-verified but not real-verified', () => {
            expect(entry).toBeDefined();
            expect(entry.status).toBe('planned');
            // The dispatcher-wiring test below passes offline (scripted HTTP, no network) — that's
            // what offlineVerified means. It is NOT a real-provider claim; realVerifiedModels below
            // stays empty until an actual funded key runs against the live API.
            expect(entry.offlineVerified).toBe(true);
            expect(entry.realVerifiedModels).toEqual([]);
        });

        it('apiKeyEnv is DEEPSEEK_API_KEY, never VITE_-prefixed', () => {
            expect(entry.apiKeyEnv).toBe('DEEPSEEK_API_KEY');
            expect(entry.apiKeyEnv.startsWith('VITE_')).toBe(false);
            expect(entry.modelEnvOverride?.startsWith('VITE_') ?? false).toBe(false);
        });

        it('defaultModel is a member of models', () => {
            expect(entry.models).toContain(entry.defaultModel);
        });

        it(
            'createGatewayForEntry dispatches through the OpenAI-compatible gateway to the DeepSeek ' +
                'baseUrl, not the OpenAI default — and never touches the real network',
            async () => {
                const http = new ScriptedHttpRequest([{ json: { choices: [{ message: { content: 'hi' } }] } }]);

                const gateway = createGatewayForEntry(entry, {
                    apiKey: 'test-deepseek-key',
                    model: entry.defaultModel,
                    environment: createVirtualAgentEnvironment(),
                    http,
                });

                // Same gateway shape as OpenAI (it IS createOpenAiLlmGateway) — only baseUrl/key differ.
                expect(gateway.capabilities).toEqual({ toolCalls: true });
                await drain(gateway.chat({ messages: [{ role: 'user', content: 'hi' }], tools: [] }));

                // ScriptedHttpRequest never touches the network; exactly one scripted call proves the
                // gateway made no additional/hidden requests either.
                expect(http.requests).toHaveLength(1);
                expect(http.requests[0].url).toBe('https://api.deepseek.com/chat/completions');
                expect(http.requests[0].url).not.toBe('https://api.openai.com/v1/chat/completions');
                expect(http.requests[0].url).not.toContain('test-deepseek-key');
                expect(http.requests[0].headers?.['authorization']).toBe('Bearer test-deepseek-key');
                expect(http.requests[0].body).toMatchObject({ model: entry.defaultModel });
            }
        );
    });

    describe('Qwen entry (planned, offline-wired only — no real-key run yet)', () => {
        const entry = findEntry('qwen');

        it('exists in the registry, planned (not implemented) — offline-verified but not real-verified', () => {
            expect(entry).toBeDefined();
            expect(entry.status).toBe('planned');
            // Same reasoning as DeepSeek's entry: the dispatcher-wiring test below passes offline
            // (scripted HTTP, no network) — that's what offlineVerified means, not a real-provider
            // claim. realVerifiedModels stays empty until an actual funded key runs live.
            expect(entry.offlineVerified).toBe(true);
            expect(entry.realVerifiedModels).toEqual([]);
        });

        it('apiKeyEnv is QWEN_API_KEY, never VITE_-prefixed', () => {
            expect(entry.apiKeyEnv).toBe('QWEN_API_KEY');
            expect(entry.apiKeyEnv.startsWith('VITE_')).toBe(false);
            expect(entry.modelEnvOverride?.startsWith('VITE_') ?? false).toBe(false);
        });

        it('defaultModel is a member of models', () => {
            expect(entry.models).toContain(entry.defaultModel);
        });

        it(
            'createGatewayForEntry dispatches through the OpenAI-compatible gateway to the Qwen/DashScope ' +
                'baseUrl, not the OpenAI default — and never touches the real network',
            async () => {
                const http = new ScriptedHttpRequest([{ json: { choices: [{ message: { content: 'hi' } }] } }]);

                const gateway = createGatewayForEntry(entry, {
                    apiKey: 'test-qwen-key',
                    model: entry.defaultModel,
                    environment: createVirtualAgentEnvironment(),
                    http,
                });

                // Same gateway shape as OpenAI (it IS createOpenAiLlmGateway) — only baseUrl/key differ.
                expect(gateway.capabilities).toEqual({ toolCalls: true });
                await drain(gateway.chat({ messages: [{ role: 'user', content: 'hi' }], tools: [] }));

                // ScriptedHttpRequest never touches the network; exactly one scripted call proves the
                // gateway made no additional/hidden requests either.
                expect(http.requests).toHaveLength(1);
                expect(http.requests[0].url).toBe(
                    'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions'
                );
                expect(http.requests[0].url).not.toBe('https://api.openai.com/v1/chat/completions');
                expect(http.requests[0].url).not.toContain('test-qwen-key');
                expect(http.requests[0].headers?.['authorization']).toBe('Bearer test-qwen-key');
                expect(http.requests[0].body).toMatchObject({ model: entry.defaultModel });
            }
        );
    });

    describe('Claude entry (planned, offline-wired only — no real-key run yet; native gateway, not an openai-compatible reuse)', () => {
        const entry = findEntry('anthropic');

        it('exists in the registry, planned (not implemented) — offline-verified but not real-verified', () => {
            expect(entry).toBeDefined();
            expect(entry.gatewayType).toBe('anthropic-native');
            expect(entry.status).toBe('planned');
            // AnthropicToolLlmGateway.spec.ts passes offline (scripted HTTP, no network) — that's
            // what offlineVerified means, same reasoning as DeepSeek/Qwen. Not a real-provider claim.
            expect(entry.offlineVerified).toBe(true);
            expect(entry.realVerifiedModels).toEqual([]);
            // Multi-turn tool-result mapping is implemented and offline-verified — see
            // AnthropicToolLlmGateway.spec.ts's multi-turn request-mapping tests. Still not
            // real-key-verified, which is exactly why status stays 'planned' and
            // realVerifiedModels stays empty above.
            expect(entry.supportsMultiTurnToolResults).toBe(true);
        });

        it('apiKeyEnv is ANTHROPIC_API_KEY, never VITE_-prefixed', () => {
            expect(entry.apiKeyEnv).toBe('ANTHROPIC_API_KEY');
            expect(entry.apiKeyEnv.startsWith('VITE_')).toBe(false);
            expect(entry.modelEnvOverride?.startsWith('VITE_') ?? false).toBe(false);
        });

        it('defaultModel is a member of models', () => {
            expect(entry.models).toContain(entry.defaultModel);
        });

        it(
            'createGatewayForEntry dispatches through the native Anthropic gateway to the Claude ' +
                'baseUrl, not the OpenAI default — and never touches the real network',
            async () => {
                const http = new ScriptedHttpRequest([{ json: { content: [{ type: 'text', text: 'hi' }] } }]);

                const gateway = createGatewayForEntry(entry, {
                    apiKey: 'test-anthropic-key',
                    model: entry.defaultModel,
                    environment: createVirtualAgentEnvironment(),
                    http,
                });

                expect(gateway.capabilities).toEqual({ toolCalls: true });
                await drain(gateway.chat({ messages: [{ role: 'user', content: 'hi' }], tools: [] }));

                // ScriptedHttpRequest never touches the network; exactly one scripted call proves the
                // gateway made no additional/hidden requests either.
                expect(http.requests).toHaveLength(1);
                expect(http.requests[0].url).toBe('https://api.anthropic.com/v1/messages');
                expect(http.requests[0].url).not.toBe('https://api.openai.com/v1/chat/completions');
                expect(http.requests[0].url).not.toContain('test-anthropic-key');
                // Anthropic-specific: x-api-key, not Authorization: Bearer — proves this really
                // went through the native gateway, not accidentally the OpenAI-compatible one.
                expect(http.requests[0].headers?.['x-api-key']).toBe('test-anthropic-key');
                expect(http.requests[0].headers?.['authorization']).toBeUndefined();
                expect(http.requests[0].headers?.['anthropic-version']).toBe('2023-06-01');
                expect(http.requests[0].body).toMatchObject({ model: entry.defaultModel });
            }
        );
    });

    describe('GLM entry (planned, offline-wired only — no real-key run yet)', () => {
        const entry = findEntry('glm');

        it('exists in the registry, planned (not implemented) — offline-verified but not real-verified', () => {
            expect(entry).toBeDefined();
            expect(entry.status).toBe('planned');
            // The dispatcher-wiring test below passes offline (scripted HTTP, no network) — that's
            // what offlineVerified means, same reasoning as DeepSeek/Qwen. Not a real-provider claim.
            expect(entry.offlineVerified).toBe(true);
            expect(entry.realVerifiedModels).toEqual([]);
        });

        it('apiKeyEnv is GLM_API_KEY, never VITE_-prefixed', () => {
            expect(entry.apiKeyEnv).toBe('GLM_API_KEY');
            expect(entry.apiKeyEnv.startsWith('VITE_')).toBe(false);
            expect(entry.modelEnvOverride?.startsWith('VITE_') ?? false).toBe(false);
        });

        it('defaultModel is a member of models', () => {
            expect(entry.models).toContain(entry.defaultModel);
        });

        it(
            'createGatewayForEntry dispatches through the OpenAI-compatible gateway to the Z.ai ' +
                'baseUrl, not the OpenAI default — and never touches the real network',
            async () => {
                const http = new ScriptedHttpRequest([{ json: { choices: [{ message: { content: 'hi' } }] } }]);

                const gateway = createGatewayForEntry(entry, {
                    apiKey: 'test-glm-key',
                    model: entry.defaultModel,
                    environment: createVirtualAgentEnvironment(),
                    http,
                });

                // Same gateway shape as OpenAI (it IS createOpenAiLlmGateway) — only baseUrl/key differ.
                expect(gateway.capabilities).toEqual({ toolCalls: true });
                await drain(gateway.chat({ messages: [{ role: 'user', content: 'hi' }], tools: [] }));

                // ScriptedHttpRequest never touches the network; exactly one scripted call proves the
                // gateway made no additional/hidden requests either.
                expect(http.requests).toHaveLength(1);
                expect(http.requests[0].url).toBe('https://api.z.ai/api/paas/v4/chat/completions');
                expect(http.requests[0].url).not.toBe('https://api.openai.com/v1/chat/completions');
                expect(http.requests[0].url).not.toContain('test-glm-key');
                expect(http.requests[0].headers?.['authorization']).toBe('Bearer test-glm-key');
                expect(http.requests[0].body).toMatchObject({ model: entry.defaultModel });
            }
        );
    });

    it.each(PROVIDER_REGISTRY.map(entry => [entry.providerId, entry] as const))(
        '%s: has every required field, non-empty/well-typed',
        (_providerId, entry) => {
            expect(entry.providerId.length).toBeGreaterThan(0);
            expect(entry.displayName.length).toBeGreaterThan(0);
            expect(['openai-compatible', 'gemini-native', 'anthropic-native']).toContain(entry.gatewayType);
            expect(Array.isArray(entry.models)).toBe(true);
            expect(entry.models.length).toBeGreaterThan(0);
            expect(entry.defaultModel.length).toBeGreaterThan(0);
            expect(entry.apiKeyEnv.length).toBeGreaterThan(0);
            expect(typeof entry.supportsToolCalls).toBe('boolean');
            expect(typeof entry.supportsMultiTurnToolResults).toBe('boolean');
            expect(VALID_STATUSES).toContain(entry.status);
            expect(typeof entry.offlineVerified).toBe('boolean');
            expect(Array.isArray(entry.realVerifiedModels)).toBe(true);
        }
    );

    it.each(PROVIDER_REGISTRY.map(entry => [entry.providerId, entry] as const))(
        '%s: defaultModel is a member of models',
        (_providerId, entry) => {
            expect(entry.models).toContain(entry.defaultModel);
        }
    );

    it.each(PROVIDER_REGISTRY.map(entry => [entry.providerId, entry] as const))(
        '%s: apiKeyEnv is never a VITE_-prefixed var (must not reach the browser bundle)',
        (_providerId, entry) => {
            expect(entry.apiKeyEnv.startsWith('VITE_')).toBe(false);
            expect(entry.modelEnvOverride?.startsWith('VITE_') ?? false).toBe(false);
        }
    );

    it.each(PROVIDER_REGISTRY.map(entry => [entry.providerId, entry] as const))(
        '%s: status "implemented" implies offlineVerified is true',
        (_providerId, entry) => {
            if (entry.status === 'implemented') {
                expect(entry.offlineVerified).toBe(true);
            }
        }
    );

    it.each(PROVIDER_REGISTRY.map(entry => [entry.providerId, entry] as const))(
        '%s: realVerifiedModels only names models that are actually in models',
        (_providerId, entry) => {
            for (const verified of entry.realVerifiedModels) {
                expect(entry.models).toContain(verified);
            }
        }
    );

    it('createGatewayForEntry builds a real OpenAI gateway (openai-compatible) hitting api.openai.com', async () => {
        const entry = findEntry('openai');
        const http = new ScriptedHttpRequest([
            { json: { choices: [{ message: { content: 'hi' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } } },
        ]);

        const gateway = createGatewayForEntry(entry, {
            apiKey: 'test-openai-key',
            model: 'gpt-4.1-mini',
            environment: createVirtualAgentEnvironment(),
            http,
        });

        expect(gateway.capabilities).toEqual({ toolCalls: true });
        await drain(gateway.chat({ messages: [{ role: 'user', content: 'hi' }], tools: [] }));

        expect(http.requests).toHaveLength(1);
        expect(http.requests[0].url).toBe('https://api.openai.com/v1/chat/completions');
        expect(http.requests[0].body).toMatchObject({ model: 'gpt-4.1-mini' });
    });

    it('createGatewayForEntry builds a real Gemini gateway (gemini-native) hitting generativelanguage.googleapis.com', async () => {
        const entry = findEntry('gemini');
        const http = new ScriptedHttpRequest([{ json: { candidates: [{ content: { parts: [{ text: 'hi' }] } }] } }]);

        const gateway = createGatewayForEntry(entry, {
            apiKey: 'test-gemini-key',
            model: 'gemini-2.5-pro',
            environment: createVirtualAgentEnvironment(),
            http,
        });

        expect(gateway.capabilities).toEqual({ toolCalls: true });
        await drain(gateway.chat({ messages: [{ role: 'user', content: 'hi' }], tools: [] }));

        expect(http.requests).toHaveLength(1);
        expect(http.requests[0].url).toBe(
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent'
        );
    });

    it("createGatewayForEntry passes OpenRouter's baseUrl through to the OpenAI-compatible gateway (not the default OpenAI URL)", async () => {
        const entry = findEntry('openrouter');
        const http = new ScriptedHttpRequest([{ json: { choices: [{ message: { content: 'hi' } }] } }]);

        const gateway = createGatewayForEntry(entry, {
            apiKey: 'test-openrouter-key',
            model: 'openrouter/free',
            environment: createVirtualAgentEnvironment(),
            http,
        });

        // Same gateway shape as OpenAI (it IS createOpenAiLlmGateway) — only the URL differs.
        expect(gateway.capabilities).toEqual({ toolCalls: true });
        await drain(gateway.chat({ messages: [{ role: 'user', content: 'hi' }], tools: [] }));

        expect(http.requests).toHaveLength(1);
        expect(http.requests[0].url).toBe('https://openrouter.ai/api/v1/chat/completions');
        expect(http.requests[0].url).not.toBe('https://api.openai.com/v1/chat/completions');
        expect(http.requests[0].url).not.toContain('test-openrouter-key');
        expect(http.requests[0].headers?.['authorization']).toBe('Bearer test-openrouter-key');
        expect(http.requests[0].body).toMatchObject({ model: 'openrouter/free' });
    });
});

describe('Old/new model-version compatibility (Part B)', () => {
    // A provider is exempt from the "multiple models" bar only if its notes explain why — e.g.
    // Claude currently has one model id with an open, flagged, not-yet-confirmed question about
    // whether it needs a date suffix (see ANTHROPIC_ENTRY's notes) rather than a second, invented
    // model id. This keeps the structural check honest: it fails loudly for a provider that's
    // just been left at one model with no explanation, rather than silently passing everything.
    const EXEMPT_SINGLE_MODEL_PROVIDERS = new Set(['anthropic']);

    it.each(PROVIDER_REGISTRY.map(entry => [entry.providerId, entry] as const))(
        '%s: has at least one current model entry',
        (_providerId, entry) => {
            expect(entry.models.length).toBeGreaterThanOrEqual(1);
        }
    );

    it.each(PROVIDER_REGISTRY.map(entry => [entry.providerId, entry] as const))(
        '%s: represents old/current/new model coverage, or documents why it cannot yet',
        (providerId, entry) => {
            if (entry.models.length >= 2) {
                // Old/new spread present — defaultModel must still be one of the covered models
                // (already asserted elsewhere, re-checked here as the load-bearing assumption of
                // this test).
                expect(entry.models).toContain(entry.defaultModel);
                return;
            }

            // Single-model providers must be an explicitly acknowledged exemption, with a note
            // explaining why a second (older or newer) model id isn't registered yet — never a
            // silent gap.
            expect(EXEMPT_SINGLE_MODEL_PROVIDERS.has(providerId)).toBe(true);
            expect(entry.notes ?? '').toMatch(/pending official model ID confirmation/i);
        }
    );

    it.each(PROVIDER_REGISTRY.map(entry => [entry.providerId, entry] as const))(
        '%s: real verification is never claimed without status "implemented" backing it',
        (_providerId, entry) => {
            // realVerifiedModels is meant to be the strongest claim this registry can make. It
            // should never be non-empty for an entry still sitting at 'planned'/'blocked' —
            // that would be exactly the overclaiming this registry's three-field split (status /
            // offlineVerified / realVerifiedModels) exists to prevent.
            if (entry.realVerifiedModels.length > 0) {
                expect(entry.status).toBe('implemented');
            }
        }
    );

    it('newest-generation additions do not silently replace defaultModel or realVerifiedModels', () => {
        // Adding a newer-generation model id to a provider's models[] must never move that
        // provider's defaultModel or realVerifiedModels for a provider that already has a
        // real-key-verified entry.
        expect(findEntry('openai').defaultModel).toBe('gpt-4o-mini');
        expect(findEntry('openai').realVerifiedModels).toEqual(['gpt-4o-mini']);
        expect(findEntry('gemini').defaultModel).toBe('gemini-2.5-flash');
        expect(findEntry('gemini').realVerifiedModels).toEqual(['gemini-2.5-flash']);
    });
});

describe('resolveModelsToRun', () => {
    const entry = findEntry('openai');

    it('returns every configured model when no override value is given', () => {
        expect(resolveModelsToRun(entry, undefined)).toEqual(entry.models);
    });

    it('narrows to exactly the override model when one is given, even if not in models', () => {
        expect(resolveModelsToRun(entry, 'gpt-5-mini')).toEqual(['gpt-5-mini']);
    });

    it('treats an empty-string override as "no override" (falsy)', () => {
        expect(resolveModelsToRun(entry, '')).toEqual(entry.models);
    });
});
