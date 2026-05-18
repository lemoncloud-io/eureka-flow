import { formatDistanceToNow } from 'date-fns';
import { MessageSquare } from 'lucide-react';

import { calculateProgress, getNextAction, getUnresolvedCount } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { Badge } from '@flows/ui-kit';

import { ProgressBar } from './ProgressBar';

import type { Item } from '@flows/flows';
import type { KeyboardEvent } from 'react';

interface ItemRowProps {
    item: Item;
    onClick: (id: string) => void;
}

export const ItemRow = ({ item, onClick }: ItemRowProps) => {
    const progress = calculateProgress(item);
    const nextAction = getNextAction(item);
    const unresolvedCount = getUnresolvedCount(item);
    const currentStage = item.stages.find(s => s.status === 'doing');
    const isComplete = item.stages.every(s => s.status === 'done' || s.status === 'skip');
    const hasDoing = item.stages.some(s => s.status === 'doing');
    const doneCount = item.stages.filter(s => s.status === 'done' || s.status === 'skip').length;
    const firstLetter = item.name.charAt(0).toUpperCase();

    const statusColor = isComplete
        ? 'bg-green-500'
        : hasDoing
          ? 'bg-blue-500'
          : unresolvedCount > 0
            ? 'bg-orange-500'
            : 'bg-muted-foreground/40';

    const stageName = currentStage?.name ?? nextAction?.stage.name;
    const timeAgo = formatDistanceToNow(item.updatedAt, { addSuffix: false });

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick(item.id);
        }
    };

    return (
        <div
            role="button"
            tabIndex={0}
            className={cn(
                'flex items-center gap-4 border-b border-border/50 px-4 py-3 cursor-pointer transition-colors duration-150',
                'hover:bg-accent/30 focus-visible:bg-accent/30 focus-visible:outline-none',
                isComplete && 'opacity-60'
            )}
            onClick={() => onClick(item.id)}
            onKeyDown={handleKeyDown}
        >
            {/* Status dot */}
            <div className={cn('h-2 w-2 shrink-0 rounded-full', statusColor)} />

            {/* Thumbnail */}
            {item.thumbnailUrl ? (
                <img src={item.thumbnailUrl} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
            ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-primary/10 text-xs font-bold text-primary">
                    {firstLetter}
                </div>
            )}

            {/* Name + current stage */}
            <div className="min-w-0 flex-1">
                <span
                    className={cn('block truncate text-sm font-medium', isComplete && 'line-through decoration-1')}
                    title={item.name}
                >
                    {item.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                    {stageName ? `${stageName} · ` : ''}
                    {doneCount}/{item.stages.length} stages
                </span>
            </div>

            {/* Progress */}
            <div className="flex items-center gap-2">
                <ProgressBar value={progress} className="h-1 w-12 sm:w-16" />
                <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">{progress}%</span>
            </div>

            {/* Unresolved */}
            {unresolvedCount > 0 && (
                <Badge variant="destructive" className="h-5 gap-0.5 px-1.5 text-xs shrink-0">
                    <MessageSquare className="h-3 w-3" />
                    {unresolvedCount}
                </Badge>
            )}

            {/* Time */}
            <span className="hidden text-xs text-muted-foreground/60 lg:inline">{timeAgo}</span>
        </div>
    );
};
