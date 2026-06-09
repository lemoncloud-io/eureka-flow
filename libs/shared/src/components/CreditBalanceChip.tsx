import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Sparkles } from 'lucide-react';

import { Button, Popover, PopoverContent, PopoverTrigger, Skeleton, cn } from '@flows/ui-kit';
import { useWebCoreStore } from '@flows/web-core';

import { CreditDetails } from './CreditDetails';
import { CreditUsageSheet } from './CreditUsageSheet';
import { useCreditBalance } from '../hooks';
import { formatCredits } from '../utils';

interface CreditBalanceChipProps {
    /** `pill` = standalone glass pill (desktop floating header); `bare` = compact ghost (flat headers). */
    variant?: 'pill' | 'bare';
}

const TRIGGER_STYLE = {
    pill: 'h-9 rounded-2xl border border-border/40 bg-glass-bg px-3 shadow-floating backdrop-blur-2xl hover:bg-glass-bg sm:h-10',
    bare: 'h-8 rounded-lg px-2',
} as const;

/**
 * Single credit control. The chip shows the balance and opens a Popover with
 * credit details (purchase + history links). Usage history lives in the in-app
 * Sheet; charging deep-links to billing. Hidden when unauthenticated (no apiKey)
 * or on error (silent fallback). `variant` adapts the chrome to its header.
 */
export const CreditBalanceChip = ({ variant = 'pill' }: CreditBalanceChipProps) => {
    const { t } = useTranslation('common');
    const apiKey = useWebCoreStore(s => s.apiKey);
    const { data, isLoading, isError, refetch } = useCreditBalance();
    const [popoverOpen, setPopoverOpen] = useState(false);
    const [sheetOpen, setSheetOpen] = useState(false);

    if (!apiKey) return null;
    if (isLoading) return <Skeleton className="h-8 w-16 rounded-md" />;
    if (isError || !data) return null;

    const openUsage = () => {
        setPopoverOpen(false);
        setSheetOpen(true);
    };

    // Refresh balance when opening the popover (replaces window-focus refetch),
    // e.g. after returning from a billing charge.
    const handleOpenChange = (open: boolean) => {
        setPopoverOpen(open);
        if (open) refetch();
    };

    return (
        <>
            <Popover open={popoverOpen} onOpenChange={handleOpenChange}>
                <PopoverTrigger asChild>
                    <Button
                        variant="ghost"
                        className={cn('gap-1.5', TRIGGER_STYLE[variant])}
                        aria-label={t('credits.balance')}
                    >
                        <Sparkles className="h-4 w-4 fill-amber-400 text-amber-400" />
                        <span className="text-sm font-semibold tracking-tight">{formatCredits(data.total)}</span>
                    </Button>
                </PopoverTrigger>
                <PopoverContent
                    align={variant === 'pill' ? 'start' : 'end'}
                    sideOffset={8}
                    className="w-72 rounded-xl p-4"
                >
                    <CreditDetails balance={data} onUsage={openUsage} />
                </PopoverContent>
            </Popover>
            <CreditUsageSheet open={sheetOpen} onOpenChange={setSheetOpen} />
        </>
    );
};
