/**
 * Read per-agent model config from the environment for a Node composition root (the terminal). The
 * scheme is discrete `AGENT_MODEL_*` vars — see docs/browser-agent/design/per-agent-model-selection.md §5:
 *
 *   AGENT_MODEL_REASONING   → orchestrator + builder (the builder inherits, so setting the
 *                             orchestrator's model covers both); overridden by `--model`.
 *   AGENT_MODEL_DEFAULT     → the fallback for any agent without a specific model.
 *   AGENT_MODEL_<TYPE>      → a specific agentType; `<TYPE>` is upper-snake, mapped back to the
 *                             hyphenated agentType (AGENT_MODEL_SINGLE_OUTPUT_GENERATOR →
 *                             'single-output-generator').
 *
 * Reads `process.env` only when called, so it is safe to import anywhere; the browser never invokes it.
 */

export interface AgentModelConfig {
    /** agentType → model id, for the resolver + `withModels`. Excludes the reserved REASONING/DEFAULT keys. */
    deploymentModels: Record<string, string>;
    /** AGENT_MODEL_DEFAULT — fallback for any unconfigured agent. */
    defaultModel?: string;
    /** AGENT_MODEL_REASONING — the orchestrator's (and, by inheritance, the builder's) model. */
    reasoningModel?: string;
}

const PREFIX = 'AGENT_MODEL_';

export const resolveAgentModelConfig = (env: NodeJS.ProcessEnv = process.env): AgentModelConfig => {
    const deploymentModels: Record<string, string> = {};
    let defaultModel: string | undefined;
    let reasoningModel: string | undefined;

    for (const [key, value] of Object.entries(env)) {
        if (!key.startsWith(PREFIX) || !value) {
            continue;
        }
        const suffix = key.slice(PREFIX.length);
        if (suffix === 'REASONING') {
            reasoningModel = value;
        } else if (suffix === 'DEFAULT') {
            defaultModel = value;
        } else {
            deploymentModels[suffix.toLowerCase().replace(/_/g, '-')] = value;
        }
    }

    return { deploymentModels, defaultModel, reasoningModel };
};
