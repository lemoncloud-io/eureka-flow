import { useTranslation } from 'react-i18next';

import { MonitorSmartphone } from 'lucide-react';

import { cn } from '@flows/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@flows/ui-kit';

interface FrontendBadgeProps {
    /** Show tooltip with execution description */
    showTooltip?: boolean;
    /** Additional class names */
    className?: string;
}

export const FrontendBadge: React.FC<FrontendBadgeProps> = ({ showTooltip = false, className }) => {
    const { t } = useTranslation(['flows']);

    const badge = (
        <span
            className={cn(
                'text-[9px] px-1 py-0.5 rounded bg-primary/10 text-primary shrink-0 flex items-center gap-0.5',
                showTooltip && 'cursor-help',
                className
            )}
            title={!showTooltip ? t('sidebar.clientExecution') : undefined}
        >
            <MonitorSmartphone className="w-2.5 h-2.5" />
            {t('sidebar.frontend')}
        </span>
    );

    if (showTooltip) {
        return (
            <TooltipProvider delayDuration={0}>
                <Tooltip>
                    <TooltipTrigger asChild>{badge}</TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                        {t('sidebar.clientExecution')}
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        );
    }

    return badge;
};
