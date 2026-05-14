import { useTranslation } from 'react-i18next';

import { Users } from 'lucide-react';

export const ActorManagerPage = () => {
    const { t } = useTranslation();

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <Users className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">{t('navigator.actors', 'Actors')}</h1>
            </div>
            <div className="rounded-lg border border-dashed border-border p-12 text-center">
                <p className="text-lg text-muted-foreground">
                    {t('navigator.actorManagerPlaceholder', 'Actor Manager — coming in Phase 5')}
                </p>
            </div>
        </div>
    );
};
