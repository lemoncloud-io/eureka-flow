import { diffSnapshots } from './diff';
import { emptySnapshot, toSnapshot } from './snapshot';

import type { WorkspaceContext } from './baseline';
import type { FlowSnapshot, GraphLike } from './snapshot';

/**
 * A working copy kept where a refresh cannot reach it.
 *
 * Auto-save is off unless the user turns it on, so without this a flow reaches the server
 * only when someone presses save — and everything between the last press and a refresh is
 * gone.
 */
export interface FlowDraft {
    /** Null while the flow has never been saved and has no server id to claim yet. */
    flowId: string | null;
    working: FlowSnapshot;
    /**
     * What the server last confirmed. Redundant while online — the load already set one —
     * but it is the only baseline that exists if the next boot cannot reach the server.
     */
    baseline: FlowSnapshot | null;
}

/**
 * The draft this graph deserves, or null to say the stored one should go.
 *
 * Null means clean, and a clean draft is worse than none: it would match the server, and
 * the next boot would offer to recover changes that are already saved. Note the diff, not
 * a store subscription, is what decides — a run rewrites node status and port data, and
 * none of that is work anyone needs kept.
 */
export const draftFor = (graph: GraphLike, ctx: WorkspaceContext): FlowDraft | null => {
    const working = toSnapshot(graph, ctx.blockRegistry);
    if (diffSnapshots(working, ctx.baseline ?? emptySnapshot()).isEmpty) return null;

    return { flowId: ctx.currentFlowId, working, baseline: ctx.baseline };
};

/**
 * Whether a stored draft holds work this flow does not already have.
 *
 * The draft belongs to whichever flow was open when it was written, so a draft for another
 * flow — or for a never-saved one when a real flow is open — is not this flow's business.
 */
export const draftHasUnsavedWork = (
    draft: FlowDraft | null,
    flowId: string | null,
    baseline: FlowSnapshot | null
): draft is FlowDraft => {
    if (!draft || draft.flowId !== flowId) return false;

    // No baseline means the server was never reached this boot, so the draft is all there
    // is to go on and anything in it counts as unsaved.
    if (!baseline) return true;
    return !diffSnapshots(draft.working, baseline).isEmpty;
};

/**
 * The baseline to adopt when a draft is restored.
 *
 * Online, the load already took a fresh baseline off the server, and that one wins: the
 * draft's copy is as old as the draft, so restoring it would hide anything another session
 * changed in the meantime and call the flow clean where it is not.
 *
 * Offline there is no fresh baseline, and the draft's is the only record of what the
 * server had. Without it every node reads as newly added, and the first save back online
 * would be measured against nothing.
 */
export const baselineForRecovery = (draft: FlowDraft, baseline: FlowSnapshot | null): FlowSnapshot | null =>
    baseline ?? draft.baseline;
