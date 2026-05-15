import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Search } from 'lucide-react';

import { getUnresolvedCount, useItems } from '@flows/flows';
import { Input } from '@flows/ui-kit';

import { EmptyState } from '../components/EmptyState';
import { ItemRow } from '../components/ItemRow';
import { useTrySample } from '../hooks';

import type { Item } from '@flows/flows';

export const ItemBoardPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { data: itemsData, isLoading } = useItems();
    const { handleTrySample, isPending: trySamplePending } = useTrySample();
    const [search, setSearch] = useState('');

    const items = itemsData?.data ?? [];

    const sortedItems = useMemo(() => {
        const score = (item: Item) => {
            const hasDoing = item.stages.some(s => s.status === 'doing');
            const isComplete = item.stages.every(s => s.status === 'done' || s.status === 'skip');
            const unresolved = getUnresolvedCount(item);
            if (unresolved > 0) return 0; // urgent first
            if (hasDoing) return 1;
            if (isComplete) return 3;
            return 2; // todo
        };
        return [...items].sort((a, b) => score(a) - score(b));
    }, [items]);

    const filtered = search
        ? sortedItems.filter(item => item.name.toLowerCase().includes(search.toLowerCase()))
        : sortedItems;

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
                    {filtered.length === 0 && search && (
                        <p className="py-8 text-center text-sm text-muted-foreground">
                            {t('navigator.noResults', 'No items match your search.')}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};
