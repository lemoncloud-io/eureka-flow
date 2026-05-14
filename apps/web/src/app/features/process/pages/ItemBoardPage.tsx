import { useTranslation } from 'react-i18next';

import { Package } from 'lucide-react';

export const ItemBoardPage = () => {
    const { t } = useTranslation();

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <Package className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">{t('navigator.items', 'Items')}</h1>
            </div>
            <div className="rounded-lg border border-dashed border-border p-12 text-center">
                <p className="text-lg text-muted-foreground">
                    {t('navigator.itemBoardPlaceholder', 'Item Board — coming in Phase 3')}
                </p>
            </div>
        </div>
    );
};
