import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from 'sonner';

import { baselineForRecovery, clearDraft, draftHasUnsavedWork, readDraft, useFlowsStore } from '@flows/flows';

import type { FlowSnapshot } from '@flows/flows';

/**
 * Offers back work that never reached the server, once a flow has finished loading.
 *
 * Call this after the canvas holds the server's copy and blocks have loaded — the draft
 * is compared against the baseline taken from that load, and before it exists every flow
 * looks like it has unsaved work.
 *
 * `restore` receives the graph to put on the canvas; the caller owns the canvas, so it
 * does the loading and this decides whether there is anything to load.
 */
export const useDraftRecovery = () => {
    const { t } = useTranslation(['flows']);

    return useCallback(
        async (restore: (working: FlowSnapshot) => void): Promise<void> => {
            const draft = await readDraft();
            const { currentFlowId } = useFlowsStore.getState();
            if (!draftHasUnsavedWork(draft, currentFlowId)) return;

            if (
                !window.confirm(
                    t('flowEditor.confirmRecoverDraft', 'This flow has changes that were never saved. Restore them?')
                )
            ) {
                await clearDraft();
                return;
            }

            // Read the baseline before the restore: online it is the fresh one the load
            // just took, and that has to win over the draft's older copy or another
            // session's changes would be hidden. Offline there is none, and the draft's is
            // the only record of what the server had.
            const baseline = baselineForRecovery(draft);
            restore(draft.working);
            useFlowsStore.getState().setBaseline(baseline);
            toast.success(t('flowEditor.draftRecovered', 'Restored your unsaved changes.'));
        },
        [t]
    );
};
