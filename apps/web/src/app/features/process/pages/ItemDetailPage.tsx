import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { CheckCircle2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import {
    calculateProgress,
    getNextAction,
    getStageUnresolvedNotesCount,
    isItemComplete,
    useActors,
    useChangeStageStatusMutation,
    useDeleteItemMutation,
    useHydrateItemStages,
    useItem,
} from '@flows/flows';
import { cn } from '@flows/lib/utils';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
    Button,
} from '@flows/ui-kit';

import { ItemNotesList } from '../components/ItemNotesList';
import { NextActionCTA } from '../components/NextActionCTA';
import { ProgressBar } from '../components/ProgressBar';
import { StageCard } from '../components/StageCard';
import { StageDetailPanel } from '../components/StageDetailPanel';
import { STATUS_CONFIG } from '../components/StatusBadge';

import type { Status } from '@flows/flows';

export const ItemDetailPage = () => {
    const { t } = useTranslation();
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { data: itemData, isLoading } = useItem(id ?? null);
    const { data: actorsData } = useActors();
    const changeStatusMutation = useChangeStageStatusMutation();
    const deleteItemMutation = useDeleteItemMutation();
    const [activeTab, setActiveTab] = useState<'stages' | 'notes'>('stages');

    const selectedStageId = searchParams.get('stage');

    const handleDelete = () => {
        if (!id) return;
        deleteItemMutation.mutate(id, {
            onSuccess: () => {
                navigate('/items', { replace: true });
                toast.success(t('navigator.itemDeleted', 'Item deleted'));
            },
        });
    };

    const item = itemData?.data;
    useHydrateItemStages(item);
    const actors = useMemo(() => actorsData?.data ?? [], [actorsData?.data]);
    const actorMap = useMemo(() => new Map(actors.map(a => [a.id, a.name])), [actors]);

    const handleStatusChange = (stageId: string, status: Status) => {
        const stageName = item?.stages.find(s => s.id === stageId)?.name ?? '';
        changeStatusMutation.mutate(
            { id: stageId, input: { status } },
            {
                onSuccess: result => {
                    (result.warnings ?? []).forEach(w => toast.warning(w));
                    toast.success(`${stageName} → ${STATUS_CONFIG[status].label}`);
                },
            }
        );
    };

    const handleStageSelect = useCallback(
        (stageId: string) => {
            const params = new URLSearchParams(searchParams);
            params.set('stage', stageId);
            setSearchParams(params, { replace: false });
        },
        [searchParams, setSearchParams]
    );

    const handleStageClose = useCallback(() => {
        const params = new URLSearchParams(searchParams);
        params.delete('stage');
        setSearchParams(params, { replace: true });
    }, [searchParams, setSearchParams]);

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
    const currentStage = item.stages.find(s => s.status === 'doing');
    const totalNoteCount = item.stages.reduce((sum, s) => sum + s.notes.length, 0);
    const stageNameMap = new Map(item.stages.map(s => [s.id, s.name]));

    return (
        <div className="space-y-5">
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
                        <span className="tabular-nums">{progress}%</span>
                        <ProgressBar value={progress} className="h-1.5 w-24" />
                    </div>
                </div>
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="shrink-0 text-muted-foreground hover:text-destructive"
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>{t('navigator.deleteItem', 'Delete item?')}</AlertDialogTitle>
                            <AlertDialogDescription>
                                {t(
                                    'navigator.deleteItemDesc',
                                    'This will permanently delete "{{name}}" and all its stages.',
                                    { name: item.name }
                                )}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={handleDelete}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                                {t('common.delete', 'Delete')}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>

            {isItemComplete(item) && (
                <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 dark:border-green-500/20 dark:bg-green-500/10">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                    <p className="text-sm font-medium text-green-700 dark:text-green-400">
                        {t('navigator.itemComplete', 'All stages completed')}
                    </p>
                </div>
            )}

            {nextAction && (
                <NextActionCTA item={item} action={nextAction} onAction={stageId => handleStageSelect(stageId)} />
            )}

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

            {activeTab === 'stages' && (
                <div>
                    {item.stages.map((stage, index) => (
                        <StageCard
                            key={stage.id}
                            stage={stage}
                            actorName={actorMap.get(stage.actorId ?? '')}
                            unresolvedCount={getStageUnresolvedNotesCount(stage)}
                            isStatusChangePending={changeStatusMutation.isPending}
                            isLast={index === item.stages.length - 1}
                            dependencyNames={
                                stage.dependencyStageIds.map(id => stageNameMap.get(id)).filter(Boolean) as string[]
                            }
                            onStatusChange={handleStatusChange}
                            onSelect={handleStageSelect}
                        />
                    ))}
                </div>
            )}
            {activeTab === 'notes' && <ItemNotesList stages={item.stages} />}

            <StageDetailPanel
                item={item}
                stageId={selectedStageId}
                actors={actors}
                onClose={handleStageClose}
                onSelectStage={handleStageSelect}
            />
        </div>
    );
};
