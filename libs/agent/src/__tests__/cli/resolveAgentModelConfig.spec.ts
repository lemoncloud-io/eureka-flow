import { describe, expect, it } from 'vitest';

import { resolveAgentModelConfig } from '../../cli/resolveAgentModelConfig';

describe('resolveAgentModelConfig — AGENT_MODEL_* env scheme', () => {
    it('pulls REASONING and DEFAULT into their own fields, not deploymentModels', () => {
        const cfg = resolveAgentModelConfig({
            AGENT_MODEL_REASONING: 'gemini-2.5-pro',
            AGENT_MODEL_DEFAULT: 'gemini-2.5-flash',
        });
        expect(cfg.reasoningModel).toBe('gemini-2.5-pro');
        expect(cfg.defaultModel).toBe('gemini-2.5-flash');
        expect(cfg.deploymentModels).toEqual({});
    });

    it('maps AGENT_MODEL_<TYPE> to a hyphenated agentType', () => {
        const cfg = resolveAgentModelConfig({
            AGENT_MODEL_SINGLE_OUTPUT_GENERATOR: 'gemini-2.5-flash',
            AGENT_MODEL_BUFFER: 'gemini-2.5-flash-lite',
        });
        expect(cfg.deploymentModels).toEqual({
            'single-output-generator': 'gemini-2.5-flash',
            buffer: 'gemini-2.5-flash-lite',
        });
    });

    it('ignores unrelated and empty vars', () => {
        const cfg = resolveAgentModelConfig({
            GEMINI_API_KEY: 'secret',
            AGENT_MODEL_DEFAULT: '',
            PATH: '/usr/bin',
        });
        expect(cfg).toEqual({ deploymentModels: {}, defaultModel: undefined, reasoningModel: undefined });
    });

    it('returns all-empty for an env with no AGENT_MODEL_* vars', () => {
        expect(resolveAgentModelConfig({})).toEqual({
            deploymentModels: {},
            defaultModel: undefined,
            reasoningModel: undefined,
        });
    });
});
