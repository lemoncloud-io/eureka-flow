import { useCallback } from 'react';

import { createLocatorAgent } from '@flows/agent';

import { useAgentSession } from './useAgentSession';

import type { UseAgentSessionResult } from './useAgentSession';
import type { CanvasBinding, LlmGateway, Storage } from '@flows/agent';

interface UseLocatorAgentArgs {
    binding: CanvasBinding;
    flowId: string;
    gateway: LlmGateway;
}

/**
 * React binding for the locator {@link createLocatorAgent}. A thin wrapper over the generic
 * {@link useAgentSession}, which owns everything agent-agnostic — the per-flow, localStorage-backed
 * session store (survives reload — §6.4) and the StrictMode-safe, abort-on-flow-switch lifecycle.
 * This hook supplies only the locator factory (its binding is the canvas seam); a future agent
 * reuses `useAgentSession` the same way with its own factory, so none of that machinery is copied.
 */
export const useLocatorAgent = ({ binding, flowId, gateway }: UseLocatorAgentArgs): UseAgentSessionResult => {
    const createAgent = useCallback(
        (storage: Storage) => createLocatorAgent({ gateway, binding, storage, flowId }),
        [gateway, binding, flowId]
    );
    return useAgentSession({ flowId, createAgent });
};
