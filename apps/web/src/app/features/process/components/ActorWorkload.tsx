import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { getStageUnresolvedNotesCount, useActors, useItems } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { Card, CardContent } from '@flows/ui-kit';

import { STATUS_COLORS } from './StatusBadge';
import { useCurrentActor } from '../hooks/useCurrentActor';

export const ActorWorkload = () => {
    const { t } = useTranslation();
    const { data: itemsData } = useItems();
    const { data: actorsData } = useActors();
    const { currentActor, setCurrentActor } = useCurrentActor();
    const items = itemsData?.data ?? [];
    const actors = actorsData?.data?.filter(a => a.isActive) ?? [];

    const workload = useMemo(() => {
        if (actors.length === 0) return [];
        return actors
            .map(actor => {
                let doing = 0;
                let todo = 0;
                let unresolved = 0;
                for (const item of items) {
                    for (const stage of item.stages) {
                        if (stage.actorId !== actor.id) continue;
                        if (stage.status === 'doing') doing++;
                        if (stage.status === 'todo') todo++;
                        unresolved += getStageUnresolvedNotesCount(stage);
                    }
                }
                return { actor, doing, todo, unresolved, total: doing + todo };
            })
            .filter(w => w.total > 0 || w.unresolved > 0);
    }, [items, actors]);

    if (workload.length === 0) return null;

    return (
        <div className="space-y-3">
            <h2 className="text-lg font-semibold">{t('navigator.actorWorkload', 'Team Workload')}</h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {workload.map(({ actor, doing, todo, unresolved }) => (
                    <Card
                        key={actor.id}
                        className={cn(
                            'cursor-pointer transition-all duration-200 hover:shadow-md',
                            currentActor?.id === actor.id && 'ring-2 ring-primary'
                        )}
                        onClick={() => setCurrentActor(actor.id === currentActor?.id ? null : actor)}
                    >
                        <CardContent className="p-3">
                            <div className="flex items-center gap-2 mb-2">
                                <div className={cn('h-3 w-3 rounded-full shrink-0', actor.color)} />
                                <span className="text-sm font-medium truncate" title={actor.name}>
                                    {actor.name}
                                </span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                {doing > 0 && (
                                    <span className={STATUS_COLORS.doing}>
                                        {doing} {t('navigator.doingShort', 'doing')}
                                    </span>
                                )}
                                {todo > 0 && (
                                    <span>
                                        {todo} {t('navigator.todoShort', 'todo')}
                                    </span>
                                )}
                                {unresolved > 0 && (
                                    <span className={STATUS_COLORS.hold}>
                                        {unresolved} {t('navigator.unresolvedShort', 'unresolved')}
                                    </span>
                                )}
                                {doing === 0 && todo === 0 && unresolved === 0 && (
                                    <span>{t('navigator.noWork', 'clear')}</span>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
};
