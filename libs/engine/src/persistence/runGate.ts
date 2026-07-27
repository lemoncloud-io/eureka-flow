import { diffAgainstBaseline, willDropStructure } from './baseline';

import type { WorkspaceContext } from './baseline';
import type { GraphLike } from './snapshot';

/**
 * What has to happen before the server can run this graph.
 *
 * - `ready` — the server's copy already matches the canvas.
 * - `needs-save` — there is unsaved work the server cannot see. Save, then run.
 * - `editor-structure` — saving would not help; the run cannot succeed.
 */
export type RunRequirement = 'ready' | 'needs-save' | 'editor-structure';

/**
 * A run executes against the server's copy of the flow, not the canvas. Unsaved edits are
 * invisible to it, and a node added since the last save does not exist there at all — so
 * running that node asks the server for an ID it has never seen and gets a 404.
 *
 * The one case saving cannot rescue is a non-owner editor's structural change: the server
 * keeps their config overlay and drops the structure, so the save returns 200 and the run
 * still 404s. Saving first would only make the failure look handled.
 */
export const runRequirement = (graph: GraphLike, ctx: WorkspaceContext): RunRequirement => {
    const diff = diffAgainstBaseline(graph, ctx);
    if (diff.isEmpty) return 'ready';
    return willDropStructure(diff, ctx) ? 'editor-structure' : 'needs-save';
};
