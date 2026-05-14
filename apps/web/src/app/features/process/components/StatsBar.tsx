import { useTranslation } from 'react-i18next';

import { AlertCircle, CheckCircle2, Loader2, Package } from 'lucide-react';

import { getUnresolvedCount } from '@flows/flows';
import { Card, CardContent } from '@flows/ui-kit';

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
        { icon: Package, label: t('navigator.totalItems', 'Total'), value: total },
        { icon: Loader2, label: t('navigator.inProgress', 'In Progress'), value: inProgress },
        { icon: CheckCircle2, label: t('navigator.completed', 'Completed'), value: completed },
        { icon: AlertCircle, label: t('navigator.unresolvedNotes', 'Unresolved'), value: unresolvedNotes },
    ];

    return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map(({ icon: Icon, label, value }) => (
                <Card key={label}>
                    <CardContent className="flex items-center gap-3 p-3">
                        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div>
                            <p className="text-lg font-bold">{value}</p>
                            <p className="text-xs text-muted-foreground">{label}</p>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
};
