import { useCallback } from 'react';

import { createOrchestratorAgent } from '@flows/agent';

import { useAgentSession } from './useAgentSession';

import type { UseAgentSessionResult } from './useAgentSession';
import type {
    AgentGrant,
    AgentStorage,
    CanvasBinding,
    CatalogLookup,
    LlmGateway,
    SessionStore,
    Tracer,
} from '@flows/agent';

interface UseAgentArgs {
    binding: CanvasBinding;
    flowId: string;
    gateway: LlmGateway;
    /** The model `gateway` runs on — surfaced in the trace as `gen_ai.request.model` and inherited as
     *  the fallback model tag for spawned children. Rebuilding the agent with a new value is what a model
     *  switch is; the re-seed/tool-trace drop is driven by that rebuild (a new instance), not by this value. */
    model?: string;
    /** The block catalog behind the read/config tools (build with `createBlockCatalogLookup`). */
    catalog: CatalogLookup;
    /** Session persistence port (survives reload). */
    storage: AgentStorage;
    /** Tracer injected into the orchestrator + used for run-lifecycle events. */
    tracer: Tracer;
    /** The current user's permissions — the flow role projected via `toAgentGrant`. The executor gates
     *  every specialist tool against it (viewer ⇒ no edits — R2); each agent keeps its own fixed grant. */
    userPermissions: AgentGrant;
    /** Per-child gateway override; defaults to the one gateway. Lets the dev harness script the
     *  orchestrator and each spawned specialist with distinct fakes, and the deployment route each
     *  worker agent to its configured model. */
    gatewayFor?: (agentType: string) => LlmGateway;
    /** Resolved model per child agentType, for the trace `gen_ai.request.model` (paired with `gatewayFor`);
     *  omit ⇒ children are tagged with the orchestrator's model. */
    modelFor?: (agentType: string) => string | undefined;
}

/**
 * React binding for the **orchestrator** — the sole user-facing agent. It reads the canvas, discovers
 * the specialist roster, and delegates every edit to specialists that edit the live canvas directly.
 * A thin wrapper over the generic {@link useAgentSession} (which owns the per-flow session store and
 * lifecycle), supplying only the orchestrator turn factory.
 */
export const useAgent = ({
    binding,
    flowId,
    gateway,
    model,
    catalog,
    storage,
    tracer,
    userPermissions,
    gatewayFor,
    modelFor,
}: UseAgentArgs): UseAgentSessionResult => {
    const createAgent = useCallback(
        (sessionStore: SessionStore) =>
            createOrchestratorAgent({
                gateway,
                storage: sessionStore,
                flowId,
                binding,
                catalog,
                userPermissions,
                tracer,
                ...(model ? { model } : {}),
                ...(gatewayFor ? { gatewayFor } : {}),
                ...(modelFor ? { modelFor } : {}),
            }),
        [gateway, model, binding, flowId, catalog, userPermissions, tracer, gatewayFor, modelFor]
    );
    return useAgentSession({ flowId, storage, tracer, createAgent });
};
