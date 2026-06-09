import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge, Button, ScrollArea, Sheet, SheetContent, SheetHeader, SheetTitle, Skeleton, cn } from '@flows/ui-kit';

import { CreditFilterTabs } from './CreditFilterTabs';
import { useCreditBalance, useCreditTransactions } from '../hooks';
import { formatCreditDateTime, formatCredits } from '../utils';

import type { CreditFilter, CreditStereo, TransactionView, WalletBalanceResponse } from '../types';

interface CreditUsageSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

// Badge palette aligned with billing-front meta.ts (KIND_BADGE).
const STEREO_BADGE: Record<CreditStereo, 'secondary' | 'blue' | 'orange' | 'destructive'> = {
    use: 'secondary',
    purchase: 'blue',
    gain: 'orange',
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
    const { t, i18n } = useTranslation('common');
    const change = tx.creditChange ?? 0;
    const changeColor = change > 0 ? 'text-success' : change < 0 ? 'text-destructive' : 'text-muted-foreground';
    const sign = change > 0 ? '+' : '';

    // Known backend reasons resolve via i18n; unknown reasons fall back to the raw string.
    const reasonKey = tx.reason ? `credits.reason.${tx.reason}` : '';
    const friendlyReason = reasonKey && i18n.exists(reasonKey) ? t(reasonKey) : tx.reason;
    const title = tx.name || friendlyReason || '-';

    const dateLabel = formatCreditDateTime(tx.createdAt ?? 0);
    const model = tx.lines$?.[0]?.model;
    const meta = [dateLabel, model].filter(Boolean).join(' · ');

    return (
        <div className="flex items-start justify-between gap-3 py-3">
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-foreground">{title}</span>
                    <Badge variant={STEREO_BADGE[tx.stereo]} className="shrink-0">
                        {t(`credits.stereo.${tx.stereo}`)}
                    </Badge>
                </div>
                {meta && <p className="mt-1 text-xs text-muted-foreground">{meta}</p>}
            </div>
            <span className={cn('shrink-0 text-sm font-bold tabular-nums', changeColor)}>
                {sign}
                {formatCredits(change)}
            </span>
        </div>
    );
};

const TransactionList = ({ filter }: { filter: CreditFilter }) => {
    const { t } = useTranslation('common');
    const { data, isLoading, isError, hasNextPage, fetchNextPage, isFetchingNextPage } = useCreditTransactions(filter);

    if (isLoading) {
        return (
            <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-md" />
                ))}
            </div>
        );
    }

    if (isError) {
        return <p className="py-8 text-center text-sm text-muted-foreground">{t('credits.loadError')}</p>;
    }

    const rows = data?.pages.flatMap(p => p.list) ?? [];

    if (rows.length === 0) {
        return <p className="py-8 text-center text-sm text-muted-foreground">{t('credits.empty')}</p>;
    }

    return (
        <div>
            <div className="divide-y divide-border">
                {rows.map(tx => (
                    <TransactionRow key={tx.id} tx={tx} />
                ))}
            </div>
            {hasNextPage && (
                <div className="pt-3">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full"
                        disabled={isFetchingNextPage}
                        onClick={() => fetchNextPage()}
                    >
                        {t('credits.loadMore')}
                    </Button>
                </div>
            )}
        </div>
    );
};

/**
 * Read-only credit usage Sheet: balance summary + filterable, paginated
 * transaction history. Opened from CreditBalanceChip. No payment code lives here.
 */
export const CreditUsageSheet = ({ open, onOpenChange }: CreditUsageSheetProps) => {
    const { t } = useTranslation('common');
    const { data: balance } = useCreditBalance();
    const [filter, setFilter] = useState<CreditFilter>('all');

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="flex flex-col gap-0 p-0">
                <SheetHeader>
                    <SheetTitle>{t('credits.usageTitle')}</SheetTitle>
                </SheetHeader>
                <div className="flex flex-1 flex-col gap-4 overflow-hidden p-6">
                    {balance && <BalanceSummary data={balance} />}
                    <CreditFilterTabs value={filter} onChange={setFilter} />
                    <ScrollArea className="flex-1">
                        <TransactionList filter={filter} />
                    </ScrollArea>
                </div>
            </SheetContent>
        </Sheet>
    );
};
