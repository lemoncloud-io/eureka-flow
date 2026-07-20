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
 * The offer is a non-blocking toast, not a modal: boot does not wait on it, and a reload
 * with an unsaved draft no longer stops the page with a confirm. The draft is left in place
 * until the user acts, so ignoring the toast just offers it again on the next load — nothing
 * is lost, and Discard is the way to make it stop. A fixed id keeps a re-boot (StrictMode,
 * HMR) from stacking a second copy.
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

            toast(t('flowEditor.draftAvailable', 'This flow has unsaved changes from before.'), {
                id: 'draft-recovery',
                duration: Infinity,
                action: {
                    label: t('flowEditor.draftRestore', 'Restore'),
                    onClick: () => {
                        // Read the baseline at click time, same rule as before: online the
                        // fresh load baseline wins over the draft's older copy; offline the
                        // draft's is the only record of what the server had.
                        const baseline = baselineForRecovery(draft);
                        restore(draft.working);
                        useFlowsStore.getState().setBaseline(baseline);
                        toast.success(t('flowEditor.draftRecovered', 'Restored your unsaved changes.'));
                    },
                },
                cancel: {
                    label: t('flowEditor.draftDiscard', 'Discard'),
                    onClick: () => {
                        void clearDraft();
                        toast.info(t('flowEditor.draftDiscarded', 'Discarded unsaved changes.'));
                    },
                },
            });
        },
        [t]
    );
};
