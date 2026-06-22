import { useTranslation } from 'react-i18next';

import { ChevronRight, Sparkles } from 'lucide-react';

import { Button, cn } from '@flows/ui-kit';

import { useBillingCharge } from '../hooks';
import { formatCredits } from '../utils';

import type { WalletBalanceResponse } from '../types';

interface CreditDetailsProps {
    balance: WalletBalanceResponse;
    onUsage: () => void;
    /** Owner-AI-key run mode: note that runs use the workspace AI key, no credits charged. */
    showOwnKeyNote?: boolean;
}

interface LinkRowProps {
    label: string;
    onClick: () => void;
}

const LinkRow = ({ label, onClick }: LinkRowProps) => (
    <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn('h-10 w-full justify-between px-2 text-sm font-normal')}
        onClick={onClick}
    >
        <span>{label}</span>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Button>
);

/**
 * Popover body for the credit chip: total-held summary, a purchase deep-link, and
 * links into usage / payment history. Charging never happens in flow — `charge`
 * and `openPayments` deep-link to billing (hidden when billing URL is unset).
 */
export const CreditDetails = ({ balance, onUsage, showOwnKeyNote = false }: CreditDetailsProps) => {
    const { t } = useTranslation('common');
    const { isEnabled, charge, openPayments } = useBillingCharge();

    return (
        <div className="space-y-3">
            <p className="text-sm font-semibold text-foreground">{t('credits.detailTitle')}</p>
            {showOwnKeyNote && (
                <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                    {t('runMode.notCharged')}
                </p>
            )}
            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2.5">
                <span className="text-sm text-muted-foreground">{t('credits.totalHeld')}</span>
                <span className="flex items-center gap-1.5 text-sm font-bold tabular-nums text-foreground">
                    <Sparkles className="h-4 w-4 fill-amber-400 text-amber-400" />
                    {formatCredits(balance.total)}
                </span>
            </div>
            {isEnabled && (
                <Button type="button" size="sm" className="w-full" onClick={charge}>
                    {t('credits.buy')}
                </Button>
            )}
            <div className="border-t border-border pt-1">
                <LinkRow label={t('credits.usageHistory')} onClick={onUsage} />
                {isEnabled && <LinkRow label={t('credits.paymentHistory')} onClick={openPayments} />}
            </div>
        </div>
    );
};
