import { useTranslation } from 'react-i18next';

import { AlertCircle, CheckCircle2, Loader2, Package } from 'lucide-react';

import { getUnresolvedCount } from '@flows/flows';
import { cn } from '@flows/lib/utils';

import type { Item } from '@flows/flows';

interface StatsBarProps {
    items: Item[];
}

export const StatsBar = ({ items }: StatsBarProps) => {
    const { t } = useTranslation();

    const { total, inProgress, completed, unresolvedNotes } = items.reduce(
        (acc, item) => {
            acc.total++;
            const hasDoing = item.stages.some(s => s.status === 'doing');
            const allDone = item.stages.every(s => s.status === 'done' || s.status === 'skip');
            if (hasDoing) acc.inProgress++;
            if (allDone) acc.completed++;
            acc.unresolvedNotes += getUnresolvedCount(item);
            return acc;
        },
        { total: 0, inProgress: 0, completed: 0, unresolvedNotes: 0 }
    );

    const stats = [
        { icon: Package, label: t('navigator.totalItems', 'Total'), value: total, color: 'text-foreground' },
        {
            icon: Loader2,
            label: t('navigator.inProgress', 'In Progress'),
            value: inProgress,
            color: 'text-blue-500 dark:text-blue-400',
        },
        {
            icon: CheckCircle2,
            label: t('navigator.completed', 'Completed'),
            value: completed,
            color: 'text-green-600 dark:text-green-400',
        },
        {
            icon: AlertCircle,
            label: t('navigator.unresolvedNotes', 'Unresolved'),
            value: unresolvedNotes,
            color: unresolvedNotes > 0 ? 'text-orange-500 dark:text-orange-400' : 'text-muted-foreground',
        },
    ];

    return (
        <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border/50 bg-muted/30 px-4 py-3">
            {stats.map(({ icon: Icon, label, value, color }) => (
                <div key={label} className="flex items-center gap-2">
                    <Icon className={cn('h-3.5 w-3.5 shrink-0', color)} />
                    <dd className={cn('text-sm font-semibold tabular-nums', color)}>{value}</dd>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                </div>
            ))}
        </dl>
    );
};
