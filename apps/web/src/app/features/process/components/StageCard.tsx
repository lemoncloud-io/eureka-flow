import { useTranslation } from 'react-i18next';

import { ChevronRight, MessageSquare } from 'lucide-react';

import { cn } from '@flows/lib/utils';
import { Badge, Button, Card, CardContent } from '@flows/ui-kit';

import { StatusBadge } from './StatusBadge';

import type { Stage, Status } from '@flows/flows';

const NEXT_STATUS: Partial<Record<Status, Status>> = {
    todo: 'doing',
    doing: 'done',
};

interface StageCardProps {
    stage: Stage;
    actorName?: string;
    unresolvedCount: number;
    onStatusChange: (stageId: string, status: Status) => void;
    onSelect: (stageId: string) => void;
}

export const StageCard = ({ stage, actorName, unresolvedCount, onStatusChange, onSelect }: StageCardProps) => {
    const { t } = useTranslation();
    const nextStatus = NEXT_STATUS[stage.status];

    return (
        <Card
            className={cn(
                'cursor-pointer transition-colors hover:bg-accent/30',
                stage.status === 'done' && 'opacity-60'
            )}
            onClick={() => onSelect(stage.id)}
        >
            <CardContent className="flex items-center gap-3 p-3 sm:p-4">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{stage.order}</span>
                        <span className="truncate font-medium text-sm">{stage.name}</span>
                        <StatusBadge status={stage.status} />
                        {unresolvedCount > 0 && (
                            <Badge variant="destructive" className="h-5 gap-0.5 px-1.5 text-xs">
                                <MessageSquare className="h-3 w-3" />
                                {unresolvedCount}
                            </Badge>
                        )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {actorName && <span>{actorName}</span>}
                        {stage.guideText && (
                            <>
                                {actorName && <span>·</span>}
                                <span className="truncate">{stage.guideText}</span>
                            </>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {nextStatus && (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={e => {
                                e.stopPropagation();
                                onStatusChange(stage.id, nextStatus);
                            }}
                        >
                            {nextStatus === 'doing'
                                ? t('navigator.start', 'Start')
                                : t('navigator.complete', 'Complete')}
                        </Button>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
            </CardContent>
        </Card>
    );
};
