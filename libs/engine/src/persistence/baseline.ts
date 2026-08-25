import { diffSnapshots, hasStructuralChange } from './diff';
import { emptySnapshot, toSnapshot } from './snapshot';

import type { FlowDiff } from './diff';
import type { FlowSnapshot, GraphLike } from './snapshot';
import type { BlockDefinitionWithFrontend } from '../types';

/**
 * Who is editing, as far as the save rules are concerned.
 *
 * Passed in rather than read from a store: these rules have to hold in a CLI and in a
 * worker, neither of which has a React store to reach for.
 */
export interface EditorGrant {
    isEditable: boolean;
    hasOwned: boolean;
}

/** Everything the workspace rules read about the flow currently open. */
export interface WorkspaceContext extends EditorGrant {
    blockRegistry: Record<string, BlockDefinitionWithFrontend>;
    baseline: FlowSnapshot | null;
    currentFlowId: string | null;
}

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
export const captureBaseline = (
    graph: GraphLike,
    blockRegistry: Record<string, BlockDefinitionWithFrontend>
): FlowSnapshot => toSnapshot(graph, blockRegistry);

/** Only a non-owner editor's writes go through the overlay the server drops structure from. */
const isNonOwnerEditor = (grant: EditorGrant): boolean => grant.isEditable && !grant.hasOwned;

/**
 * Whether saving this diff would store the config and silently discard the structure.
 *
 * True only for a non-owner editor: the server writes their edits as a session config
 * overlay, which has nowhere to put an added node or edge. The save still answers 200, so
 * this is the only warning the client gets — hence one predicate, read both by the save
 * that must not trust its own success and by the run that must not be attempted.
 */
export const willDropStructure = (diff: FlowDiff, grant: EditorGrant): boolean =>
    isNonOwnerEditor(grant) && hasStructuralChange(diff);

/** What a successful save leaves behind: the signal, and the baseline to adopt. */
export interface RebaselineResult {
    /**
     * Whether the structure was dropped, which is the only signal that a 200 did not mean
     * what it said.
     */
    dropped: boolean;
    /** The snapshot to adopt as the new baseline, or null to leave the baseline where it is. */
    baseline: FlowSnapshot | null;
}

/**
 * Adopt a save body that has just come back successful as the new baseline.
 *
 * The snapshot to pass is the one that was *sent*, never the working copy as it stands
 * when the response lands: a save is asynchronous, and edits made while it was in flight
 * are unsaved. Marking those as baseline would make them vanish from the next diff, and
 * the user would lose whatever they typed during the round trip.
 *
 * A save whose structure the server drops declines the new baseline: adopting it would
 * read clean while the work exists only in this tab. Leaving the baseline where it is
 * reads dirty instead — which overstates what is left to save, but never loses it.
 *
 * Ask here rather than afterwards: once the baseline moves, the difference it was
 * measured against is gone.
 */
export const rebaseline = (sent: FlowSnapshot, ctx: WorkspaceContext): RebaselineResult => {
    // Ask who is saving before diffing, not after. Only a non-owner editor can have their
    // structure dropped, so for everyone else the diff is built and thrown away — and
    // with an unsaved image in config that is megabytes of string per save.
    const dropped =
        isNonOwnerEditor(ctx) && willDropStructure(diffSnapshots(sent, ctx.baseline ?? emptySnapshot()), ctx);
    return { dropped, baseline: dropped ? null : sent };
};

/** Diff a graph against the baseline outside of render — for timers and event handlers. */
export const diffAgainstBaseline = (graph: GraphLike, ctx: WorkspaceContext): FlowDiff =>
    diffSnapshots(toSnapshot(graph, ctx.blockRegistry), ctx.baseline ?? emptySnapshot());
