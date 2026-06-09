import { useCallback, useEffect, useRef } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { creditsKeys } from './queries/creditsKeys';

/**
 * Returns a debounced callback that refetches the credit balance + ledger.
 * Call it on flow-run signals (node traces / outputs) so the balance updates
 * after a run consumes credits, while a burst of streamed messages collapses
 * into a single refetch once execution settles.
 */
export const useCreditsRefresh = (delayMs = 1500) => {
    const queryClient = useQueryClient();
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(
        () => () => {
            if (timer.current) clearTimeout(timer.current);
        },
        []
    );

    return useCallback(() => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: creditsKeys.all });
        }, delayMs);
    }, [queryClient, delayMs]);
};
