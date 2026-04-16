import { useTranslation } from 'react-i18next';

import { MonitorSmartphone } from 'lucide-react';

import { cn } from '@flows/lib/utils';

interface FrontendBadgeProps {
    /** Additional class names */
    className?: string;
}

export const FrontendBadge: React.FC<FrontendBadgeProps> = ({ className }) => {
    const { t } = useTranslation(['flows']);

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 rounded bg-muted px-1.5 py-1 text-[10px] font-medium text-primary',
                className
            )}
        >
            <MonitorSmartphone className="h-3 w-3" />
            {t('sidebar.frontend')}
        </span>
    );
};
