import { useQuery } from '@tanstack/react-query';

import { getNextAction, processApi } from '@flows/flows';
import { getStoredApiKey } from '@flows/web-core';

import type { Item, NextAction } from '@flows/flows';

interface LandingContext {
    isAuthenticated: boolean;
    urgentAction: { item: Item; action: NextAction } | null;
    isLoading: boolean;
}

export const useLandingContext = (): LandingContext => {
    const apiKey = getStoredApiKey();

    const { data, isLoading } = useQuery({
        queryKey: ['landing', 'urgentAction'],
        queryFn: () => processApi.items.list(),
        enabled: !!apiKey,
        staleTime: 60_000,
    });

    const items = data?.data ?? [];

    // getNextAction returns null for fully-done items, so pre-filter is unnecessary
    let urgentAction: { item: Item; action: NextAction } | null = null;
    for (const item of items) {
        const action = getNextAction(item);
        if (action) {
            urgentAction = { item, action };
            break;
        }
    }

    return {
        isAuthenticated: !!apiKey,
        urgentAction,
        isLoading: !!apiKey && isLoading,
    };
};
