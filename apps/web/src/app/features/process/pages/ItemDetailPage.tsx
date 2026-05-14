import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { toast } from 'sonner';

import {
    calculateProgress,
    getNextAction,
    getStageUnresolvedNotesCount,
    useActors,
    useChangeStageStatusMutation,
    useItem,
} from '@flows/flows';
import { cn } from '@flows/lib/utils';
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from '@flows/ui-kit';

import { ItemNotesList } from '../components/ItemNotesList';
import { NextActionCTA } from '../components/NextActionCTA';
import { ProgressBar } from '../components/ProgressBar';
import { StageCard } from '../components/StageCard';
import { StageDetailPanel } from '../components/StageDetailPanel';

import type { Status } from '@flows/flows';

export const ItemDetailPage = () => {
    const { t } = useTranslation();
    const { id } = useParams<{ id: string }>();
    const [searchParams, setSearchParams] = useSearchParams();
    const { data: itemData, isLoading } = useItem(id ?? null);
    const { data: actorsData } = useActors();
    const changeStatusMutation = useChangeStageStatusMutation();
    const [activeTab, setActiveTab] = useState<'stages' | 'notes'>('stages');

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
                <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                <div className="h-10 w-48 animate-pulse rounded bg-muted" />
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
    const currentStage = item.stages.find(s => s.status === 'doing');
    const totalNoteCount = item.stages.reduce((sum, s) => sum + s.notes.length, 0);

    return (
        <div className="space-y-6">
            {/* Breadcrumb */}
            <Breadcrumb>
                <BreadcrumbList>
                    <BreadcrumbItem>
                        <BreadcrumbLink asChild>
                            <Link to="/items">{t('navigator.items', 'Items')}</Link>
                        </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbPage>{item.name}</BreadcrumbPage>
                    </BreadcrumbItem>
                </BreadcrumbList>
            </Breadcrumb>

            {/* Compact Header */}
            <div className="flex items-center gap-4">
                {item.thumbnailUrl ? (
                    <img
                        src={item.thumbnailUrl}
                        alt={item.name}
                        className="h-10 w-10 shrink-0 rounded-lg object-cover"
                    />
                ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold">
                        {item.name.charAt(0).toUpperCase()}
                    </div>
                )}
                <div className="min-w-0 flex-1">
                    <h1 className="text-xl font-bold truncate">{item.name}</h1>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        {currentStage && <span>{currentStage.name}</span>}
                        {currentStage && <span>·</span>}
                        <span>{progress}%</span>
                        <ProgressBar value={progress} className="h-1.5 w-24" />
                    </div>
                </div>
            </div>

            {/* Next Action */}
            {nextAction && (
                <NextActionCTA item={item} action={nextAction} onAction={stageId => handleStageSelect(stageId)} />
            )}

            {/* Tab Navigation */}
            <div className="border-b border-border">
                <div className="flex gap-0">
                    <button
                        onClick={() => setActiveTab('stages')}
                        className={cn(
                            'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                            activeTab === 'stages'
                                ? 'border-primary text-foreground'
                                : 'border-transparent text-muted-foreground hover:text-foreground'
                        )}
                    >
                        {t('navigator.stages', 'Stages')} ({item.stages.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('notes')}
                        className={cn(
                            'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                            activeTab === 'notes'
                                ? 'border-primary text-foreground'
                                : 'border-transparent text-muted-foreground hover:text-foreground'
                        )}
                    >
                        {t('navigator.notes', 'Notes')} ({totalNoteCount})
                    </button>
                </div>
            </div>

            {/* Tab Content */}
            {activeTab === 'stages' && (
                <div>
                    {item.stages.map((stage, index) => (
                        <StageCard
                            key={stage.id}
                            stage={stage}
                            actorName={getActorName(stage.actorId)}
                            unresolvedCount={getStageUnresolvedNotesCount(stage)}
                            isStatusChangePending={changeStatusMutation.isPending}
                            isLast={index === item.stages.length - 1}
                            onStatusChange={handleStatusChange}
                            onSelect={handleStageSelect}
                        />
                    ))}
                </div>
            )}
            {activeTab === 'notes' && <ItemNotesList stages={item.stages} />}

            {/* Stage Detail Panel */}
            <StageDetailPanel
                stage={item.stages.find(s => s.id === selectedStageId) ?? null}
                actors={actors}
                itemName={item.name}
                onClose={() =>
                    setSearchParams(prev => {
                        prev.delete('stage');
                        return prev;
                    })
                }
            />
        </div>
    );
};
