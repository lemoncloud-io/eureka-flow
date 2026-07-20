import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from 'sonner';

import { useFlowsStore } from '@flows/flows';

/**
 * Says so when the network comes back and a save is still owed.
 *
 * The failed save left the working copy alone and put the retry in the header, so nothing
 * is lost meanwhile — but the error sits there quietly, and someone who went offline
 * mid-edit has no reason to look at it again.
 *
 * Only a notice: retrying by itself would fight whatever the user is doing now, and the
 * retry button already works.
 */
export const useReconnectNotice = (): void => {
    const { t } = useTranslation(['flows']);

    useEffect(() => {
        const onOnline = () => {
            if (useFlowsStore.getState().saveStatus !== 'error') return;
            toast.info(t('flowEditor.backOnlineRetrySave', 'Back online. Save again to send your changes.'));
        };
        window.addEventListener('online', onOnline);
        return () => window.removeEventListener('online', onOnline);
    }, [t]);
};
