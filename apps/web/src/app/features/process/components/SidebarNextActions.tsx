import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { AlertCircle, ArrowRight, Play, UserCircle } from 'lucide-react';

import { getNextAction, useItems } from '@flows/flows';
import { cn } from '@flows/lib/utils';

import { useCurrentActor } from '../hooks/useCurrentActor';

import type { Item, NextActionReason } from '@flows/flows';

const MAX_ITEMS = 5;

const REASON_ICON: Record<NextActionReason, React.ElementType> = {
    unresolved_notes: AlertCircle,
    doing: Play,
    next_todo: ArrowRight,
};

const REASON_COLOR: Record<NextActionReason, string> = {
    unresolved_notes: 'text-orange-500',
    doing: 'text-blue-500',
    next_todo: 'text-muted-foreground',
};

export const SidebarNextActions = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { currentActor, currentActorId } = useCurrentActor();
    const { data: itemsData } = useItems();
    const items = itemsData?.data ?? [];

    const actionsForActor = useMemo(() => {
        if (!currentActorId) return [];
        return items
            .map(item => {
                const action = getNextAction(item);
                if (!action) return null;
                if (action.stage.actorId !== currentActorId) return null;
                return { item, action };
            })
            .filter(Boolean) as { item: Item; action: NonNullable<ReturnType<typeof getNextAction>> }[];
    }, [items, currentActorId]);

    if (!currentActorId) {
        return (
            <div className="px-4 py-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <UserCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>{t('navigator.selectActorFirst', 'Select an actor to see your next actions')}</span>
                </div>
            </div>
        );
    }

    const displayed = actionsForActor.slice(0, MAX_ITEMS);

    return (
        <div className="px-2 py-3">
            <p className="px-2 mb-2 text-xs font-medium text-muted-foreground">
                {t('navigator.myNextActions', 'My Next Actions')}
                {currentActor && <span className="ml-1 opacity-60">· {currentActor.name}</span>}
            </p>
            {displayed.length === 0 ? (
                <p className="px-2 text-xs text-muted-foreground/60">
                    {t('navigator.noActionsForActor', 'No pending actions for you.')}
                </p>
            ) : (
                <div className="space-y-0.5">
                    {displayed.map(({ item, action }) => {
                        const Icon = REASON_ICON[action.reason];
                        return (
                            <button
                                key={`${item.id}-${action.stage.id}`}
                                onClick={() => navigate(`/items/${item.id}/stages/${action.stage.id}`)}
                                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent/50 transition-colors"
                            >
                                <Icon className={cn('h-3 w-3 shrink-0', REASON_COLOR[action.reason])} />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate font-medium">{action.stage.name}</p>
                                    <p className="truncate text-muted-foreground/60">{item.name}</p>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
            {actionsForActor.length > MAX_ITEMS && (
                <button
                    onClick={() => navigate('/dashboard')}
                    className="mt-1 px-2 text-xs text-primary hover:underline"
                >
                    {t('navigator.viewAll', 'View all')} ({actionsForActor.length})
                </button>
            )}
        </div>
    );
};
