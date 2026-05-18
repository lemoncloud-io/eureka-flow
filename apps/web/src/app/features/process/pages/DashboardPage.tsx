import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { ArrowRight, CheckCircle2, Compass, Sparkles } from 'lucide-react';

import { getNextAction, useItems } from '@flows/flows';
import { Button, Card, CardContent } from '@flows/ui-kit';

import { ActorWorkload } from '../components/ActorWorkload';
import { EmptyState } from '../components/EmptyState';
import { NextActionCTA } from '../components/NextActionCTA';
import { StatsBar } from '../components/StatsBar';
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

const AllCaughtUp = () => {
    const { t } = useTranslation();

    return (
        <Card className="border-dashed">
            <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-500/10">
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                    <p className="font-medium">{t('navigator.allCaughtUp', 'All caught up')}</p>
                    <p className="text-sm text-muted-foreground">
                        {t('navigator.noActions', 'No pending actions right now.')}
                    </p>
                </div>
            </CardContent>
        </Card>
    );
};

const ActorPromptBanner = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    return (
        <div className="flex items-center gap-3 rounded-md border border-dashed border-border bg-muted/30 px-4 py-2.5">
            <Compass className="h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="flex-1 text-sm text-muted-foreground">
                {t('navigator.selectIdentityHint', 'Choose an actor to see your personalized next actions.')}
            </p>
            <Button variant="outline" size="sm" onClick={() => navigate('/actors')} className="h-7 shrink-0 text-xs">
                {t('navigator.chooseActor', 'Choose')}
            </Button>
        </div>
    );
};

export const DashboardPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { data: itemsData, isLoading } = useItems();
    const { handleTrySample, isPending: trySamplePending } = useTrySample();
    const { currentActor, setCurrentActor } = useCurrentActor();

    const items = itemsData?.data ?? [];

    const allItemsWithActions = useMemo(
        () =>
            items
                .filter(item => !item.stages.every(s => s.status === 'done' || s.status === 'skip'))
                .map(item => ({ item, action: getNextAction(item) }))
                .filter(
                    (entry): entry is { item: typeof entry.item; action: NonNullable<typeof entry.action> } =>
                        !!entry.action
                ),
        [items]
    );

    const itemsWithActions = useMemo(() => {
        if (!currentActor) return allItemsWithActions;
        const mine = allItemsWithActions.filter(e => e.action.stage.actorId === currentActor.id);
        const others = allItemsWithActions.filter(e => e.action.stage.actorId !== currentActor.id);
        return [...mine, ...others];
    }, [allItemsWithActions, currentActor]);

    const handleAction = (itemId: string, stageId: string) => {
        navigate(`/items/${itemId}/stages/${stageId}`);
    };

    if (isLoading) {
        return (
            <div className="space-y-4">
                <div className="h-24 animate-pulse rounded-xl bg-muted" />
                <div className="space-y-3">
                    {Array.from({ length: 2 }).map((_, i) => (
                        <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
                    ))}
                </div>
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">{t('navigator.dashboard', 'Dashboard')}</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {t('navigator.welcomeMessage', 'Welcome to your workflow navigator.')}
                    </p>
                </div>
                <EmptyState onTrySample={handleTrySample} isLoading={trySamplePending} />
            </div>
        );
    }

    const [heroEntry, ...restActions] = itemsWithActions;

    return (
        <div className="space-y-5">
            {/* Actor prompt or active filter */}
            {!currentActor ? (
                <ActorPromptBanner />
            ) : (
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

            {/* Hero: always show most urgent action */}
            {heroEntry ? (
                <HeroAction
                    item={heroEntry.item}
                    action={heroEntry.action}
                    onAction={() => handleAction(heroEntry.item.id, heroEntry.action.stage.id)}
                />
            ) : (
                <AllCaughtUp />
            )}

            {/* More actions */}
            {restActions.length > 0 && (
                <div className="space-y-2">
                    <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                        <Sparkles className="h-3.5 w-3.5" />
                        {t('navigator.moreActions', 'More actions')}
                        <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                            {restActions.length}
                        </span>
                    </h2>
                    <div className="space-y-2">
                        {restActions.map(({ item, action }) => (
                            <NextActionCTA
                                key={item.id}
                                item={item}
                                action={action}
                                onAction={stageId => handleAction(item.id, stageId)}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Stats — secondary info, below actions */}
            <StatsBar items={items} />

            {/* Team workload */}
            <ActorWorkload />
        </div>
    );
};
