import type { AgentRoster } from './roster';
import type { LlmGateway } from '../llm/llmGateway';

/**
 * Per-agent-type model selection. The seam the sub-agent runner already exposes —
 * `gatewayFor(agentType)` (`subAgentRunner.ts`) — resolved from a declared/configured model per
 * type instead of one shared gateway. INHERIT semantics: an agent that resolves to no model runs on
 * `defaultGateway` (the orchestrator's own gateway/model), so the builder is tied to the
 * orchestrator for free by leaving its model unset. Composed at the composition root and passed to
 * the orchestrator as `gatewayFor`; the orchestrator itself needs no change.
 *
 * See docs/browser-agent/design/per-agent-model-selection.md.
 */

/** Build (or reuse) a gateway bound to one model id. Environment-specific, so it is injected. */
export type GatewayFactory = (modelId: string) => LlmGateway;

/** Resolve an agentType to its model id, or `undefined` to inherit the default gateway. */
export type ModelForType = (agentType: string) => string | undefined;

/**
 * The model-id resolver for an agentType, precedence high→low:
 * 1. the registration's declared `model` (stamped by {@link withModels}) — covers named specialists;
 * 2. `deploymentModels[agentType]` — covers generic block types, which have no registration;
 * 3. for a reasoning-tier type (`inheritTypes`, e.g. the builder) — `undefined`, so it INHERITS the
 *    orchestrator's gateway and is never dragged down to the worker `defaultModel`;
 * 4. otherwise `defaultModel` (the deployment default for worker agents).
 *
 * The `inheritTypes` exemption is load-bearing: without it a concrete `defaultModel` would resolve
 * the builder to the cheap default (never `undefined`), so the inherit branch would be dead and the
 * builder would silently stop tracking the orchestrator's reasoning model.
 */
export const agentModelResolver =
    (
        roster: AgentRoster,
        deploymentModels: Record<string, string> = {},
        defaultModel?: string,
        inheritTypes: readonly string[] = []
    ): ModelForType =>
    (agentType: string): string | undefined => {
        const declared = roster.get(agentType)?.model ?? deploymentModels[agentType];
        if (declared) {
            return declared;
        }
        return inheritTypes.includes(agentType) ? undefined : defaultModel;
    };

export interface ModelGatewayForDeps {
    /** agentType → model id (undefined ⇒ inherit). Typically {@link agentModelResolver}. */
    modelForType: ModelForType;
    /** Inherit target for any agent that resolves to no model — the orchestrator's own gateway. */
    defaultGateway: LlmGateway;
    /** Build a gateway for a model id; omit ⇒ every agent inherits `defaultGateway` (today's behavior). */
    gatewayFactory?: GatewayFactory;
}

/**
 * The `gatewayFor(agentType)` the orchestrator/runner consume: each type's gateway by its resolved
 * model, memoized per model id (one gateway — and, for provider-native gateways, one HTTP client —
 * per distinct model per run). No `gatewayFactory` ⇒ pure inherit (no behavior change).
 */
export const createModelGatewayFor = ({
    modelForType,
    defaultGateway,
    gatewayFactory,
}: ModelGatewayForDeps): ((agentType: string) => LlmGateway) => {
    const byModel = new Map<string, LlmGateway>();
    return (agentType: string): LlmGateway => {
        const model = gatewayFactory ? modelForType(agentType) : undefined;
        if (!model) {
            return defaultGateway;
        }
        let gateway = byModel.get(model);
        if (!gateway) {
            gateway = gatewayFactory!(model);
            byModel.set(model, gateway);
        }
        return gateway;
    };
};
