import { api } from '@flows/web-core';

import type { CreditTransactionsParams, ListTransactionsResponse, WalletBalanceResponse } from '../types';

/**
 * Credit ledger read API. The web-core axios interceptor prepends `/_api_` and
 * injects `x-api-key` from the active key, so no identity is passed here — the
 * backend resolves the wallet from the key. flow stays payment-free (read only).
 */
export const getCreditBalance = async (): Promise<WalletBalanceResponse> => {
    const response = await api.get<WalletBalanceResponse>('/wallets/0/balance');
    return response.data;
};

export const getCreditTransactions = async (
    params: CreditTransactionsParams = {}
): Promise<ListTransactionsResponse> => {
    const response = await api.get<ListTransactionsResponse>('/transactions/0/list', { params });
    return response.data;
};
