import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { ArrowRight, Search } from 'lucide-react';

import { getNextAction, getUnresolvedCount, useItems } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { Button, Input } from '@flows/ui-kit';

import { EmptyState } from '../components/EmptyState';
import { ItemRow } from '../components/ItemRow';
import { NewItemDialog } from '../components/NewItemDialog';
import { useCurrentActor, useTrySample } from '../hooks';

import type { Item, NextAction } from '@flows/flows';
import type { KeyboardEvent } from 'react';

type FilterTab = 'all' | 'active' | 'issues' | 'completed';

const FILTER_TABS: { key: FilterTab; labelKey: string; fallback: string }[] = [
    { key: 'all', labelKey: 'navigator.filterAll', fallback: 'All' },
    { key: 'active', labelKey: 'navigator.filterActive', fallback: 'Active' },
    { key: 'issues', labelKey: 'navigator.filterIssues', fallback: 'Issues' },
    { key: 'completed', labelKey: 'navigator.filterCompleted', fallback: 'Done' },
];

const classifyItem = (item: Item): FilterTab => {
    const isComplete = item.stages.every(s => s.status === 'done' || s.status === 'skip');
    if (isComplete) return 'completed';
    if (getUnresolvedCount(item) > 0) return 'issues';
    return 'active';
};

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
    const { handleTrySample, isPending: trySamplePending } = useTrySample();
    const { currentActor, setCurrentActor } = useCurrentActor();
    const [search, setSearch] = useState('');
    const [activeFilter, setActiveFilter] = useState<FilterTab>('all');

    const items = itemsData?.data ?? [];

    // Next action hero — prioritize current actor's items
    const heroEntry = useMemo(() => {
        const withActions = items
            .filter(item => !item.stages.every(s => s.status === 'done' || s.status === 'skip'))
            .map(item => ({ item, action: getNextAction(item) }))
            .filter((e): e is { item: Item; action: NextAction } => !!e.action);
        if (!currentActor) return withActions[0] ?? null;
        const mine = withActions.find(e => e.action.stage.actorId === currentActor.id);
        return mine ?? withActions[0] ?? null;
    }, [items, currentActor]);

    const sortedItems = useMemo(() => {
        const score = (item: Item) => {
            const hasDoing = item.stages.some(s => s.status === 'doing');
            const isComplete = item.stages.every(s => s.status === 'done' || s.status === 'skip');
            const unresolved = getUnresolvedCount(item);
            if (unresolved > 0) return 0;
            if (hasDoing) return 1;
            if (isComplete) return 3;
            return 2;
        };
        return [...items].sort((a, b) => score(a) - score(b));
    }, [items]);

    const classificationMap = useMemo(() => {
        const map = new Map<string, FilterTab>();
        for (const item of items) {
            map.set(item.id, classifyItem(item));
        }
        return map;
    }, [items]);

    const filterCounts = useMemo(() => {
        const counts: Record<FilterTab, number> = { all: items.length, active: 0, issues: 0, completed: 0 };
        for (const [, cat] of classificationMap) {
            counts[cat]++;
        }
        return counts;
    }, [items.length, classificationMap]);

    const filtered = useMemo(() => {
        let result = sortedItems;
        if (activeFilter !== 'all') {
            result = result.filter(item => {
                const cat = classificationMap.get(item.id) ?? 'active';
                if (activeFilter === 'active') return cat === 'active' || cat === 'issues';
                return cat === activeFilter;
            });
        }
        if (search) {
            result = result.filter(item => item.name.toLowerCase().includes(search.toLowerCase()));
        }
        return result;
    }, [sortedItems, activeFilter, search, classificationMap]);

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
            {/* Actor filter banner */}
            {currentActor && (
                <div className="flex items-center justify-between rounded-md bg-accent/50 px-3 py-2">
                    <p className="text-sm">
                        <span className="text-muted-foreground">
                            {t('navigator.showingActionsFor', 'Showing actions for')}
                        </span>{' '}
                        <span className="font-medium">{currentActor.name}</span>
                    </p>
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setCurrentActor(null)}>
                        {t('navigator.showAll', 'Show all')}
                    </Button>
                </div>
            )}

            {/* Next Action Hero */}
            {heroEntry && (
                <HeroAction
                    item={heroEntry.item}
                    action={heroEntry.action}
                    onAction={() => navigate(`/items/${heroEntry.item.id}/stages/${heroEntry.action.stage.id}`)}
                />
            )}

            {/* Header + Search + New */}
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-baseline gap-2">
                    <h2 className="text-lg font-semibold">{t('navigator.items', 'Items')}</h2>
                    <span className="text-sm text-muted-foreground">({items.length})</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative w-56">
                        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder={t('navigator.searchItems', 'Search items...')}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="h-8 pl-9 text-sm"
                        />
                    </div>
                    <NewItemDialog />
                </div>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-1 border-b border-border">
                {FILTER_TABS.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveFilter(tab.key)}
                        className={cn(
                            'px-3 py-2 text-sm font-medium border-b-2 transition-colors',
                            activeFilter === tab.key
                                ? 'border-primary text-foreground'
                                : 'border-transparent text-muted-foreground hover:text-foreground'
                        )}
                    >
                        {t(tab.labelKey, tab.fallback)}
                        {tab.key !== 'all' && filterCounts[tab.key] > 0 && (
                            <span
                                className={cn(
                                    'ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs',
                                    tab.key === 'issues'
                                        ? 'bg-orange-500/10 text-orange-500'
                                        : 'bg-muted text-muted-foreground'
                                )}
                            >
                                {filterCounts[tab.key]}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Item list */}
            <div className="rounded-lg border border-border/50">
                {filtered.map(item => (
                    <ItemRow key={item.id} item={item} onClick={id => navigate(`/items/${id}`)} />
                ))}
                {filtered.length === 0 && (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                        {search
                            ? t('navigator.noResults', 'No items match your search.')
                            : t('navigator.noItemsInFilter', 'No items in this category.')}
                    </p>
                )}
            </div>
        </div>
    );
};
