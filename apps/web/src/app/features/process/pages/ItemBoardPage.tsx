import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react';

import { getNextAction, isItemComplete, useActors, useItems } from '@flows/flows';
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
    const { currentActor, setCurrentActor } = useCurrentActor();

    const [page, setPage] = useState(0);
    const [limit] = useState(10);
    const [sort, setSort] = useState('createdAt:desc');
    const [cursorHistory, setCursorHistory] = useState<Record<number, string[]>>({});

    const activeLastCursor = page > 0 ? cursorHistory[page - 1] : undefined;

    const { data: itemsData, isLoading } = useItems({
        page,
        limit,
        sort,
        actorId: currentActor?.id,
        last: activeLastCursor,
    });

    const { data: actorsData } = useActors();
    const { handleTrySample, isPending: trySamplePending } = useTrySample();

    const items = useMemo(() => itemsData?.data ?? [], [itemsData?.data]);
    const activeActors = useMemo(() => (actorsData?.data ?? []).filter(a => a.isActive), [actorsData?.data]);

    const totalCount = itemsData?.meta?.total ?? 0;
    const totalPages = Math.ceil(totalCount / limit);

    const currentLastCursor = itemsData?.meta?.last;

    useEffect(() => {
        if (currentLastCursor && page >= 0) {
            setCursorHistory(prev => {
                if (JSON.stringify(prev[page]) === JSON.stringify(currentLastCursor)) {
                    return prev;
                }
                return { ...prev, [page]: currentLastCursor };
            });
        }
    }, [currentLastCursor, page]);

    const handleActorSelect = useCallback(
        (actorId: string | null) => {
            setCurrentActor(actorId);
            setPage(0);
            setCursorHistory({});
        },
        [setCurrentActor]
    );

    const handleSortChange = useCallback((newSort: string) => {
        setSort(newSort);
        setPage(0);
        setCursorHistory({});
    }, []);

    const heroEntry = useMemo(() => {
        const withActions = items
            .filter(item => !isItemComplete(item))
            .map(item => ({ item, action: getNextAction(item) }))
            .filter((e): e is { item: Item; action: NextAction } => !!e.action);
        if (!currentActor) return withActions[0] ?? null;
        const mine = withActions.find(e => e.action.stage.actorId === currentActor.id);
        return mine ?? withActions[0] ?? null;
    }, [items, currentActor]);

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

    if (items.length === 0 && !currentActor && page === 0) {
        return <EmptyState onTrySample={handleTrySample} isLoading={trySamplePending} />;
    }

    return (
        <div className="space-y-4">
            <ActorFilterPills
                actors={activeActors}
                selectedActorId={currentActor?.id ?? null}
                onSelect={handleActorSelect}
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

            {/* Header + Filters + New */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/50 pb-2 pt-2">
                <div className="flex items-baseline gap-2">
                    <h2 className="text-lg font-semibold">{t('navigator.items', 'Items')}</h2>
                    <span className="text-sm text-muted-foreground">
                        ({totalCount} {t('navigator.total', 'total')})
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    {/* Sort Selector */}
                    <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground">
                        <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                        <select
                            value={sort}
                            onChange={e => handleSortChange(e.target.value)}
                            className="bg-transparent border-none outline-none pr-1 font-medium cursor-pointer"
                        >
                            <option value="createdAt:desc">{t('navigator.sortNewest', 'Newest First')}</option>
                            <option value="createdAt:asc">{t('navigator.sortOldest', 'Oldest First')}</option>
                            <option value="updatedAt:desc">{t('navigator.sortRecent', 'Recently Updated')}</option>
                            <option value="updatedAt:asc">
                                {t('navigator.sortLeastRecent', 'Least Recently Updated')}
                            </option>
                        </select>
                    </div>
                    <NewItemDialog />
                </div>
            </div>

            {/* Item list */}
            <div className="rounded-lg border border-border/50">
                {items.map(item => (
                    <ItemRow key={item.id} item={item} onClick={handleItemClick} />
                ))}
                {items.length === 0 && (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                        {t('navigator.noItemsForActor', 'No items for this actor.')}
                    </p>
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 bg-card/50 p-4 backdrop-blur-sm">
                    <div className="text-xs text-muted-foreground">
                        {t('navigator.paginationInfo', {
                            current: page + 1,
                            total: totalPages,
                            count: totalCount,
                            start: page + 1,
                            end: totalPages,
                            defaultValue: 'Page {{current}} of {{total}} ({{count}} items)',
                        })}
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => Math.max(0, p - 1))}
                            disabled={page === 0}
                            className="h-8 w-8 p-0 rounded-lg"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        {Array.from({ length: totalPages }).map((_, idx) => {
                            if (idx === 0 || idx === totalPages - 1 || (idx >= page - 1 && idx <= page + 1)) {
                                return (
                                    <Button
                                        key={idx}
                                        variant={page === idx ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => setPage(idx)}
                                        className={`h-8 w-8 p-0 rounded-lg text-xs font-semibold ${
                                            page === idx ? 'shadow-sm shadow-primary/20' : ''
                                        }`}
                                    >
                                        {idx + 1}
                                    </Button>
                                );
                            } else if (idx === page - 2 || idx === page + 2) {
                                return (
                                    <span key={idx} className="px-1 text-xs text-muted-foreground select-none">
                                        ...
                                    </span>
                                );
                            }
                            return null;
                        })}
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                            disabled={page === totalPages - 1}
                            className="h-8 w-8 p-0 rounded-lg"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};
