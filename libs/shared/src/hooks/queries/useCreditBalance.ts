import { useQuery } from '@tanstack/react-query';

import { useWebCoreStore } from '@flows/web-core';

import { creditsKeys } from './creditsKeys';
import { getCreditBalance } from '../../api';

/**
 * Fetches the active wallet's credit balance. Gated on the active apiKey, so it
 * never fires for unauthenticated users. Short staleTime + window-focus refetch
 * means the balance refreshes when the user returns from charging credits.
 */
export const useCreditBalance = () => {
    const apiKey = useWebCoreStore(s => s.apiKey);

    return useQuery({
        queryKey: creditsKeys.balance(apiKey),
        queryFn: getCreditBalance,
        enabled: !!apiKey,
        staleTime: 30_000,
        refetchOnWindowFocus: true,
    });
};
