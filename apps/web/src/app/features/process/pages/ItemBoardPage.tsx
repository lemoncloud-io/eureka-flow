import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Search } from 'lucide-react';

import { getUnresolvedCount, useItems } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { Input } from '@flows/ui-kit';

import { EmptyState } from '../components/EmptyState';
import { ItemRow } from '../components/ItemRow';
import { useTrySample } from '../hooks';

import type { Item } from '@flows/flows';

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

export const ItemBoardPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { data: itemsData, isLoading } = useItems();
    const { handleTrySample, isPending: trySamplePending } = useTrySample();
    const [search, setSearch] = useState('');
    const [activeFilter, setActiveFilter] = useState<FilterTab>('all');

    const items = itemsData?.data ?? [];

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

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-baseline gap-2">
                    <h1 className="text-2xl font-bold">{t('navigator.items', 'Items')}</h1>
                    {items.length > 0 && <span className="text-sm text-muted-foreground">({items.length})</span>}
                </div>
                {items.length > 0 && (
                    <div className="relative w-56">
                        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder={t('navigator.searchItems', 'Search items...')}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="h-8 pl-9 text-sm"
                        />
                    </div>
                )}
            </div>

            {/* Filter tabs */}
            {items.length > 0 && (
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
            )}

            {/* Content */}
            {isLoading ? (
                <div className="rounded-lg border border-border/50">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-4 border-b border-border/50 px-4 py-3">
                            <div className="h-2 w-2 animate-pulse rounded-full bg-muted" />
                            <div className="h-8 w-8 animate-pulse rounded bg-muted" />
                            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                            <div className="flex-1" />
                            <div className="h-1 w-16 animate-pulse rounded bg-muted" />
                        </div>
                    ))}
                </div>
            ) : items.length === 0 ? (
                <EmptyState onTrySample={handleTrySample} isLoading={trySamplePending} />
            ) : (
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
            )}
        </div>
    );
};
