import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Package, Search } from 'lucide-react';

import { useItems } from '@flows/flows';
import { Input } from '@flows/ui-kit';

import { EmptyState } from '../components/EmptyState';
import { ItemCard } from '../components/ItemCard';
import { useTrySample } from '../hooks';

export const ItemBoardPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { data: itemsData, isLoading } = useItems();
    const { handleTrySample, isPending: trySamplePending } = useTrySample();
    const [search, setSearch] = useState('');

    const items = itemsData?.data ?? [];

    const filtered = search ? items.filter(item => item.name.toLowerCase().includes(search.toLowerCase())) : items;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Package className="h-6 w-6 text-primary" />
                    <h1 className="text-2xl font-bold">{t('navigator.items', 'Items')}</h1>
                    {items.length > 0 && <span className="text-sm text-muted-foreground">({items.length})</span>}
                </div>
                {items.length > 0 && (
                    <div className="relative w-64">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder={t('navigator.searchItems', 'Search items...')}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="pl-9"
                        />
                    </div>
                )}
            </div>

            {isLoading ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="h-28 animate-pulse rounded-lg bg-muted" />
                    ))}
                </div>
            ) : items.length === 0 ? (
                <EmptyState onTrySample={handleTrySample} isLoading={trySamplePending} />
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {filtered.map(item => (
                        <ItemCard key={item.id} item={item} onClick={id => navigate(`/items/${id}`)} />
                    ))}
                    {filtered.length === 0 && search && (
                        <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
                            {t('navigator.noResults', 'No items match your search.')}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};
