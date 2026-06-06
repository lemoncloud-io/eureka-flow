import { useTranslation } from 'react-i18next';

import { CreditCard } from 'lucide-react';

import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@flows/ui-kit';

import { useBillingCharge } from '../hooks';

/**
 * Opens the billing app (new tab) to charge credits. Renders nothing when
 * VITE_BILLING_URL is unset, so open-source self-hosters never see a dead button.
 * See docs/adr/0001-flow-billing-deeplink.md.
 */
export const ChargeCreditsButton = () => {
    const { t } = useTranslation();
    const { isEnabled, charge } = useBillingCharge();

    if (!isEnabled) return null;

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={charge}
                        aria-label={t('credits.charge')}
                    >
                        <CreditCard className="h-4 w-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>{t('credits.charge')}</TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
};
