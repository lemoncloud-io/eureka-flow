import { useTranslation } from 'react-i18next';

import { formatDistanceToNow } from 'date-fns';
import { Check, ChevronRight, Circle, Loader2, MessageSquare, Pause, Repeat, Zap } from 'lucide-react';

import { cn } from '@flows/lib/utils';
import { Badge, Button } from '@flows/ui-kit';

import { NEXT_STATUS } from '../consts';

import type { Stage, Status } from '@flows/flows';
import type { LucideIcon } from 'lucide-react';

const STATUS_NODE: Record<Status, { icon: LucideIcon; ring: string; bg: string; iconColor: string }> = {
    todo: { icon: Circle, ring: 'ring-border', bg: 'bg-background', iconColor: 'text-muted-foreground' },
    doing: { icon: Loader2, ring: 'ring-blue-500', bg: 'bg-blue-500', iconColor: 'text-white' },
    done: { icon: Check, ring: 'ring-green-500', bg: 'bg-green-500', iconColor: 'text-white' },
    hold: { icon: Pause, ring: 'ring-orange-500', bg: 'bg-orange-500', iconColor: 'text-white' },
    skip: { icon: Circle, ring: 'ring-muted', bg: 'bg-muted', iconColor: 'text-muted-foreground' },
};

interface StageCardProps {
    stage: Stage;
    actorName?: string;
    unresolvedCount: number;
    isStatusChangePending?: boolean;
    isLast?: boolean;
    dependencyNames?: string[];
    onStatusChange: (stageId: string, status: Status) => void;
    onSelect: (stageId: string) => void;
}

export const StageCard = ({
    stage,
    actorName,
    unresolvedCount,
    isStatusChangePending,
    isLast,
    dependencyNames,
    onStatusChange,
    onSelect,
}: StageCardProps) => {
    const { t } = useTranslation();
    const nextStatus = NEXT_STATUS[stage.status];
    const node = STATUS_NODE[stage.status];
    const NodeIcon = node.icon;
    const isDone = stage.status === 'done' || stage.status === 'skip';
    const isActive = stage.status === 'doing';

    return (
        <div
            role="button"
            tabIndex={0}
            className="relative flex gap-4"
            onClick={() => onSelect(stage.id)}
            onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(stage.id);
                }
            }}
        >
            {/* Timeline connector */}
            <div className="flex flex-col items-center">
                <div
                    className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-2 transition-all duration-300',
                        node.ring,
                        isActive || isDone ? node.bg : 'bg-background'
                    )}
                >
                    <NodeIcon className={cn('h-4 w-4', node.iconColor, isActive && 'animate-spin')} />
                </div>
                {!isLast && (
                    <div className={cn('w-px flex-1 min-h-[24px]', isDone ? 'bg-green-500/40' : 'bg-border')} />
                )}
            </div>

            {/* Content */}
            <div
                className={cn(
                    'group flex-1 cursor-pointer rounded-lg border px-4 py-4 transition-all duration-200',
                    isActive
                        ? 'border-blue-500/30 bg-blue-500/5 shadow-sm'
                        : isDone
                          ? 'border-transparent bg-transparent opacity-60 hover:opacity-80 hover:bg-muted/30'
                          : 'border-border/50 bg-card hover:shadow-md hover:border-border/80'
                )}
            >
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <span className={cn('text-sm font-semibold', isDone && 'line-through decoration-1')}>
                                {stage.name}
                            </span>
                            {stage.stereo === 'iterative' && (
                                <Repeat className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Iterative" />
                            )}
                            {stage.stereo === 'flow' && (
                                <Zap className="h-3 w-3 shrink-0 text-amber-500" aria-label="Automated" />
                            )}
                            {unresolvedCount > 0 && (
                                <Badge variant="destructive" className="h-5 gap-0.5 px-1.5 text-xs">
                                    <MessageSquare className="h-3 w-3" />
                                    {unresolvedCount}
                                </Badge>
                            )}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                            {actorName && <span className="font-medium">{actorName}</span>}
                            {stage.guideText && (
                                <>
                                    {actorName && <span>·</span>}
                                    <span className="truncate">{stage.guideText}</span>
                                </>
                            )}
                        </div>
                        {dependencyNames && dependencyNames.length > 0 && stage.status === 'todo' && (
                            <p className="mt-0.5 text-[10px] text-muted-foreground/60">
                                Requires: {dependencyNames.join(', ')}
                            </p>
                        )}
                        {isDone && stage.completedAt && (
                            <p className="mt-0.5 text-[10px] text-muted-foreground/60">
                                {formatDistanceToNow(stage.completedAt, { addSuffix: true })}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {nextStatus && (
                            <Button
                                size="sm"
                                variant={isActive ? 'default' : 'outline'}
                                disabled={isStatusChangePending}
                                onClick={e => {
                                    e.stopPropagation();
                                    onStatusChange(stage.id, nextStatus);
                                }}
                                className="h-7 text-xs"
                            >
                                {isStatusChangePending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                                {nextStatus === 'doing'
                                    ? t('navigator.start', 'Start')
                                    : t('navigator.complete', 'Complete')}
                            </Button>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                </div>
            </div>
        </div>
    );
};
