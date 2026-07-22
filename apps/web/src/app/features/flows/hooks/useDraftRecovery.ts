import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from 'sonner';

import { baselineForRecovery, clearDraft, draftHasUnsavedWork, readDraft, useFlowsStore } from '@flows/flows';

import type { FlowSnapshot } from '@flows/flows';

/**
 * Brings back work that never reached the server, once a flow has finished loading.
 *
 * Call this after the canvas holds the server's copy and blocks have loaded — the draft
 * is compared against the baseline taken from that load, and before it exists every flow
 * looks like it has unsaved work.
 *
 * The draft is restored silently rather than behind a prompt: returning to your own unsaved
 * edits is what a user expects, not a question asked on every reload. A short-lived Undo puts
 * the server's version back for the rare "I wanted the clean copy" — offered only when there
 * is a server version to return to (online; offline there is nothing to undo to).
 *
 * `restore` receives the graph to put on the canvas; the caller owns the canvas, so it does
 * the loading and this decides what to load.
 */
export const useDraftRecovery = () => {
    const { t } = useTranslation(['flows']);

    return useCallback(
        async (restore: (working: FlowSnapshot) => void): Promise<void> => {
            const draft = await readDraft();
            const { currentFlowId } = useFlowsStore.getState();
            if (!draftHasUnsavedWork(draft, currentFlowId)) return;

            // The fresh load baseline is the server's version; hold it so Undo can put it back.
            const serverSnapshot = useFlowsStore.getState().baseline;

            // Read the recovery baseline before restoring, same rule as before: online the fresh
            // load baseline wins over the draft's older copy; offline the draft's is all there is.
            const recoveredBaseline = baselineForRecovery(draft);
            restore(draft.working);
            useFlowsStore.getState().setBaseline(recoveredBaseline);

            const undoToServer = () => {
                if (!serverSnapshot) return;
                restore(serverSnapshot);
                useFlowsStore.getState().setBaseline(serverSnapshot);
                void clearDraft();
                toast.info(t('flowEditor.draftDiscarded', 'Discarded unsaved changes.'));
            };

            toast.success(t('flowEditor.draftRecovered', 'Restored your unsaved changes.'), {
                id: 'draft-recovery',
                duration: 8000,
                action: serverSnapshot
                    ? { label: t('flowEditor.draftUndo', 'Undo'), onClick: undoToServer }
                    : undefined,
            });
        },
        [t]
    );
};
