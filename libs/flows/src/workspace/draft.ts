import {
    draftFor as draftForGraph,
    draftHasUnsavedWork as hasUnsavedWork,
    baselineForRecovery as recoveryBaseline,
} from '@flows/engine';

import { workspaceContext } from './context';
import { useFlowsStore } from '../stores/useFlowsStore';

import type { FlowDraft, FlowSnapshot, GraphLike } from '@flows/engine';

export type { FlowDraft } from '@flows/engine';

/**
 * The store-bound face of the engine's draft rules — see `@flows/engine`
 * (`persistence/draft.ts`) for what a draft is and when it is worth keeping.
 */

/** The draft this graph deserves, or null to say the stored one should go. */
export const draftFor = (graph: GraphLike): FlowDraft | null => draftForGraph(graph, workspaceContext());

/** Whether a stored draft holds work this flow does not already have. */
export const draftHasUnsavedWork = (draft: FlowDraft | null, flowId: string | null): draft is FlowDraft =>
    hasUnsavedWork(draft, flowId, useFlowsStore.getState().baseline);

/** The baseline to adopt when a draft is restored. */
export const baselineForRecovery = (draft: FlowDraft): FlowSnapshot | null =>
    recoveryBaseline(draft, useFlowsStore.getState().baseline);
