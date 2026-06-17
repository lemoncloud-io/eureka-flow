import type { CreditFilter } from '../../types';

/**
 * Query keys for the credit ledger. `['credits']` is a fresh namespace that does
 * not collide with flowsKeys/systemKeys. The active apiKey is folded into the key
 * so each workspace's wallet caches independently (ADR-9: N workspaces = N wallets);
 * switching keys never serves a stale balance. Transactions cache per filter — page
 * is handled inside the infinite query, so it is not a cache dimension here.
 */
export const creditsKeys = {
    all: ['credits'] as const,
    balance: (apiKey: string | null) => [...creditsKeys.all, 'balance', apiKey] as const,
    transactions: (apiKey: string | null, filter: CreditFilter = 'all') =>
        [...creditsKeys.all, 'transactions', apiKey, filter] as const,
};
