import { diffSnapshots, hasStructuralChange } from './diff';
import { emptySnapshot, toSnapshot } from './snapshot';
import { useFlowsStore } from '../stores/useFlowsStore';

import type { FlowDiff } from './diff';
import type { FlowSnapshot, GraphLike } from './snapshot';

/**
 * Take the baseline from a graph the canvas has already normalized.
 *
 * Feed this the canvas's own working copy, never a raw `loadFlow` response, and only
 * once blocks have loaded. The canvas fills in `config` and `position` and drops
 * duplicate edges on the way in, and `toSnapshot` resolves each node's type through the
 * block registry. A baseline taken from the raw response, or while the registry is still
 * empty, disagrees with the working copy on fields nobody touched — so a flow reads
 * dirty the moment it loads, auto-save fires on every load, and every "skip this while
 * dirty" guard misfires for the rest of the session.
 */
export const captureBaseline = (graph: GraphLike): void => {
    const { blockRegistry, setBaseline } = useFlowsStore.getState();
    setBaseline(toSnapshot(graph, blockRegistry));
};

/**
 * Adopt a save body that has just come back successful as the new baseline.
 *
 * The snapshot to pass is the one that was *sent*, never the working copy as it stands
 * when the response lands: a save is asynchronous, and edits made while it was in flight
 * are unsaved. Marking those as baseline would make them vanish from the next diff, and
 * the user would lose whatever they typed during the round trip.
 *
 * One case declines the new baseline: a non-owner editor's structural change. The server
 * stores such an editor's config overlay and silently drops their added and removed nodes
 * and edges, so a 200 does not mean the graph was stored. Adopting the snapshot would
 * read clean while the work exists only in this tab. Leaving the baseline where it is
 * reads dirty instead — which overstates what is left to save, but never loses it.
 */
export const rebaseline = (sent: FlowSnapshot): void => {
    const { baseline, isEditable, hasOwned, setBaseline } = useFlowsStore.getState();
    const isNonOwnerEditor = isEditable && !hasOwned;
    const droppedByServer = isNonOwnerEditor && hasStructuralChange(diffSnapshots(sent, baseline ?? emptySnapshot()));
    if (droppedByServer) return;
    setBaseline(sent);
};

/** Diff a graph against the baseline outside of render — for timers and event handlers. */
export const diffAgainstBaseline = (graph: GraphLike): FlowDiff => {
    const { blockRegistry, baseline } = useFlowsStore.getState();
    return diffSnapshots(toSnapshot(graph, blockRegistry), baseline ?? emptySnapshot());
};
