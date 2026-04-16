import { useTranslation } from 'react-i18next';

import { MonitorSmartphone } from 'lucide-react';

import { cn } from '@flows/lib/utils';

interface FrontendBadgeProps {
    className?: string;
}

export const FrontendBadge: React.FC<FrontendBadgeProps> = ({ className }) => {
    const { t } = useTranslation(['flows']);

    return (
        <span
            className={cn(
                'inline-flex w-fit items-center gap-1 rounded-md bg-muted/80 px-1.5 py-0.5 text-[10px] font-medium leading-4 text-primary',
                className
            )}
        >
            <MonitorSmartphone className="h-2.5 w-2.5" />
            {t('sidebar.frontend')}
        </span>
    );
};
