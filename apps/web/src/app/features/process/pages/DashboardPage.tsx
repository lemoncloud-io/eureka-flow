import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { CheckCircle } from 'lucide-react';

import {
    calculateProgress,
    getNextAction,
    getStageUnresolvedNotesCount,
    getUnresolvedCount,
    useActors,
    useItems,
} from '@flows/flows';
import { cn } from '@flows/lib/utils';

import { ProgressBar } from '../components/ProgressBar';

import type { Item, NextAction } from '@flows/flows';

interface NextEntry {
    item: Item;
    nextData: NextAction;
}

export const DashboardPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { data: itemsData, isLoading } = useItems();
    const { data: actorsData } = useActors();
    const [selectedActorId, setSelectedActorId] = useState<string | null>(null);

    const filteredItems = useMemo(() => {
        const items = itemsData?.data ?? [];
        if (!selectedActorId) return items;
        return items.filter(item =>
            item.stages.some(
                s =>
                    s.actorId === selectedActorId ||
                    s.tasks.some(task => task.actorId === selectedActorId) ||
                    s.notes.some(note => note.targetActorId === selectedActorId && !note.isResolved)
            )
        );
    }, [itemsData?.data, selectedActorId]);

    const ongoingItems = useMemo(() => filteredItems.filter(item => calculateProgress(item) < 100), [filteredItems]);
    const doneItems = useMemo(() => filteredItems.filter(item => calculateProgress(item) === 100), [filteredItems]);
    const unresolvedCount = useMemo(
        () => filteredItems.reduce((sum, item) => sum + getUnresolvedCount(item), 0),
        [filteredItems]
    );

    const nextActions = useMemo<NextEntry[]>(
        () =>
            ongoingItems
                .map(item => ({ item, nextData: getNextAction(item) }))
                .filter((entry): entry is NextEntry => !!entry.nextData),
        [ongoingItems]
    );

    const actorWorkCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const entry of nextActions) {
            const actorId = entry.nextData.stage.actorId;
            if (actorId) counts[actorId] = (counts[actorId] ?? 0) + 1;
        }
        return counts;
    }, [nextActions]);

    const actors = useMemo(() => actorsData?.data ?? [], [actorsData?.data]);
    const activeActors = useMemo(() => actors.filter(a => a.isActive), [actors]);

    if (isLoading) {
        return (
            <div className="space-y-6">
                <div className="h-10 w-64 animate-pulse rounded-lg bg-muted" />
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Actor filter */}
            <div className="flex flex-wrap gap-1.5">
                <button
                    onClick={() => setSelectedActorId(null)}
                    className={cn(
                        'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                        !selectedActorId
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
                    )}
                >
                    {t('common.all', 'All')}
                </button>
                {activeActors.map(actor => (
                    <button
                        key={actor.id}
                        onClick={() => setSelectedActorId(actor.id)}
                        className={cn(
                            'flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                            selectedActorId === actor.id
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
                        )}
                    >
                        <span className={cn('h-2 w-2 rounded-full', actor.color)} />
                        {actor.name}
                    </button>
                ))}
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard label={t('dashboard.total', 'Total Items')} value={filteredItems.length} />
                <StatCard label={t('dashboard.doing', 'Doing')} value={ongoingItems.length} tone="blue" />
                <StatCard label={t('dashboard.doneItems', 'Done')} value={doneItems.length} tone="green" />
                <StatCard label={t('dashboard.requests', 'Requests')} value={unresolvedCount} tone="rose" />
            </div>

            {/* Next Actions + Team Workload */}
            <div className="grid gap-6 lg:grid-cols-12">
                <section className="rounded-xl border border-border bg-card lg:col-span-8">
                    <header className="flex items-center justify-between border-b border-border px-5 py-4">
                        <h3 className="text-base font-semibold">
                            {t('dashboard.activeActions', 'Active Action Needed')}
                        </h3>
                        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                            {nextActions.length} {t('dashboard.pending', 'PENDING')}
                        </span>
                    </header>
                    <div className="space-y-3 p-4">
                        {nextActions.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                <CheckCircle className="mb-3 h-10 w-10 text-muted-foreground/40" />
                                <p className="font-medium text-muted-foreground">
                                    {t('dashboard.allCaughtUp', "You're all caught up!")}
                                </p>
                                <p className="text-sm text-muted-foreground/70">
                                    {t('dashboard.noMandatory', 'No mandatory next actions.')}
                                </p>
                            </div>
                        ) : (
                            nextActions.map(({ item, nextData }) => (
                                <NextActionRow
                                    key={item.id}
                                    item={item}
                                    nextAction={nextData}
                                    onClick={() => navigate(`/items/${item.id}`)}
                                />
                            ))
                        )}
                    </div>
                </section>

                <aside className="rounded-xl border border-border bg-card lg:col-span-4">
                    <header className="border-b border-border px-5 py-4">
                        <h3 className="text-base font-semibold">{t('dashboard.teamWorkload', 'Team Workload')}</h3>
                    </header>
                    <div className="space-y-2 p-4">
                        {actors
                            .filter(a => a.isActive || actorWorkCounts[a.id])
                            .map(actor => (
                                <div
                                    key={actor.id}
                                    className="flex items-center justify-between rounded-md border border-border/50 bg-background px-3 py-2"
                                >
                                    <div className="flex items-center gap-2.5">
                                        <span className={cn('h-2.5 w-2.5 rounded-full', actor.color)} />
                                        <span className="text-sm font-medium">{actor.name}</span>
                                        {!actor.isActive && (
                                            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                                                {t('dashboard.off', 'Off')}
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-xs tabular-nums text-muted-foreground">
                                        {actorWorkCounts[actor.id] ?? 0} {t('dashboard.tasks', 'tasks')}
                                    </span>
                                </div>
                            ))}
                    </div>
                </aside>
            </div>
        </div>
    );
};

