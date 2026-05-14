import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import { AlertCircle, ArrowLeft, ArrowRight, ChevronRight, Loader2 } from 'lucide-react';
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
    Badge,
    Button,
    Separator,
} from '@flows/ui-kit';

import { EmbedBrowser } from '../components/EmbedBrowser';
import { NoteList } from '../components/NoteList';
import { StatusBadge } from '../components/StatusBadge';
import { TaskList } from '../components/TaskList';
import { ToolAction } from '../components/ToolAction';
import { NEXT_STATUS } from '../consts';
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

    const handleBack = () => {
        navigate(`/items/${itemId}?stage=${stageId}`);
    };

    const handleComplete = () => {
        if (!stage || !item) return;
        changeStatusMutation.mutate(
            { id: stage.id, input: { status: 'done' } },
            {
                onSuccess: result => {
                    const warnings = result.warnings ?? [];
                    warnings.forEach(w => toast.warning(w));
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
            {
                onSuccess: result => {
                    const warnings = result.warnings ?? [];
                    warnings.forEach(w => toast.warning(w));
                },
            }
        );
    };

    const onCompleteClick = () => {
        if (!stage) return;
        const unresolvedNotes = stage.notes.filter(n => !n.isResolved);
        const incompleteTasks = stage.tasks.filter(t => t.status !== 'done');
        if (unresolvedNotes.length > 0 || incompleteTasks.length > 0) {
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
            <div className="flex h-screen items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const actorName = stage.actorId ? actors.find(a => a.id === stage.actorId)?.name : undefined;
    const unresolvedNotes = stage.notes.filter(n => !n.isResolved);
    const nextStatus = NEXT_STATUS[stage.status];
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
        <div className="flex min-h-screen flex-col bg-background">
            {/* Header */}
            <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur-sm">
                <button
                    onClick={handleBack}
                    className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ArrowLeft className="h-4 w-4" />
                    <span className="hidden sm:inline">{item.name}</span>
                </button>
                <div className="flex items-center gap-2">
                    {stage.status === 'doing' && (
                        <Button onClick={onCompleteClick} disabled={changeStatusMutation.isPending} className="gap-2">
                            {changeStatusMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                            {t('navigator.complete', 'Complete')}
                        </Button>
                    )}
                    {stage.status === 'todo' && (
                        <Button onClick={() => handleStatusChange('doing')} disabled={changeStatusMutation.isPending}>
                            {changeStatusMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                            {t('navigator.start', 'Start')}
                        </Button>
                    )}
                </div>
            </header>

            {/* Unresolved alert banner */}
            {unresolvedNotes.length > 0 && (
                <div className="border-b border-orange-500/20 bg-orange-500/5">
                    <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3 sm:px-6">
                        <AlertCircle className="h-4 w-4 shrink-0 text-orange-500" />
                        <p className="flex-1 truncate text-sm">
                            <span className="font-medium">
                                {unresolvedNotes.length} {t('navigator.unresolved', 'unresolved')}
                            </span>
                            <span className="ml-1 text-muted-foreground">— {unresolvedNotes[0].content}</span>
                        </p>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="shrink-0 text-xs"
                            onClick={() => notesRef.current?.scrollIntoView({ behavior: 'smooth' })}
                        >
                            {t('navigator.view', 'View')}
                        </Button>
                    </div>
                </div>
            )}

            {/* Main content */}
            <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
                <div className="space-y-6">
                    {/* Stage header */}
                    <div>
                        <div className="flex items-center gap-2 text-sm">
                            <StatusBadge status={stage.status} />
                            {actorName && (
                                <Badge variant="outline" className="text-xs">
                                    {actorName}
                                </Badge>
                            )}
                        </div>
                        <h1 className="mt-3 text-3xl font-bold tracking-tight">{stage.name}</h1>
                        {stage.guideText && (
                            <p className="mt-2 text-base leading-relaxed text-muted-foreground">{stage.guideText}</p>
                        )}
                    </div>

                    {/* Tool CTA — prominent card */}
                    {stage.toolId && (
                        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                            <ToolAction
                                toolId={stage.toolId}
                                context={toolContext}
                                onEmbed={setEmbedUrl}
                                onFlowExecute={flowExecution.execute}
                                flowState={{ status: flowExecution.status, error: flowExecution.error }}
                            />
                        </div>
                    )}

                    {/* Tasks with progress */}
                    {isIterative && (
                        <>
                            <Separator />
                            <div>
                                <div className="mb-3 flex items-center justify-between">
                                    <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                                        {t('navigator.tasks', 'Tasks')}
                                    </h2>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <span className="tabular-nums">
                                            {tasksDone}/{tasksTotal}
                                        </span>
                                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                                            <div
                                                className="h-full rounded-full bg-primary transition-all duration-300"
                                                style={{
                                                    width: tasksTotal > 0 ? `${(tasksDone / tasksTotal) * 100}%` : '0%',
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                                <TaskList tasks={stage.tasks} stageId={stage.id} canAdd={isIterative} />
                            </div>
                        </>
                    )}

                    {/* Notes */}
                    <Separator />
                    <div ref={notesRef}>
                        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                            {t('navigator.notes', 'Notes')} ({stage.notes.length})
                        </h2>
                        <NoteList notes={stage.notes} stageId={stage.id} />
                    </div>

                    {/* Next stage hint */}
                    {hasNextStage && stage.status !== 'done' && (
                        <>
                            <Separator />
                            <button
                                onClick={() =>
                                    navigate(`/items/${itemId}/stages/${nextAction.stage.id}`, { replace: true })
                                }
                                className="flex w-full items-center gap-3 rounded-lg border border-border/50 p-4 text-left transition-all duration-200 hover:border-border hover:shadow-sm"
                            >
                                <div className="flex-1">
                                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                        {t('navigator.nextStage', 'Next stage')}
                                    </p>
                                    <p className="mt-0.5 text-sm font-medium">{nextAction.stage.name}</p>
                                </div>
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </button>
                        </>
                    )}

                    {/* Completed hint */}
                    {stage.status === 'done' && (
                        <>
                            <Separator />
                            <div className="flex items-center justify-between rounded-lg border border-green-500/20 bg-green-500/5 p-4">
                                <p className="text-sm font-medium text-green-600 dark:text-green-400">
                                    {t('navigator.stageCompleted', 'Stage completed')}
                                </p>
                                {hasNextStage ? (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="gap-1"
                                        onClick={() =>
                                            navigate(`/items/${itemId}/stages/${nextAction.stage.id}`, {
                                                replace: true,
                                            })
                                        }
                                    >
                                        {t('navigator.nextStage', 'Next stage')}
                                        <ArrowRight className="h-3.5 w-3.5" />
                                    </Button>
                                ) : (
                                    <Button size="sm" variant="outline" onClick={() => navigate(`/items/${itemId}`)}>
                                        {t('navigator.backToItem', 'Back to item')}
                                    </Button>
                                )}
                            </div>
                        </>
                    )}

                    {/* Hold — de-emphasized, bottom */}
                    {stage.status !== 'hold' && stage.status !== 'done' && stage.status !== 'skip' && (
                        <>
                            <Separator />
                            <div className="flex justify-center">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-muted-foreground/60 hover:text-muted-foreground"
                                    onClick={() => handleStatusChange('hold')}
                                >
                                    {t('navigator.holdStage', 'Put this stage on hold')}
                                </Button>
                            </div>
                        </>
                    )}
                    {stage.status === 'hold' && (
                        <>
                            <Separator />
                            <div className="flex justify-center">
                                <Button variant="outline" size="sm" onClick={() => handleStatusChange('todo')}>
                                    {t('navigator.resume', 'Resume')}
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </main>

            {/* Complete confirmation dialog */}
            <AlertDialog open={showCompleteConfirm} onOpenChange={setShowCompleteConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('navigator.completeAnyway', 'Complete this stage?')}</AlertDialogTitle>
                        <AlertDialogDescription className="space-y-2">
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
                            {changeStatusMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                            {t('navigator.completeAnyway', 'Complete anyway')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};
