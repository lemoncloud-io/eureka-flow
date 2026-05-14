import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { LayoutDashboard } from 'lucide-react';

import { getNextAction, useItems } from '@flows/flows';

import { ActorWorkload } from '../components/ActorWorkload';
import { EmptyState } from '../components/EmptyState';
import { NextActionCTA } from '../components/NextActionCTA';
import { StatsBar } from '../components/StatsBar';
import { useTrySample } from '../hooks';

export const DashboardPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { data: itemsData, isLoading } = useItems();
    const { handleTrySample, isPending: trySamplePending } = useTrySample();

    const items = itemsData?.data ?? [];

    const itemsWithActions = items
        .filter(item => !item.stages.every(s => s.status === 'done' || s.status === 'skip'))
        .map(item => ({ item, action: getNextAction(item) }))
        .filter(
            (entry): entry is { item: typeof entry.item; action: NonNullable<typeof entry.action> } => !!entry.action
        );

    const handleAction = (itemId: string, stageId: string) => {
        navigate(`/items/${itemId}?stage=${stageId}`);
    };

    if (isLoading) {
        return (
            <div className="space-y-6">
                <div className="flex items-center gap-3">
                    <LayoutDashboard className="h-6 w-6 text-primary" />
                    <h1 className="text-2xl font-bold">{t('navigator.dashboard', 'Dashboard')}</h1>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <LayoutDashboard className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">{t('navigator.dashboard', 'Dashboard')}</h1>
            </div>

            <StatsBar items={items} />

            {items.length === 0 ? (
                <EmptyState onTrySample={handleTrySample} isLoading={trySamplePending} />
            ) : (
                <div className="space-y-3">
                    <h2 className="text-lg font-semibold">
                        {t('navigator.activeActions', 'Active Action Needed')}
                        {itemsWithActions.length > 0 && (
                            <span className="ml-2 text-sm font-normal text-muted-foreground">
                                ({itemsWithActions.length})
                            </span>
                        )}
                    </h2>
                    {itemsWithActions.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            {t('navigator.noActions', 'All caught up! No pending actions.')}
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {itemsWithActions.map(({ item, action }) => (
                                <NextActionCTA
                                    key={item.id}
                                    item={item}
                                    action={action}
                                    onAction={stageId => handleAction(item.id, stageId)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            <ActorWorkload />
        </div>
    );
};
