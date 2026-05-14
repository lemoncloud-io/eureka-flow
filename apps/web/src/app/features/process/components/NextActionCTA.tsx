import { useTranslation } from 'react-i18next';

import { AlertCircle, ArrowRight, Play } from 'lucide-react';

import { cn } from '@flows/lib/utils';
import { Button, Card, CardContent } from '@flows/ui-kit';

import type { Item, NextAction, NextActionReason } from '@flows/flows';

const REASON_CONFIG: Record<
    NextActionReason,
    { icon: React.ElementType; labelKey: string; fallback: string; color: string }
> = {
    unresolved_notes: {
        icon: AlertCircle,
        labelKey: 'navigator.unresolvedNotes',
        fallback: 'Unresolved request',
        color: 'text-orange-500 dark:text-orange-400',
    },
    doing: {
        icon: Play,
        labelKey: 'navigator.inProgress',
        fallback: 'In progress',
        color: 'text-blue-500 dark:text-blue-400',
    },
    next_todo: {
        icon: ArrowRight,
        labelKey: 'navigator.nextAction',
        fallback: 'Next action',
        color: 'text-primary',
    },
};

interface NextActionCTAProps {
    item: Item;
    action: NextAction;
    onAction: (stageId: string) => void;
    compact?: boolean;
}

export const NextActionCTA = ({ item, action, onAction, compact }: NextActionCTAProps) => {
    const { t } = useTranslation();
    const config = REASON_CONFIG[action.reason];
    const Icon = config.icon;

    if (compact) {
        return (
            <button
                onClick={() => onAction(action.stage.id)}
                className="flex items-center gap-2 text-left text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
                <Icon className={cn('h-3.5 w-3.5 shrink-0', config.color)} />
                <span className="truncate">{action.stage.actionLabel || action.stage.name}</span>
            </button>
        );
    }

    return (
        <Card className="border-primary/20 bg-primary/5 hover:shadow-md transition-all duration-200">
            <CardContent className="flex items-center justify-between gap-4 p-4">
                <div className="flex items-center gap-3 min-w-0">
                    <Icon className={cn('h-5 w-5 shrink-0', config.color)} />
                    <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">
                            {item.name} · {t(config.labelKey, config.fallback)}
                        </p>
                        <p className="truncate font-medium">{action.stage.name}</p>
                    </div>
                </div>
                <Button size="sm" onClick={() => onAction(action.stage.id)} className="shrink-0">
                    {action.stage.actionLabel || t('navigator.openAction', 'Open')}
                </Button>
            </CardContent>
        </Card>
    );
};
