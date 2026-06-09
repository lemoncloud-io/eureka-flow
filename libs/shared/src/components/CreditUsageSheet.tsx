import { useTranslation } from 'react-i18next';

import { Badge, ScrollArea, Sheet, SheetContent, SheetHeader, SheetTitle, Skeleton, cn } from '@flows/ui-kit';

import { useCreditBalance, useCreditTransactions } from '../hooks';
import { formatCredits } from '../utils';

import type { CreditStereo, TransactionView, WalletBalanceResponse } from '../types';

interface CreditUsageSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

// Reuse ui-kit Badge variants (identical class sets) instead of a parallel map.
const STEREO_BADGE: Record<CreditStereo, 'default' | 'blue' | 'green' | 'destructive'> = {
    use: 'default',
    purchase: 'blue',
    gain: 'green',
    cancel: 'destructive',
};

const SummaryRow = ({ label, value }: { label: string; value: number }) => (
    <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums text-foreground">{formatCredits(value)}</span>
    </div>
);

const BalanceSummary = ({ data }: { data: WalletBalanceResponse }) => {
    const { t } = useTranslation('common');
    const within7 = data.expiring?.within7Days ?? 0;
    const within30 = data.expiring?.within30Days ?? 0;

    return (
        <div className="space-y-2 rounded-xl border border-border bg-card p-4">
            <SummaryRow label={t('credits.balance')} value={data.total} />
            {data.available != null && <SummaryRow label={t('credits.available')} value={data.available} />}
            {data.held != null && data.held > 0 && <SummaryRow label={t('credits.held')} value={data.held} />}
            {within7 > 0 && <SummaryRow label={t('credits.expireWithin', { days: 7 })} value={within7} />}
            {within30 > 0 && <SummaryRow label={t('credits.expireWithin', { days: 30 })} value={within30} />}
        </div>
    );
};

const TransactionRow = ({ tx }: { tx: TransactionView }) => {
    const { t } = useTranslation('common');
    const change = tx.creditChange ?? 0;
    const changeColor = change > 0 ? 'text-success' : change < 0 ? 'text-destructive' : 'text-muted-foreground';
    const sign = change > 0 ? '+' : '';
    const dateLabel = tx.createdAt ? new Date(tx.createdAt).toLocaleDateString() : '';

    return (
        <div className="flex items-center gap-3 py-2.5">
            <Badge variant={STEREO_BADGE[tx.stereo]} className="shrink-0">
                {t(`credits.stereo.${tx.stereo}`)}
            </Badge>
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">{tx.name || tx.reason || '-'}</p>
                {dateLabel && <p className="text-xs text-muted-foreground">{dateLabel}</p>}
            </div>
            <span className={cn('shrink-0 text-sm font-medium tabular-nums', changeColor)}>
                {sign}
                {formatCredits(change)}
            </span>
        </div>
    );
};

const TransactionList = () => {
    const { t } = useTranslation('common');
    const { data, isLoading, isError } = useCreditTransactions();

    if (isLoading) {
        return (
            <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full rounded-md" />
                ))}
            </div>
        );
    }

    if (isError) {
        return <p className="py-8 text-center text-sm text-muted-foreground">{t('credits.loadError')}</p>;
    }

    if (!data || data.list.length === 0) {
        return <p className="py-8 text-center text-sm text-muted-foreground">{t('credits.empty')}</p>;
    }

    return (
        <div className="divide-y divide-border">
            {data.list.map(tx => (
                <TransactionRow key={tx.id} tx={tx} />
            ))}
        </div>
    );
};

/**
 * Read-only credit usage Sheet: balance summary + transaction history. Opened
 * from CreditBalanceChip. No filter UI in v1 (first page only). No payment code.
 */
export const CreditUsageSheet = ({ open, onOpenChange }: CreditUsageSheetProps) => {
    const { t } = useTranslation('common');
    const { data: balance } = useCreditBalance();

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="flex flex-col gap-0 p-0">
                <SheetHeader>
                    <SheetTitle>{t('credits.usageTitle')}</SheetTitle>
                </SheetHeader>
                <div className="flex flex-1 flex-col gap-4 overflow-hidden p-6">
                    {balance && <BalanceSummary data={balance} />}
                    <ScrollArea className="flex-1">
                        <TransactionList />
                    </ScrollArea>
                </div>
            </SheetContent>
        </Sheet>
    );
};
