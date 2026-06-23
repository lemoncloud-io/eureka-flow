import { useQuery } from '@tanstack/react-query';

import { useWebCoreStore } from '@flows/web-core';

import { creditsKeys } from './creditsKeys';
import { getCreditBalance } from '../../api';

/**
 * Fetches the active wallet's credit balance. Gated on the active apiKey, so it
 * never fires for unauthenticated users. Retries up to 3 times with backoff, then
 * stops — a failing endpoint (e.g. 503) must not be hammered. Window-focus refetch
 * is disabled for the same reason; the balance is refreshed when the credit
 * popover is opened instead (see BillingChip).
 */
export const useCreditBalance = () => {
    const apiKey = useWebCoreStore(s => s.apiKey);

    return useQuery({
        queryKey: creditsKeys.balance(apiKey),
        queryFn: getCreditBalance,
        enabled: !!apiKey,
        staleTime: 30_000,
        retry: 3,
        retryDelay: attempt => Math.min(1000 * 2 ** attempt, 30_000),
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });
};
