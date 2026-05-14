import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

import {
    calculateProgress,
    getNextAction,
    getStageUnresolvedNotesCount,
    useActors,
    useChangeStageStatusMutation,
    useItem,
} from '@flows/flows';
import { Button } from '@flows/ui-kit';

import { NextActionCTA } from '../components/NextActionCTA';
import { ProgressBar } from '../components/ProgressBar';
import { StageCard } from '../components/StageCard';

import type { Status } from '@flows/flows';

export const ItemDetailPage = () => {
    const { t } = useTranslation();
    const { id } = useParams<{ id: string }>();
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const { data: itemData, isLoading } = useItem(id ?? null);
    const { data: actorsData } = useActors();
    const changeStatusMutation = useChangeStageStatusMutation();

    const item = itemData?.data;
    const actors = actorsData?.data ?? [];
    const selectedStageId = searchParams.get('stage');
    const actorMap = useMemo(() => new Map(actors.map(a => [a.id, a.name])), [actors]);

    const handleStatusChange = (stageId: string, status: Status) => {
        changeStatusMutation.mutate(
            { id: stageId, input: { status } },
            {
                onSuccess: result => {
                    const warnings = result.warnings ?? [];
                    if (warnings.length > 0) {
                        warnings.forEach(w => toast.warning(w));
                    }
                },
            }
        );
    };

    const handleStageSelect = (stageId: string) => {
        setSearchParams(prev => {
            if (prev.get('stage') === stageId) {
                prev.delete('stage');
            } else {
                prev.set('stage', stageId);
            }
            return prev;
        });
    };

    if (isLoading || !item) {
        return (
            <div className="space-y-6">
                <div className="h-8 w-48 animate-pulse rounded bg-muted" />
                <div className="h-4 w-full animate-pulse rounded bg-muted" />
                <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
                    ))}
                </div>
            </div>
        );
    }

    const progress = calculateProgress(item);
    const nextAction = getNextAction(item);
    const getActorName = (actorId?: string) => (actorId ? actorMap.get(actorId) : undefined);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start gap-4">
                <Button variant="ghost" size="icon" className="mt-0.5 shrink-0" onClick={() => navigate('/items')}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex min-w-0 flex-1 items-start gap-4">
                    {item.thumbnailUrl ? (
                        <img
                            src={item.thumbnailUrl}
                            alt={item.name}
                            className="h-16 w-16 rounded-lg object-cover shrink-0"
                        />
                    ) : (
                        <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-primary/10 text-primary text-xl font-bold shrink-0">
                            {item.name.charAt(0).toUpperCase()}
                        </div>
                    )}
                    <div className="min-w-0 flex-1">
                        <h1 className="text-2xl font-bold truncate">{item.name}</h1>
                        <div className="mt-2 flex items-center gap-3">
                            <ProgressBar value={progress} className="flex-1 max-w-xs" />
                            <span className="text-sm text-muted-foreground shrink-0">{progress}%</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Next Action */}
            {nextAction && (
                <NextActionCTA item={item} action={nextAction} onAction={stageId => handleStageSelect(stageId)} />
            )}

            {/* Stage List */}
            <div className="space-y-2">
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    {t('navigator.stages', 'Stages')} ({item.stages.length})
                </h2>
                <div className="space-y-2">
                    {item.stages.map(stage => (
                        <StageCard
                            key={stage.id}
                            stage={stage}
                            actorName={getActorName(stage.actorId)}
                            unresolvedCount={getStageUnresolvedNotesCount(stage)}
                            onStatusChange={handleStatusChange}
                            onSelect={handleStageSelect}
                        />
                    ))}
                </div>
            </div>

            {/* Selected stage detail placeholder */}
            {selectedStageId && (
                <div className="rounded-lg border border-dashed border-border p-6 text-center">
                    <p className="text-sm text-muted-foreground">
                        {t('navigator.stageDetailPlaceholder', 'Stage Detail Panel — coming in Phase 4')}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground/60">Stage: {selectedStageId}</p>
                </div>
            )}
        </div>
    );
};
