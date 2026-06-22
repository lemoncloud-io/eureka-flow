import { useTranslation } from 'react-i18next';

import { KeyRound, Sparkles } from 'lucide-react';

import { Badge } from '@flows/ui-kit';
import { useWebCoreStore } from '@flows/web-core';

interface RunModeIndicatorProps {
    /** Compact variant (mobile): icon only, no label. */
    compact?: boolean;
}

/**
 * Read-only badge showing which billing mode AI runs use.
 *
 * The server auto-decides BYOK-vs-credits — workspace AI key present → runs use that key
 * (no credits charged); absent → runs are charged to credits. There is no client toggle;
 * this only surfaces the active mode, derived from `useApiKey` (= workspace has an AI key).
 */
export const RunModeIndicator = ({ compact = false }: RunModeIndicatorProps) => {
    const { t } = useTranslation(['flows']);
    const useApiKey = useWebCoreStore(state => state.useApiKey);

    const label = useApiKey ? t('header.runModeOwnKey', 'Your API key') : t('header.runModeCredits', 'Credits');
    const title = useApiKey
        ? t('header.runModeOwnKeyHint', 'Runs use your workspace AI key — no credits charged')
        : t('header.runModeCreditsHint', 'Runs are charged to your credit balance');
    const Icon = useApiKey ? KeyRound : Sparkles;

    return (
        <Badge variant="secondary" size="sm" className="gap-1 text-[10px]" title={title}>
            <Icon className="w-3 h-3" />
            {!compact && label}
        </Badge>
    );
};
