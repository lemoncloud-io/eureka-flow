import {
    diffAgainstBaseline as diffGraphAgainstBaseline,
    rebaseline as rebaselineFrom,
    captureBaseline as snapshotBaseline,
    willDropStructure as structureWouldDrop,
} from '@flows/engine';

import { workspaceContext } from './context';
import { useFlowsStore } from '../stores/useFlowsStore';

import type { FlowDiff, FlowSnapshot, GraphLike } from '@flows/engine';

/**
 * The store-bound face of the engine's baseline rules — see `@flows/engine`
 * (`persistence/baseline.ts`) for what each rule is and why it holds. Signatures are
 * unchanged from before the engine existed, so call sites read the same.
 */

/** Take the baseline from a graph the canvas has already normalized, and store it. */
export const captureBaseline = (graph: GraphLike): void => {
    const { blockRegistry, setBaseline } = useFlowsStore.getState();
    setBaseline(snapshotBaseline(graph, blockRegistry));
};

/** Whether saving this diff would store the config and silently discard the structure. */
export const willDropStructure = (diff: FlowDiff): boolean => structureWouldDrop(diff, useFlowsStore.getState());

/**
 * Adopt a save body that has just come back successful as the new baseline, and report
 * whether the server dropped its structure — the only signal that a 200 did not mean what
 * it said. A dropped save declines the new baseline, so the flow keeps reading dirty.
 */
export const rebaseline = (sent: FlowSnapshot): boolean => {
    const { dropped, baseline } = rebaselineFrom(sent, workspaceContext());
    if (baseline) useFlowsStore.getState().setBaseline(baseline);
    return dropped;
};

/** Diff a graph against the baseline outside of render — for timers and event handlers. */
export const diffAgainstBaseline = (graph: GraphLike): FlowDiff => diffGraphAgainstBaseline(graph, workspaceContext());
