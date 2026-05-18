import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import {
    AlertCircle,
    ArrowRight,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Loader2,
    MoreHorizontal,
    Pause,
    Play,
    RotateCcw,
    SkipForward,
} from 'lucide-react';
import { toast } from 'sonner';

import {
    getNextAction,
    useActors,
    useChangeStageStatusMutation,
    useHydrateItemStages,
    useItem,
    useUpdateStageMutation,
} from '@flows/flows';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    Button,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Separator,
} from '@flows/ui-kit';

import { EmbedBrowser } from '../components/EmbedBrowser';
import { NoteList } from '../components/NoteList';
import { StatusBadge } from '../components/StatusBadge';
import { TaskList } from '../components/TaskList';
import { ToolAction } from '../components/ToolAction';
import { useCurrentActor } from '../hooks/useCurrentActor';
import { useFlowExecution } from '../hooks/useFlowExecution';

import type { Stage, Status, ToolContext } from '@flows/flows';

export const StageFocusPage = () => {
    const { t } = useTranslation();
    const { id: itemId, stageId } = useParams<{ id: string; stageId: string }>();
    const navigate = useNavigate();
    const { data: itemData, isLoading } = useItem(itemId ?? null);
    useHydrateItemStages(itemData?.data);
    const { data: actorsData } = useActors();
    const changeStatusMutation = useChangeStageStatusMutation();
    const updateStageMutation = useUpdateStageMutation();
    const [embedUrl, setEmbedUrl] = useState<string | null>(null);
    const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
    const { currentActorId } = useCurrentActor();
    const flowExecution = useFlowExecution(stageId ?? '');
    const notesRef = useRef<HTMLDivElement>(null);

    const item = itemData?.data;
    const actors = actorsData?.data ?? [];
    const stage = item?.stages.find(s => s.id === stageId);

    const handleComplete = () => {
        if (!stage || !item) return;
        changeStatusMutation.mutate(
            { id: stage.id, input: { status: 'done', actorId: currentActorId ?? undefined } },
            {
                onSuccess: result => {
                    (result.warnings ?? []).forEach(w => toast.warning(w));
                    setShowCompleteConfirm(false);
                    const updatedItem = {
                        ...item,
                        stages: item.stages.map(s => (s.id === stage.id ? { ...s, status: 'done' as Status } : s)),
                    };
                    const next = getNextAction(updatedItem);
                    if (next) {
                        navigate(`/items/${itemId}/stages/${next.stage.id}`, { replace: true });
                    } else {
                        navigate(`/items/${itemId}`, { replace: true });
                    }
                },
            }
        );
    };

    const handleStatusChange = (newStatus: Status) => {
        if (!stage) return;
        changeStatusMutation.mutate(
            { id: stage.id, input: { status: newStatus, actorId: currentActorId ?? undefined } },
            { onSuccess: result => (result.warnings ?? []).forEach(w => toast.warning(w)) }
        );
    };

    const onCompleteClick = () => {
        if (!stage) return;
        if (stage.notes.some(n => !n.isResolved) || stage.tasks.some(t => t.status !== 'done')) {
            setShowCompleteConfirm(true);
        } else {
            handleComplete();
        }
    };

    const toolContext = useMemo<ToolContext>(
        () => ({
            itemId: item?.id ?? '',
            itemName: item?.name ?? '',
            stageId: stage?.id ?? '',
            stageName: stage?.name ?? '',
        }),
        [item?.id, item?.name, stage?.id, stage?.name]
    );

    if (embedUrl) {
        return <EmbedBrowser url={embedUrl} onClose={() => setEmbedUrl(null)} />;
    }

    if (isLoading || !item || !stage) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const unresolvedNotes = stage.notes.filter(n => !n.isResolved);
    const isIterative = stage.stereo === 'iterative';
    const nextAction = getNextAction(item);
    const hasNextStage = nextAction && nextAction.stage.id !== stage.id;
    const tasksDone = stage.tasks.filter(t => t.status === 'done').length;
    const tasksTotal = stage.tasks.length;
    const incompleteTaskCount = tasksTotal - tasksDone;
    const stageIndex = item.stages.findIndex(s => s.id === stageId);
    const prevStage = stageIndex > 0 ? item.stages[stageIndex - 1] : undefined;
    const nextStage = stageIndex < item.stages.length - 1 ? item.stages[stageIndex + 1] : undefined;

    const isDone = stage.status === 'done' || stage.status === 'skip';
    const incompleteDeps = stage.dependencyStageIds
        .map(depId => item.stages.find(s => s.id === depId))
        .filter((s): s is Stage => !!s && s.status !== 'done' && s.status !== 'skip');
    const warnings: { key: string; message: string }[] = [];
    if (!isDone && incompleteDeps.length > 0) {
        warnings.push({
            key: 'dep',
            message: t('navigator.depWarning', 'Depends on: {{names}}', {
                names: incompleteDeps.map(s => s.name).join(', '),
            }),
        });
    }
    if (!isDone && !stage.toolId && stage.stereo === 'flow') {
        warnings.push({ key: 'tool', message: t('navigator.noToolWarning', 'No automation tool linked') });
    }

    return (
        <div className="space-y-5">
            {/* Stage navigation */}
            <div className="flex items-center justify-between rounded-lg bg-muted/30 px-1 py-1">
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 max-w-[140px] gap-1 text-xs"
                    disabled={!prevStage}
                    onClick={() => prevStage && navigate(`/items/${itemId}/stages/${prevStage.id}`, { replace: true })}
                >
                    <ChevronLeft className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{prevStage?.name ?? t('navigator.prev', 'Prev')}</span>
                </Button>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                    {stageIndex + 1} / {item.stages.length}
                </span>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 max-w-[140px] gap-1 text-xs"
                    disabled={!nextStage}
                    onClick={() => nextStage && navigate(`/items/${itemId}/stages/${nextStage.id}`, { replace: true })}
                >
                    <span className="truncate">{nextStage?.name ?? t('navigator.next', 'Next')}</span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                </Button>
            </div>

            {/* Warnings — inform, never block */}
            {warnings.length > 0 && (
                <div className="space-y-1.5">
                    {warnings.map(w => (
                        <div
                            key={w.key}
                            className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-500/20 dark:bg-amber-500/5"
                        >
                            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                            <p className="text-sm text-amber-700 dark:text-amber-400">{w.message}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Unresolved alert */}
            {unresolvedNotes.length > 0 && (
                <div className="flex items-center gap-2 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 dark:border-orange-500/20 dark:bg-orange-500/5">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 text-orange-500" />
                    <p className="flex-1 truncate text-sm text-orange-700 dark:text-orange-400">
                        {unresolvedNotes.length} {t('navigator.unresolved', 'unresolved')} —{' '}
                        {unresolvedNotes[0].content}
                    </p>
                    <button
                        onClick={() => notesRef.current?.scrollIntoView({ behavior: 'smooth' })}
                        className="shrink-0 text-xs font-medium text-orange-600 hover:underline dark:text-orange-400"
                    >
                        {t('navigator.view', 'View')}
                    </button>
                </div>
            )}

            {/* Stage header + actions */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold sm:text-2xl">{stage.name}</h1>
                    <div className="mt-1 flex items-center gap-2">
                        <StatusBadge status={stage.status} />
                        <Select
                            value={stage.actorId || '__none__'}
                            onValueChange={val => {
                                const newActorId = val === '__none__' ? '' : val;
                                updateStageMutation.mutate({ id: stage.id, input: { actorId: newActorId } });
                            }}
                        >
                            <SelectTrigger className="h-6 w-auto gap-1 border-none bg-transparent px-1 text-xs text-muted-foreground shadow-none hover:bg-accent">
                                <SelectValue placeholder={t('navigator.assignActor', 'Assign actor')} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__none__">{t('navigator.unassigned', 'Unassigned')}</SelectItem>
                                {actors
                                    .filter(a => a.isActive)
                                    .map(a => (
                                        <SelectItem key={a.id} value={a.id}>
                                            {a.name}
                                        </SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>
                    </div>
                    {stage.guideText && (
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{stage.guideText}</p>
                    )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                    {stage.status === 'doing' && (
                        <Button size="sm" onClick={onCompleteClick} disabled={changeStatusMutation.isPending}>
                            {changeStatusMutation.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                            {t('navigator.complete', 'Complete')}
                        </Button>
                    )}
                    {stage.status === 'todo' && (
                        <Button
                            size="sm"
                            onClick={() => handleStatusChange('doing')}
                            disabled={changeStatusMutation.isPending}
                        >
                            {changeStatusMutation.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                            <Play className="mr-1 h-3.5 w-3.5" />
                            {t('navigator.start', 'Start')}
                        </Button>
                    )}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            {stage.status !== 'hold' && stage.status !== 'done' && stage.status !== 'skip' && (
                                <DropdownMenuItem onClick={() => handleStatusChange('hold')}>
                                    <Pause className="mr-2 h-3.5 w-3.5" />
                                    {t('navigator.hold', 'Hold')}
                                </DropdownMenuItem>
                            )}
                            {stage.status !== 'skip' && stage.status !== 'done' && (
                                <DropdownMenuItem onClick={() => handleStatusChange('skip')}>
                                    <SkipForward className="mr-2 h-3.5 w-3.5" />
                                    {t('navigator.skip', 'Skip')}
                                </DropdownMenuItem>
                            )}
                            {stage.status === 'hold' && (
                                <DropdownMenuItem onClick={() => handleStatusChange('todo')}>
                                    <Play className="mr-2 h-3.5 w-3.5" />
                                    {t('navigator.resume', 'Resume')}
                                </DropdownMenuItem>
                            )}
                            {(stage.status === 'done' || stage.status === 'skip') && (
                                <DropdownMenuItem onClick={() => handleStatusChange('todo')}>
                                    <RotateCcw className="mr-2 h-3.5 w-3.5" />
                                    {t('navigator.reopen', 'Reopen')}
                                </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* Tool */}
            {stage.toolId && (
                <ToolAction
                    toolId={stage.toolId}
                    context={toolContext}
                    onEmbed={setEmbedUrl}
                    onFlowExecute={flowExecution.execute}
                    flowState={{ status: flowExecution.status, error: flowExecution.error }}
                    onFlowReset={flowExecution.reset}
                />
            )}

            {/* Tasks */}
            {isIterative && (
                <>
                    <Separator />
                    <div>
                        <div className="mb-2 flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">
                                {t('navigator.tasks', 'Tasks')}
                            </span>
                            {tasksTotal > 0 && (
                                <div className="flex items-center gap-1.5">
                                    <span className="text-xs tabular-nums text-muted-foreground">
                                        {tasksDone}/{tasksTotal}
                                    </span>
                                    <div className="h-1 w-12 overflow-hidden rounded-full bg-muted">
                                        <div
                                            className="h-full rounded-full bg-primary transition-all duration-300"
                                            style={{ width: `${(tasksDone / tasksTotal) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                        <TaskList tasks={stage.tasks} stageId={stage.id} canAdd={isIterative} />
                    </div>
                </>
            )}

            {/* Notes */}
            <Separator />
            <div ref={notesRef}>
                <span className="mb-2 block text-xs font-medium text-muted-foreground">
                    {t('navigator.notes', 'Notes')} ({stage.notes.length})
                </span>
                <NoteList notes={stage.notes} stageId={stage.id} />
            </div>

            {/* Next stage */}
            {hasNextStage && stage.status !== 'done' && (
                <>
                    <Separator />
                    <button
                        onClick={() => navigate(`/items/${itemId}/stages/${nextAction.stage.id}`, { replace: true })}
                        className="group flex w-full items-center gap-3 rounded-lg border border-border/40 bg-muted/20 px-4 py-3 text-left text-sm transition-all duration-200 hover:bg-accent/40 hover:border-border"
                    >
                        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                        <div className="min-w-0 flex-1">
                            <p className="text-[11px] text-muted-foreground">{t('navigator.nextStage', 'Next')}</p>
                            <p className="truncate font-medium">{nextAction.stage.name}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                </>
            )}

            {/* Completed */}
            {stage.status === 'done' && (
                <>
                    <Separator />
                    <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-3 dark:border-green-500/20 dark:bg-green-500/10">
                        <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                            <span className="text-sm font-medium text-green-700 dark:text-green-400">
                                {t('navigator.stageCompleted', 'Stage completed')}
                            </span>
                        </div>
                        {hasNextStage ? (
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-7 gap-1 text-xs"
                                onClick={() =>
                                    navigate(`/items/${itemId}/stages/${nextAction.stage.id}`, { replace: true })
                                }
                            >
                                {t('navigator.nextStage', 'Next')}
                                <ArrowRight className="h-3 w-3" />
                            </Button>
                        ) : (
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => navigate(`/items/${itemId}`)}
                            >
                                {t('navigator.backToItem', 'Back')}
                            </Button>
                        )}
                    </div>
                </>
            )}

            {/* Complete confirmation */}
            <AlertDialog open={showCompleteConfirm} onOpenChange={setShowCompleteConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('navigator.completeAnyway', 'Complete this stage?')}</AlertDialogTitle>
                        <AlertDialogDescription className="space-y-1">
                            {incompleteTaskCount > 0 && (
                                <span className="block">
                                    {t('navigator.incompleteTasksWarning', '{{count}} task(s) are not done yet.', {
                                        count: incompleteTaskCount,
                                    })}
                                </span>
                            )}
                            {unresolvedNotes.length > 0 && (
                                <span className="block">
                                    {t('navigator.unresolvedNotesWarning', '{{count}} note(s) are still unresolved.', {
                                        count: unresolvedNotes.length,
                                    })}
                                </span>
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('navigator.cancel', 'Cancel')}</AlertDialogCancel>
                        <AlertDialogAction onClick={handleComplete} disabled={changeStatusMutation.isPending}>
                            {changeStatusMutation.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                            {t('navigator.completeAnyway', 'Complete anyway')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};
