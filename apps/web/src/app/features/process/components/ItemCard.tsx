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
    const firstLetter = item.name.charAt(0).toUpperCase();

    return (
        <Card className="cursor-pointer transition-colors hover:bg-accent/30" onClick={() => onClick(item.id)}>
            <CardContent className="p-4">
                <div className="flex items-start gap-3">
                    {item.thumbnailUrl ? (
                        <img src={item.thumbnailUrl} alt={item.name} className="h-12 w-12 rounded-lg object-cover" />
                    ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold">
                            {firstLetter}
                        </div>
                    )}
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                            <h3 className="truncate font-medium">{item.name}</h3>
                            {unresolvedCount > 0 && (
                                <Badge variant="destructive" className="h-5 gap-0.5 px-1.5 text-xs shrink-0">
                                    <MessageSquare className="h-3 w-3" />
                                    {unresolvedCount}
                                </Badge>
                            )}
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                            <ProgressBar value={progress} className="flex-1" />
                            <span className="text-xs text-muted-foreground shrink-0">{progress}%</span>
                        </div>
                        <div
                            className={cn(
                                'mt-1.5 text-xs text-muted-foreground',
                                !currentStage && !nextAction && 'hidden'
                            )}
                        >
                            {currentStage && <span>{currentStage.name}</span>}
                            {nextAction && !currentStage && (
                                <span>{nextAction.stage.actionLabel || nextAction.stage.name}</span>
                            )}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};
