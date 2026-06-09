import { useInfiniteQuery } from '@tanstack/react-query';

import { useWebCoreStore } from '@flows/web-core';

import { creditsKeys } from './creditsKeys';
import { getCreditTransactions } from '../../api';

import type { CreditFilter, ListTransactionsResponse } from '../../types';

const PAGE_SIZE = 24;

const getNextPageParam = (lastPage: ListTransactionsResponse) => {
    const limit = lastPage.limit ?? PAGE_SIZE;
    const page = lastPage.page ?? 0;
    const total = lastPage.total ?? 0;
    const fetched = (page + 1) * limit;
    return fetched < total ? page + 1 : undefined;
};

/**
 * Fetches credit transaction history with cursor-style pagination (infinite
 * query). Gated on the active apiKey. `filter` maps to the backend `stereo`
 * param ('all' → no filter) and is the only cache dimension; pages accumulate
 * inside `data.pages`.
 */
export const useCreditTransactions = (filter: CreditFilter = 'all') => {
    const apiKey = useWebCoreStore(s => s.apiKey);

    return useInfiniteQuery({
        queryKey: creditsKeys.transactions(apiKey, filter),
        queryFn: ({ pageParam }) =>
            getCreditTransactions({
                stereo: filter === 'all' ? undefined : filter,
                limit: PAGE_SIZE,
                page: pageParam,
            }),
        initialPageParam: 0,
        getNextPageParam,
        enabled: !!apiKey,
    });
};
