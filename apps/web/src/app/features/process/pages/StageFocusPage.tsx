import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { AlertCircle, ArrowRight, ChevronRight, Loader2, MoreHorizontal, Pause, Play } from 'lucide-react';
import { toast } from 'sonner';

import { getNextAction, useActors, useChangeStageStatusMutation, useItem } from '@flows/flows';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
    Button,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    Separator,
} from '@flows/ui-kit';

import { EmbedBrowser } from '../components/EmbedBrowser';
import { NoteList } from '../components/NoteList';
import { StatusBadge } from '../components/StatusBadge';
import { TaskList } from '../components/TaskList';
import { ToolAction } from '../components/ToolAction';
import { useFlowExecution } from '../hooks/useFlowExecution';

import type { Status, ToolContext } from '@flows/flows';

export const StageFocusPage = () => {
    const { t } = useTranslation();
    const { id: itemId, stageId } = useParams<{ id: string; stageId: string }>();
    const navigate = useNavigate();
    const { data: itemData, isLoading } = useItem(itemId ?? null);
    const { data: actorsData } = useActors();
    const changeStatusMutation = useChangeStageStatusMutation();
    const [embedUrl, setEmbedUrl] = useState<string | null>(null);
    const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
    const flowExecution = useFlowExecution(stageId ?? '');
    const notesRef = useRef<HTMLDivElement>(null);

    const item = itemData?.data;
    const actors = actorsData?.data ?? [];
    const stage = item?.stages.find(s => s.id === stageId);

    const handleComplete = () => {
        if (!stage || !item) return;
        changeStatusMutation.mutate(
            { id: stage.id, input: { status: 'done' } },
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
            { id: stage.id, input: { status: newStatus } },
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

    const actorName = stage.actorId ? actors.find(a => a.id === stage.actorId)?.name : undefined;
    const unresolvedNotes = stage.notes.filter(n => !n.isResolved);
    const isIterative = stage.stereo === 'iterative';
    const nextAction = getNextAction(item);
    const hasNextStage = nextAction && nextAction.stage.id !== stage.id;
    const tasksDone = stage.tasks.filter(t => t.status === 'done').length;
    const tasksTotal = stage.tasks.length;
    const incompleteTasks = stage.tasks.filter(t => t.status !== 'done');

    const toolContext: ToolContext = {
        itemId: item.id,
        itemName: item.name,
        stageId: stage.id,
        stageName: stage.name,
    };

    return (
        <div className="space-y-5">
            {/* Breadcrumb — same pattern as ItemDetailPage */}
            <Breadcrumb>
                <BreadcrumbList>
                    <BreadcrumbItem>
                        <BreadcrumbLink asChild>
                            <Link to="/items">{t('navigator.items', 'Items')}</Link>
                        </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbLink asChild>
                            <Link to={`/items/${itemId}`}>{item.name}</Link>
                        </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbPage>{stage.name}</BreadcrumbPage>
                    </BreadcrumbItem>
                </BreadcrumbList>
            </Breadcrumb>

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
                    <div className="flex items-center gap-2">
                        <StatusBadge status={stage.status} />
                        {actorName && <span className="text-xs text-muted-foreground">{actorName}</span>}
                    </div>
                    <h1 className="mt-1 text-xl font-bold">{stage.name}</h1>
                    {stage.guideText && <p className="mt-1 text-sm text-muted-foreground">{stage.guideText}</p>}
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
                            {stage.status === 'hold' && (
                                <DropdownMenuItem onClick={() => handleStatusChange('todo')}>
                                    <Play className="mr-2 h-3.5 w-3.5" />
                                    {t('navigator.resume', 'Resume')}
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
                        className="flex w-full items-center gap-3 rounded-md border border-border/40 px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent/30"
                    >
                        <span className="text-xs text-muted-foreground">{t('navigator.nextStage', 'Next')}</span>
                        <span className="flex-1 font-medium">{nextAction.stage.name}</span>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                </>
            )}

            {/* Completed */}
            {stage.status === 'done' && (
                <>
                    <Separator />
                    <div className="flex items-center justify-between rounded-md bg-green-50 px-3 py-2.5 dark:bg-green-500/10">
                        <span className="text-sm font-medium text-green-700 dark:text-green-400">
                            {t('navigator.stageCompleted', 'Stage completed')}
                        </span>
                        {hasNextStage ? (
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 gap-1 text-xs text-green-700 dark:text-green-400"
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
                                variant="ghost"
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
                            {incompleteTasks.length > 0 && (
                                <span className="block">
                                    {t('navigator.incompleteTasksWarning', '{{count}} task(s) are not done yet.', {
                                        count: incompleteTasks.length,
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
