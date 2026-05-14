import { useTranslation } from 'react-i18next';

import { Wrench } from 'lucide-react';

export const ToolManagerPage = () => {
    const { t } = useTranslation();

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <Wrench className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">{t('navigator.tools', 'Tools')}</h1>
            </div>
            <div className="rounded-lg border border-dashed border-border p-12 text-center">
                <p className="text-lg text-muted-foreground">
                    {t('navigator.toolManagerPlaceholder', 'Tool Manager — coming in Phase 5')}
                </p>
            </div>
        </div>
    );
};
