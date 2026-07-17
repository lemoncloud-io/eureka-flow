import { useMemo } from 'react';

import { diffSnapshots } from './diff';
import { emptySnapshot, toSnapshot } from './snapshot';
import { useCanvasConnections, useCanvasNodes } from '../stores/useCanvasStore';
import { useFlowsStore } from '../stores/useFlowsStore';

import type { FlowDiff } from './diff';

/**
 * What the canvas holds that the server has not confirmed.
 *
 * Shared by both editors, so dirty means the same thing on desktop and mobile.
 * A flow with no baseline yet reads as entirely new.
 */
export const useFlowDiff = (): FlowDiff => {
    const nodes = useCanvasNodes();
    const connections = useCanvasConnections();
    const blockRegistry = useFlowsStore(state => state.blockRegistry);
    const baseline = useFlowsStore(state => state.baseline);

    return useMemo(
        () => diffSnapshots(toSnapshot({ nodes, connections }, blockRegistry), baseline ?? emptySnapshot()),
        [nodes, connections, blockRegistry, baseline]
    );
};

/** Whether there is anything worth saving. */
export const useIsDirty = (): boolean => !useFlowDiff().isEmpty;
