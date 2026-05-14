import { MessageSquare } from 'lucide-react';

import { calculateProgress, getNextAction, getUnresolvedCount } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { Badge, Card, CardContent } from '@flows/ui-kit';

import { ProgressBar } from './ProgressBar';

import type { Item } from '@flows/flows';

interface ItemCardProps {
    item: Item;
    onClick: (id: string) => void;
}

export const ItemCard = ({ item, onClick }: ItemCardProps) => {
    const progress = calculateProgress(item);
    const nextAction = getNextAction(item);
    const unresolvedCount = getUnresolvedCount(item);
    const currentStage = item.stages.find(s => s.status === 'doing');
    const isComplete = item.stages.every(s => s.status === 'done' || s.status === 'skip');
    const firstLetter = item.name.charAt(0).toUpperCase();

    return (
        <Card
            className={cn(
                'cursor-pointer transition-all duration-200 hover:shadow-md',
                isComplete
                    ? 'border-green-500/20 opacity-70 hover:opacity-90'
                    : unresolvedCount > 0
                      ? 'border-orange-500/30 hover:border-orange-500/50'
                      : currentStage
                        ? 'border-blue-500/20 hover:border-blue-500/40'
                        : 'hover:border-border/80'
            )}
            onClick={() => onClick(item.id)}
        >
            <CardContent className="p-4">
                <div className="flex items-start gap-3">
                    {item.thumbnailUrl ? (
                        <img src={item.thumbnailUrl} alt={item.name} className="h-12 w-12 rounded-lg object-cover" />
                    ) : (
                        <div
                            className={cn(
                                'flex h-12 w-12 items-center justify-center rounded-lg font-bold text-lg',
                                isComplete
                                    ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                                    : 'bg-primary/10 text-primary'
                            )}
                        >
                            {firstLetter}
                        </div>
                    )}
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                            <h3
                                className={cn('truncate font-medium', isComplete && 'line-through decoration-1')}
                                title={item.name}
                            >
                                {item.name}
                            </h3>
                            {unresolvedCount > 0 && (
                                <Badge variant="destructive" className="h-5 gap-0.5 px-1.5 text-xs shrink-0">
                                    <MessageSquare className="h-3 w-3" />
                                    {unresolvedCount}
                                </Badge>
                            )}
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                            <ProgressBar value={progress} className="flex-1" />
                            <span className="text-xs tabular-nums text-muted-foreground shrink-0">{progress}%</span>
                        </div>
                        {(currentStage || nextAction) && (
                            <p className="mt-1.5 truncate text-xs text-muted-foreground">
                                {currentStage
                                    ? currentStage.name
                                    : nextAction
                                      ? nextAction.stage.actionLabel || nextAction.stage.name
                                      : null}
                            </p>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};
