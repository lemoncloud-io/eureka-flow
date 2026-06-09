import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Skeleton, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@flows/ui-kit';
import { useWebCoreStore } from '@flows/web-core';

import { CreditCoin } from './CreditCoin';
import { CreditUsageSheet } from './CreditUsageSheet';
import { useCreditBalance } from '../hooks';
import { formatCredits } from '../utils';

/**
 * Single credit control in the editor toolbar. Shows the balance; clicking opens
 * the usage Sheet, where charging lives (one cohesive credit entry point instead
 * of a separate charge button). Hidden when unauthenticated (no apiKey) or on
 * error (silent fallback). flow never charges here — charge deep-links to billing.
 */
export const CreditBalanceChip = () => {
    const { t } = useTranslation('common');
    const apiKey = useWebCoreStore(s => s.apiKey);
    const { data, isLoading, isError } = useCreditBalance();
    const [open, setOpen] = useState(false);

    if (!apiKey) return null;
    if (isLoading) return <Skeleton className="h-8 w-16 rounded-md" />;
    if (isError || !data) return null;

    return (
        <>
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5 px-2"
                            onClick={() => setOpen(true)}
                            aria-label={t('credits.balance')}
                        >
                            <CreditCoin className="h-4 w-4" />
                            <span className="text-sm font-semibold tracking-tight">{formatCredits(data.total)}</span>
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('credits.balance')}</TooltipContent>
                </Tooltip>
            </TooltipProvider>
            <CreditUsageSheet open={open} onOpenChange={setOpen} />
        </>
    );
};
