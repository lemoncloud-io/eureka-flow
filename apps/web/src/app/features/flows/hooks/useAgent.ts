import { useCallback } from 'react';

import { createOrchestratorAgent } from '@flows/agent';

import { useAgentSession } from './useAgentSession';

import type { UseAgentSessionResult } from './useAgentSession';
import type {
    AgentEnvironmentSupportable,
    AgentGrant,
    CanvasBinding,
    CatalogLookup,
    LlmGateway,
    SessionStore,
} from '@flows/agent';

interface UseAgentArgs {
    binding: CanvasBinding;
    flowId: string;
    gateway: LlmGateway;
    /** The block catalog behind the read/config tools (build with `createBlockCatalogLookup`). */
    catalog: CatalogLookup;
    /** The browser Agent Environment; session persistence and run tracing flow through it. */
    environment: AgentEnvironmentSupportable;
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
    environment,
    userPermissions,
    gatewayFor,
}: UseAgentArgs): UseAgentSessionResult => {
    const createAgent = useCallback(
        (storage: SessionStore) =>
            createOrchestratorAgent({
                gateway,
                storage,
                flowId,
                binding,
                catalog,
                userPermissions,
                ...(gatewayFor ? { gatewayFor } : {}),
            }),
        [gateway, binding, flowId, catalog, userPermissions, gatewayFor]
    );
    return useAgentSession({ flowId, environment, createAgent });
};
