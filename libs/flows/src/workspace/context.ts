import { useFlowsStore } from '../stores/useFlowsStore';

import type { WorkspaceContext } from '@flows/engine';

/**
 * The store, read as the engine wants it.
 *
 * The engine's workspace rules take their state as an argument so they can run without a
 * React store — a CLI or a worker has no `useFlowsStore` to reach for. This is the one
 * place in the web app that closes that gap, so the wrappers below stay thin enough to
 * read as forwarding.
 */
export const workspaceContext = (): WorkspaceContext => {
    const { blockRegistry, baseline, isEditable, hasOwned, currentFlowId } = useFlowsStore.getState();
    return { blockRegistry, baseline, isEditable, hasOwned, currentFlowId };
};
