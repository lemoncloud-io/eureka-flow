/**
 * Per-agent model config for the browser composition root, read from Vite build env. Mirrors the CLI's
 * `AGENT_MODEL_*` scheme (`libs/agent` `resolveAgentModelConfig`) but reads `import.meta.env` with the
 * required `VITE_` prefix — non-prefixed vars are not exposed to the client bundle:
 *
 *   VITE_AGENT_MODEL_DEFAULT   → fallback for any worker agent without a specific model.
 *   VITE_AGENT_MODEL_<TYPE>    → a specific agentType; `<TYPE>` is upper-snake, mapped back to the
 *                                hyphenated agentType (VITE_AGENT_MODEL_SINGLE_OUTPUT_GENERATOR →
 *                                'single-output-generator').
 *
 * The reasoning tier (orchestrator + builder) runs the composer's picked model, not an env var, so
 * unlike the CLI there is no browser REASONING key — a `VITE_AGENT_MODEL_REASONING` is ignored.
 */

export interface BrowserAgentModelConfig {
    /** agentType → model id, for the resolver. Excludes the reserved DEFAULT/REASONING keys. */
    deploymentModels: Record<string, string>;
    /** VITE_AGENT_MODEL_DEFAULT — fallback for any unconfigured worker agent. */
    defaultModel?: string;
}

const PREFIX = 'VITE_AGENT_MODEL_';

export const resolveBrowserAgentModelConfig = (
    env: Record<string, unknown> = import.meta.env as unknown as Record<string, unknown>
): BrowserAgentModelConfig => {
    const deploymentModels: Record<string, string> = {};
    let defaultModel: string | undefined;

    for (const [key, value] of Object.entries(env)) {
        if (!key.startsWith(PREFIX) || typeof value !== 'string' || !value) {
            continue;
        }
        const suffix = key.slice(PREFIX.length);
        if (suffix === 'DEFAULT') {
            defaultModel = value;
        } else if (suffix === 'REASONING') {
            continue; // the composer's picked model is the reasoning tier — no env key in the browser
        } else {
            deploymentModels[suffix.toLowerCase().replace(/_/g, '-')] = value;
        }
    }

    return { deploymentModels, defaultModel };
};
