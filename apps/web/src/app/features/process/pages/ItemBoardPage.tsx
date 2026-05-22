import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { ArrowRight, CheckCircle2 } from 'lucide-react';

import { getNextAction, getUnresolvedCount, isItemComplete, matchesActor, useActors, useItems } from '@flows/flows';
import { Button } from '@flows/ui-kit';

import { ActorFilterPills } from '../components/ActorFilterPills';
import { EmptyState } from '../components/EmptyState';
import { ItemRow } from '../components/ItemRow';
import { NewItemDialog } from '../components/NewItemDialog';
import { useCurrentActor, useTrySample } from '../hooks';

import type { Item, NextAction } from '@flows/flows';
import type { KeyboardEvent } from 'react';

interface HeroActionProps {
    item: Item;
    action: NextAction;
    onAction: () => void;
}

const HeroAction = ({ item, action, onAction }: HeroActionProps) => {
    const { t } = useTranslation();

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onAction();
        }
    };

    return (
        <div
            role="button"
            tabIndex={0}
            className="overflow-hidden rounded-xl border border-border bg-card p-5 sm:p-6 cursor-pointer transition-all duration-200 hover:shadow-lg hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            onClick={onAction}
            onKeyDown={handleKeyDown}
        >
            <div className="flex items-start gap-4">
                {item.thumbnailUrl ? (
                    <img
                        src={item.thumbnailUrl}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-lg object-cover sm:h-14 sm:w-14"
                    />
                ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted text-base font-bold text-foreground sm:h-14 sm:w-14">
                        {item.name.charAt(0).toUpperCase()}
                    </div>
                )}
                <div className="min-w-0 flex-1">
                    <p className="mb-0.5 text-xs font-medium text-muted-foreground">
                        {item.name} · {t('navigator.nextUp', 'Next up')}
                    </p>
                    <h2 className="mb-1 text-lg font-bold tracking-tight sm:text-xl">{action.stage.name}</h2>
                    <p className="mb-3 text-sm leading-relaxed text-muted-foreground line-clamp-2">
                        {action.stage.guideText || t('navigator.readyToStart', 'Ready to start')}
                    </p>
                    <Button size="sm" className="gap-2 rounded-lg font-semibold" tabIndex={-1}>
                        {action.stage.actionLabel || t('navigator.openAction', 'Open')}
                        <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>
        </div>
    );
};

export const ItemBoardPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { data: itemsData, isLoading } = useItems();
    const { data: actorsData } = useActors();
    const { handleTrySample, isPending: trySamplePending } = useTrySample();
    const { currentActor, setCurrentActor } = useCurrentActor();

    const items = useMemo(() => itemsData?.data ?? [], [itemsData?.data]);
    const activeActors = useMemo(() => (actorsData?.data ?? []).filter(a => a.isActive), [actorsData?.data]);

    const filteredByActor = useMemo(() => {
        if (!currentActor) return items;
        return items.filter(item => matchesActor(item, currentActor.id));
    }, [items, currentActor]);

    const heroEntry = useMemo(() => {
        const withActions = filteredByActor
            .filter(item => !isItemComplete(item))
            .map(item => ({ item, action: getNextAction(item) }))
            .filter((e): e is { item: Item; action: NextAction } => !!e.action);
        if (!currentActor) return withActions[0] ?? null;
        const mine = withActions.find(e => e.action.stage.actorId === currentActor.id);
        return mine ?? withActions[0] ?? null;
    }, [filteredByActor, currentActor]);

    const sortedItems = useMemo(() => {
        const score = (item: Item) => {
            const hasDoing = item.stages.some(s => s.status === 'doing');
            const isComplete = isItemComplete(item);
            const unresolved = getUnresolvedCount(item);
            if (unresolved > 0) return 0;
            if (hasDoing) return 1;
            if (isComplete) return 3;
            return 2;
        };
        return [...filteredByActor].sort((a, b) => score(a) - score(b));
    }, [filteredByActor]);

    const handleItemClick = useCallback((id: string) => navigate(`/items/${id}`), [navigate]);

    if (isLoading) {
        return (
            <div className="space-y-4">
                <div className="h-24 animate-pulse rounded-xl bg-muted" />
                <div className="rounded-lg border border-border/50">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-4 border-b border-border/50 px-4 py-3">
                            <div className="h-2 w-2 animate-pulse rounded-full bg-muted" />
                            <div className="h-8 w-8 animate-pulse rounded bg-muted" />
                            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                            <div className="flex-1" />
                            <div className="h-1 w-16 animate-pulse rounded bg-muted" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (items.length === 0) {
        return <EmptyState onTrySample={handleTrySample} isLoading={trySamplePending} />;
    }

    return (
        <div className="space-y-4">
            <ActorFilterPills
                actors={activeActors}
                selectedActorId={currentActor?.id ?? null}
                onSelect={setCurrentActor}
            />

            {/* Next Action Hero */}
            {heroEntry ? (
                <HeroAction
                    item={heroEntry.item}
                    action={heroEntry.action}
                    onAction={() => navigate(`/items/${heroEntry.item.id}?stage=${heroEntry.action.stage.id}`)}
                />
            ) : (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-5 py-4">
                    <div className="flex items-center gap-3">
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
                        <p className="text-sm text-muted-foreground">
                            {t('navigator.allCaughtUp', 'All caught up! No pending actions right now.')}
                        </p>
                    </div>
                    <NewItemDialog />
                </div>
            )}

            {/* Header + New */}
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-baseline gap-2">
                    <h2 className="text-lg font-semibold">{t('navigator.items', 'Items')}</h2>
                    <span className="text-sm text-muted-foreground">({sortedItems.length})</span>
                </div>
                <NewItemDialog />
            </div>

            {/* Item list */}
            <div className="rounded-lg border border-border/50">
                {sortedItems.map(item => (
                    <ItemRow key={item.id} item={item} onClick={handleItemClick} />
                ))}
                {sortedItems.length === 0 && (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                        {t('navigator.noItemsForActor', 'No items for this actor.')}
                    </p>
                )}
            </div>
        </div>
    );
};
