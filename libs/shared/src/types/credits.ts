/**
 * Credit-ledger types mirroring the backend wallet/transaction contract.
 * Read-only in flow — no payment/Stripe shapes live here.
 */

export type CreditStereo = 'use' | 'purchase' | 'gain' | 'cancel';

export type TransactionState = 'pending' | 'held' | 'succeeded' | 'released' | 'failed' | 'reversed' | '';

export interface WalletBalanceResponse {
    total: number;
    available?: number;
    held?: number;
    pending?: number;
    summary?: {
        bonusGainAmount?: number;
        bonusGainCount?: number;
        purchaseGainAmount?: number;
        purchaseGainCount?: number;
    };
    expiring?: {
        within7Days?: number;
        within30Days?: number;
    };
}

export interface TransactionView {
    id: string;
    createdAt?: number;
    updatedAt?: number;
    stereo: CreditStereo;
    state: TransactionState;
    walletId?: string;
    reason?: string;
    name?: string;
    amount?: number;
    creditChange?: number;
    availableAfter?: number;
    heldAfter?: number;
}

export interface ListTransactionsResponse {
    total: number;
    limit: number;
    page: number;
    list: TransactionView[];
}

export interface CreditTransactionsParams {
    stereo?: CreditStereo;
    from?: number;
    to?: number;
    limit?: number;
    page?: number;
}
