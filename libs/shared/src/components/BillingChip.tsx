import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { KeyRound, Sparkles } from 'lucide-react';

import { Button, Popover, PopoverContent, PopoverTrigger, Skeleton, cn } from '@flows/ui-kit';
import { useWebCoreStore } from '@flows/web-core';

import { CreditDetails } from './CreditDetails';
import { CreditUsageSheet } from './CreditUsageSheet';
import { useCreditBalance } from '../hooks';
import { formatCredits } from '../utils';

interface BillingChipProps {
    /** `pill` = standalone glass pill (desktop floating header); `bare` = compact ghost (flat headers). */
    variant?: 'pill' | 'bare';
}

const TRIGGER_STYLE = {
    pill: 'h-9 rounded-2xl border border-border/40 bg-glass-bg px-3 shadow-floating backdrop-blur-2xl hover:bg-glass-bg sm:h-10',
    bare: 'h-8 rounded-lg px-2',
} as const;

/**
 * Single billing control surfacing the active **Run mode** (see CONTEXT.md):
 * - **Own AI key** (`useApiKey`): workspace has its own LLM provider key, runs are not
 *   charged → show a key chip with no number; the balance stays reachable in the popover.
 * - **Credits**: runs draw down the Credit balance → show the balance number.
 *
 * Run mode is the user's personal billing path, so the chip shows whenever authed
 * (gates on the flow `apiKey`); it does not depend on per-flow run permission.
 * Charging always deep-links to billing; flow stays payment-free.
 */
export const BillingChip = ({ variant = 'pill' }: BillingChipProps) => {
    const { t } = useTranslation('common');
    const apiKey = useWebCoreStore(s => s.apiKey);
    const ownAiKey = useWebCoreStore(s => s.useApiKey);
    const { data, isLoading, isError, refetch } = useCreditBalance();
    const [popoverOpen, setPopoverOpen] = useState(false);
    const [sheetOpen, setSheetOpen] = useState(false);

    if (!apiKey) return null;
    // Credits mode needs the balance to render the number; Own-AI-key mode renders a
    // static key chip and only needs the balance (optionally) for the popover.
    if (!ownAiKey && isLoading) return <Skeleton className="h-8 w-16 rounded-md" />;
    if (!ownAiKey && (isError || !data)) return null;

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

    const ownKeyLabel = t('runMode.ownKey');

    return (
        <>
            <Popover open={popoverOpen} onOpenChange={handleOpenChange}>
                <PopoverTrigger asChild>
                    <Button
                        variant="ghost"
                        className={cn('gap-1.5', TRIGGER_STYLE[variant])}
                        aria-label={ownAiKey ? ownKeyLabel : t('credits.balance')}
                        title={ownAiKey ? t('runMode.ownKeyHint') : undefined}
                    >
                        {ownAiKey ? (
                            <>
                                <KeyRound className="h-4 w-4 text-muted-foreground" />
                                {variant === 'pill' && (
                                    <span className="text-sm font-medium tracking-tight">{ownKeyLabel}</span>
                                )}
                            </>
                        ) : (
                            data && (
                                <>
                                    <Sparkles className="h-4 w-4 fill-amber-400 text-amber-400" />
                                    <span className="text-sm font-semibold tracking-tight">
                                        {formatCredits(data.total)}
                                    </span>
                                </>
                            )
                        )}
                    </Button>
                </PopoverTrigger>
                <PopoverContent
                    align={variant === 'pill' ? 'start' : 'end'}
                    sideOffset={8}
                    className="w-72 rounded-xl p-4"
                >
                    {data ? (
                        <CreditDetails balance={data} onUsage={openUsage} showOwnKeyNote={ownAiKey} />
                    ) : (
                        <p className="text-sm text-muted-foreground">{t('runMode.notCharged')}</p>
                    )}
                </PopoverContent>
            </Popover>
            <CreditUsageSheet open={sheetOpen} onOpenChange={setSheetOpen} />
        </>
    );
};
