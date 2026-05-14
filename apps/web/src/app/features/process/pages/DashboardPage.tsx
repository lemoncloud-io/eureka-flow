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

interface HeroActionProps {
    item: Item;
    action: NextAction;
    onAction: () => void;
}

const HeroAction = ({ item, action, onAction }: HeroActionProps) => {
    const { t } = useTranslation();

    return (
        <div
            className="relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/8 via-primary/3 to-transparent p-6 sm:p-8 cursor-pointer transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:border-primary/30"
            onClick={onAction}
        >
            <div className="relative z-10">
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary/60">
                    {t('navigator.nextUp', 'Next up')}
                </p>
                <h2 className="mb-2 text-2xl font-bold tracking-tight sm:text-3xl">{action.stage.name}</h2>
                <p className="mb-5 max-w-lg text-sm leading-relaxed text-muted-foreground">
                    {item.name} · {action.stage.guideText || t('navigator.readyToStart', 'Ready to start')}
                </p>
                <Button size="lg" className="gap-2 rounded-xl font-semibold">
                    {action.stage.actionLabel || t('navigator.openAction', 'Open')}
                    <ArrowRight className="h-4 w-4" />
                </Button>
            </div>
            {/* Decorative circle */}
            <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/5 blur-2xl" />
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

const CurrentActorPrompt = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    return (
        <Card className="border-dashed border-primary/30">
            <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Compass className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                    <p className="font-medium">{t('navigator.selectIdentity', 'Select your role')}</p>
                    <p className="text-sm text-muted-foreground">
                        {t('navigator.selectIdentityHint', 'Choose an actor to see your personalized next actions.')}
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => navigate('/actors')} className="shrink-0">
                    {t('navigator.chooseActor', 'Choose')}
                </Button>
            </CardContent>
        </Card>
    );
};

export const DashboardPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { data: itemsData, isLoading } = useItems();
    const { handleTrySample, isPending: trySamplePending } = useTrySample();
    const { currentActor } = useCurrentActor();

    const items = itemsData?.data ?? [];

    const itemsWithActions = useMemo(
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

    const handleAction = (itemId: string, stageId: string) => {
        navigate(`/items/${itemId}/stages/${stageId}`);
    };

    if (isLoading) {
        return (
            <div className="space-y-4">
                <div className="h-24 animate-pulse rounded-xl bg-muted" />
                <div className="h-12 animate-pulse rounded-lg bg-muted" />
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
        <div className="space-y-6">
            {/* Hero: most urgent action or prompt */}
            {!currentActor ? (
                <CurrentActorPrompt />
            ) : heroEntry ? (
                <HeroAction
                    item={heroEntry.item}
                    action={heroEntry.action}
                    onAction={() => handleAction(heroEntry.item.id, heroEntry.action.stage.id)}
                />
            ) : (
                <AllCaughtUp />
            )}

            {/* Stats — compact inline */}
            <StatsBar items={items} />

            {/* Remaining actions */}
            {restActions.length > 0 && (
                <div className="space-y-3">
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

            {/* Team workload */}
            <ActorWorkload />
        </div>
    );
};
