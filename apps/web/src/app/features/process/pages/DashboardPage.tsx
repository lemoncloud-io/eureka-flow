import { useTranslation } from 'react-i18next';

import { LayoutDashboard } from 'lucide-react';

export const DashboardPage = () => {
    const { t } = useTranslation();

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <LayoutDashboard className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">{t('navigator.dashboard', 'Dashboard')}</h1>
            </div>
            <div className="rounded-lg border border-dashed border-border p-12 text-center">
                <p className="text-lg text-muted-foreground">
                    {t('navigator.dashboardPlaceholder', 'Navigator Dashboard — coming in Phase 3')}
                </p>
                <p className="mt-2 text-sm text-muted-foreground/60">
                    {t('navigator.dashboardHint', 'Active items, next actions, and team workload will appear here.')}
                </p>
            </div>
        </div>
    );
};
