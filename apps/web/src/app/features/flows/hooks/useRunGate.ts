import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from 'sonner';

import { runRequirement, useCanvasStore, useFlows, useFlowsStore } from '@flows/flows';

/**
 * Clears the canvas for running, saving it first if the server has not seen it yet.
 *
 * Returns the flow's id, or null when the run must not go ahead — the save failed, or
 * saving could not have helped (a non-owner editor's structural change). Callers stop on
 * null rather than firing a run the server would reject.
 *
 * The id comes back because this is what mints it: a flow with no id gets one from the
 * save that happens here, and the store write behind it has not re-rendered anyone by the
 * time this returns. Callers reading `currentFlowId` themselves would each get the stale
 * one, which on a brand-new flow is null.
 *
 * Only user-initiated runs come through here. A run continuing on a socket READY message
 * must not, both because a prompt mid-run is absurd and because the server sending that
 * message is proof it already knows the node.
 */
export const useRunGate = () => {
    const { t } = useTranslation(['flows']);
    const { saveCurrentFlow } = useFlows();

    return useCallback(async (): Promise<string | null> => {
        const { nodes, connections } = useCanvasStore.getState();
        const graph = { nodes, connections };

        const requirement = runRequirement(graph);
        if (requirement === 'ready') return useFlowsStore.getState().currentFlowId;

        if (requirement === 'editor-structure') {
            toast.error(
                t(
                    'flowEditor.runNeedsOwnerForStructure',
                    'Added and deleted steps are not saved with editor access, so this flow cannot run. Ask the owner to make the change.'
                )
            );
            return null;
        }

        // The user pressed Run — that is the intent. Save silently, then run; no confirm.
        const result = await saveCurrentFlow(graph);
        if (!result.success) {
            toast.error(t('flowEditor.failedToSaveWorkflow'));
            return null;
        }
        return result.id;
    }, [saveCurrentFlow, t]);
};
