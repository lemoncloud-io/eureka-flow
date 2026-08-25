import { buildModelManifest } from '../llm/modelManifest';

import type { AgentRegistration } from './roster';

/**
 * Declarative per-agent model config: stamp a model id onto matching registrations, and fail fast on
 * an unknown id. Deployment supplies a `Record<agentType, modelId>` (from `AGENT_MODEL_*` env / server
 * config); every id is checked against the static model manifest so a bad value surfaces at startup,
 * not mid-turn. `DEFAULT_REGISTRATIONS` ships model-free — an empty map leaves every agent inheriting
 * the one gateway.
 */

/** The set of model ids the codebase knows about — the union of every provider's registered models. */
const knownModelIds = (): Set<string> => new Set(buildModelManifest().map(entry => entry.requestedModel));

/** Throw on any id not in the model manifest, naming the culprit. Use at a composition root to
 *  validate every env/config-sourced model id (deployment map, default, reasoning) at startup. */
export const assertKnownModels = (ids: readonly string[]): void => {
    const known = knownModelIds();
    const unknown = ids.filter(id => !known.has(id));
    if (unknown.length > 0) {
        throw new Error(
            `Unknown model id(s) not in the model manifest: ${unknown.join(', ')}. ` +
                `Known ids: ${[...known].sort().join(', ')}.`
        );
    }
};

/**
 * Return a copy of `registrations` with `model` stamped onto each whose `type` is a key in `models`.
 * Every value in `models` is validated (including keys with no matching registration — e.g. generic
 * block types the resolver reads directly), so the whole deployment map is checked here.
 */
export const withModels = (registrations: AgentRegistration[], models: Record<string, string>): AgentRegistration[] => {
    assertKnownModels(Object.values(models));
    return registrations.map(reg => (models[reg.type] ? { ...reg, model: models[reg.type] } : reg));
};
