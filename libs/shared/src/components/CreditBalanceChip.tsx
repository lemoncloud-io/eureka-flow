import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Sparkles } from 'lucide-react';

import { Button, Popover, PopoverContent, PopoverTrigger, Skeleton } from '@flows/ui-kit';
import { useWebCoreStore } from '@flows/web-core';

import { CreditDetails } from './CreditDetails';
import { CreditUsageSheet } from './CreditUsageSheet';
import { useCreditBalance } from '../hooks';
import { formatCredits } from '../utils';

/**
 * Single credit control in the editor toolbar. The pill shows the balance and
 * opens a Popover with credit details (purchase + history links). Usage history
 * lives in the in-app Sheet; charging deep-links to billing. Hidden when
 * unauthenticated (no apiKey) or on error (silent fallback).
 */
export const CreditBalanceChip = () => {
    const { t } = useTranslation('common');
    const apiKey = useWebCoreStore(s => s.apiKey);
    const { data, isLoading, isError } = useCreditBalance();
    const [popoverOpen, setPopoverOpen] = useState(false);
    const [sheetOpen, setSheetOpen] = useState(false);

    if (!apiKey) return null;
    if (isLoading) return <Skeleton className="h-8 w-16 rounded-md" />;
    if (isError || !data) return null;

    const openUsage = () => {
        setPopoverOpen(false);
        setSheetOpen(true);
    };

    return (
        <>
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="ghost"
                        className="h-9 gap-1.5 rounded-2xl border border-border/40 bg-glass-bg px-3 shadow-floating backdrop-blur-2xl hover:bg-glass-bg sm:h-10"
                        aria-label={t('credits.balance')}
                    >
                        <Sparkles className="h-4 w-4 fill-amber-400 text-amber-400" />
                        <span className="text-sm font-semibold tracking-tight">{formatCredits(data.total)}</span>
                    </Button>
                </PopoverTrigger>
                <PopoverContent align="start" sideOffset={8} className="w-72 rounded-xl p-4">
                    <CreditDetails balance={data} onUsage={openUsage} />
                </PopoverContent>
            </Popover>
            <CreditUsageSheet open={sheetOpen} onOpenChange={setSheetOpen} />
        </>
    );
};