interface StatCardProps {
    label: string;
    value: number;
    tone?: 'blue' | 'green' | 'rose';
}

const TONE_CLASSES: Record<NonNullable<StatCardProps['tone']>, string> = {
    blue: 'text-blue-500 dark:text-blue-400',
    green: 'text-emerald-500 dark:text-emerald-400',
    rose: 'text-rose-500 dark:text-rose-400',
};

const StatCard = ({ label, value, tone }: StatCardProps) => (
    <div className="rounded-xl border border-border bg-card p-5">
        <p
            className={cn(
                'mb-1 text-xs font-semibold uppercase tracking-wider',
                tone ? TONE_CLASSES[tone] : 'text-muted-foreground'
            )}
        >
            {label}
        </p>
        <p className="text-3xl font-bold tabular-nums">{value}</p>
    </div>
);

interface NextActionRowProps {
    item: Item;
    nextAction: NextAction;
    onClick: () => void;
}

const NextActionRow = ({ item, nextAction, onClick }: NextActionRowProps) => {
    const { t } = useTranslation();
    const { stage } = nextAction;
    const progress = calculateProgress(item);
    const unresolved = getStageUnresolvedNotesCount(stage);

    return (
        <button
            onClick={onClick}
            className="group block w-full rounded-lg border border-border bg-background p-4 text-left transition-colors hover:border-primary/40 hover:bg-accent/30"
        >
            <div className="flex items-start gap-4">
                {item.thumbnailUrl ? (
                    <img src={item.thumbnailUrl} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-muted text-lg font-bold">
                        {item.name.charAt(0).toUpperCase()}
                    </div>
                )}
                <div className="min-w-0 flex-1">
                    <h4 className="mb-1 truncate font-semibold group-hover:text-primary">{item.name}</h4>
                    <p className="mb-2 text-xs text-muted-foreground">{stage.name}</p>
                    <ProgressBar value={progress} className="h-1.5" />
                    <div className="mt-2 flex items-center justify-between text-[11px] font-medium">
                        <span className="text-muted-foreground">
                            {progress}% {t('dashboard.donePct', 'DONE')}
                        </span>
                        {unresolved > 0 ? (
                            <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-rose-500">
                                {unresolved} {t('dashboard.requests', 'REQUESTS')}
                            </span>
                        ) : (
                            <span className="text-muted-foreground">
                                {t('dashboard.next', 'NEXT')}: {stage.name}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </button>
    );
};
