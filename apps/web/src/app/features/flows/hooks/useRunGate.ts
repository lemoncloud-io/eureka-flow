import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from 'sonner';

import { runRequirement, useFlows } from '@flows/flows';

import type { GraphLike } from '@flows/flows';

/**
 * Clears a graph for running, saving it first if the server has not seen it yet.
 *
 * Returns false when the run must not go ahead — either the user declined the save, the
 * save failed, or saving could not have helped. Callers stop on false rather than firing a
 * run the server would reject.
 *
 * Only user-initiated runs go through here. A run continuing through the canvas on a
 * socket READY message must not, both because a prompt mid-run is absurd and because the
 * server sending that message is proof it already knows the node.
 */
export const useRunGate = () => {
    const { t } = useTranslation(['flows']);
    const { saveCurrentFlow } = useFlows();

    return useCallback(
        async (graph: GraphLike): Promise<boolean> => {
            const requirement = runRequirement(graph);
            if (requirement === 'ready') return true;

            if (requirement === 'editor-structure') {
                toast.error(
                    t(
                        'flowEditor.runNeedsOwnerForStructure',
                        'Added and deleted steps are not saved with editor access, so this flow cannot run. Ask the owner to make the change.'
                    )
                );
                return false;
            }

            if (!window.confirm(t('flowEditor.confirmSaveBeforeRun', 'Save your changes and run?'))) return false;

            const result = await saveCurrentFlow(graph);
            if (!result.success) {
                toast.error(t('flowEditor.failedToSaveWorkflow'));
                return false;
            }
            return true;
        },
        [saveCurrentFlow, t]
    );
};
