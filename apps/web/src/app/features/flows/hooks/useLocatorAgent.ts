import { useCallback } from 'react';

import { createLocatorAgent } from '@flows/agent';

import { useAgentSession } from './useAgentSession';

import type { UseAgentSessionResult } from './useAgentSession';
import type {
    AgentEnvironmentSupportable,
    AgentGrant,
    CanvasBinding,
    LlmGateway,
    SessionStore,
    ToolExecutor,
} from '@flows/agent';

interface UseLocatorAgentArgs {
    binding: CanvasBinding;
    flowId: string;
    gateway: LlmGateway;
    /** The browser Agent Environment; session persistence and run tracing flow through it. */
    environment: AgentEnvironmentSupportable;
    /** Optional executor override (e.g. wrapped with tracing via withExecutorTracing). */
    executor?: ToolExecutor;
    /** Capabilities the agent may use; defaults to the locator's own grant when omitted. */
    grant?: AgentGrant;
}

/**
 * React binding for the locator {@link createLocatorAgent}: a thin wrapper over the generic
 * {@link useAgentSession} (which owns the per-flow session store and lifecycle), supplying only
 * the locator factory.
 */
export const useLocatorAgent = ({
    binding,
    flowId,
    gateway,
    environment,
    executor,
    grant,
}: UseLocatorAgentArgs): UseAgentSessionResult => {
    const createAgent = useCallback(
        (storage: SessionStore) =>
            createLocatorAgent({
                gateway,
                binding,
                storage,
                flowId,
                ...(executor ? { executor } : {}),
                ...(grant ? { config: { grant } } : {}),
            }),
        [gateway, binding, flowId, executor, grant]
    );
    return useAgentSession({ flowId, environment, createAgent });
};
