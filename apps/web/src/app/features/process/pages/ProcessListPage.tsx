import { useTranslation } from 'react-i18next';

import { GitBranch } from 'lucide-react';

export const ProcessListPage = () => {
    const { t } = useTranslation();

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <GitBranch className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">{t('navigator.processes', 'Processes')}</h1>
            </div>
            <div className="rounded-lg border border-dashed border-border p-12 text-center">
                <p className="text-lg text-muted-foreground">
                    {t('navigator.processListPlaceholder', 'Process List — coming in Phase 6')}
                </p>
            </div>
        </div>
    );
};
