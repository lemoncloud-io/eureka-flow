import { useQuery } from '@tanstack/react-query';

import { useWebCoreStore } from '@flows/web-core';

import { creditsKeys } from './creditsKeys';
import { getCreditTransactions } from '../../api';

import type { CreditTransactionsParams } from '../../types';

const DEFAULT_PARAMS: CreditTransactionsParams = { limit: 24, page: 0 };

/**
 * Fetches credit transaction history (first page by default). Gated on the
 * active apiKey. v1 has no filter UI — callers may pass params for future use.
 */
export const useCreditTransactions = (params: CreditTransactionsParams = DEFAULT_PARAMS) => {
    const apiKey = useWebCoreStore(s => s.apiKey);

    return useQuery({
        queryKey: creditsKeys.transactions(apiKey, params),
        queryFn: () => getCreditTransactions(params),
        enabled: !!apiKey,
    });
};
