import { useNavigate } from 'react-router-dom';

import { Check, Circle, Loader2, Pause, SkipForward } from 'lucide-react';

import { cn } from '@flows/lib/utils';

import type { Stage, Status } from '@flows/flows';

const STATUS_ICON: Record<Status, React.ElementType> = {
    todo: Circle,
    doing: Loader2,
    done: Check,
    hold: Pause,
    skip: SkipForward,
};

const STATUS_STYLE: Record<Status, { dot: string; line: string; label: string }> = {
    todo: {
        dot: 'border-border bg-background text-muted-foreground',
        line: 'bg-border',
        label: 'text-muted-foreground',
    },
    doing: { dot: 'border-blue-500 bg-blue-500 text-white', line: 'bg-border', label: 'text-foreground font-semibold' },
    done: { dot: 'border-green-500 bg-green-500 text-white', line: 'bg-green-500/40', label: 'text-muted-foreground' },
    hold: { dot: 'border-orange-500 bg-orange-500 text-white', line: 'bg-border', label: 'text-muted-foreground' },
    skip: { dot: 'border-muted bg-muted text-muted-foreground', line: 'bg-muted', label: 'text-muted-foreground/60' },
};

interface StageStepperProps {
    stages: Stage[];
    currentStageId: string;
    itemId: string;
}

export const StageStepper = ({ stages, currentStageId, itemId }: StageStepperProps) => {
    const navigate = useNavigate();

    return (
        <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5">
            <div className="flex items-center gap-0 overflow-x-auto">
                {stages.map((stage, i) => {
                    const isCurrent = stage.id === currentStageId;
                    const style = STATUS_STYLE[stage.status];
                    const Icon = STATUS_ICON[stage.status];
                    const isLast = i === stages.length - 1;

                    return (
                        <div key={stage.id} className="flex items-center min-w-0 flex-1">
                            <button
                                onClick={() => navigate(`/items/${itemId}/stages/${stage.id}`, { replace: true })}
                                className={cn(
                                    'flex items-center gap-2 min-w-0 px-2 py-1.5 rounded-md transition-colors',
                                    isCurrent ? 'bg-background shadow-sm' : 'hover:bg-background/60'
                                )}
                                title={stage.name}
                            >
                                <div
                                    className={cn(
                                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all',
                                        style.dot,
                                        isCurrent && stage.status === 'todo' && 'border-primary ring-2 ring-primary/20'
                                    )}
                                >
                                    <Icon className={cn('h-2.5 w-2.5', stage.status === 'doing' && 'animate-spin')} />
                                </div>
                                <span
                                    className={cn(
                                        'text-xs truncate max-w-[100px]',
                                        style.label,
                                        isCurrent && 'text-foreground font-medium'
                                    )}
                                >
                                    {stage.name || `Stage ${i + 1}`}
                                </span>
                            </button>
                            {!isLast && (
                                <div className="min-w-[16px] flex-1 flex items-center px-0.5">
                                    <div className={cn('h-px w-full', style.line)} />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
