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
     *  orchestrator and each spawned specialist with distinct fakes. */
    gatewayFor?: (agentType: string) => LlmGateway;
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
    catalog,
    storage,
    tracer,
    userPermissions,
    gatewayFor,
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
                ...(gatewayFor ? { gatewayFor } : {}),
            }),
        [gateway, binding, flowId, catalog, userPermissions, tracer, gatewayFor]
    );
    return useAgentSession({ flowId, storage, tracer, createAgent });
};
