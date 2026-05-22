import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
    AlertCircle,
    ArrowRight,
    CheckCircle2,
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
    getStageUnresolvedNotesCount,
    useChangeStageStatusMutation,
    useUpdateStageMutation,
} from '@flows/flows';
import {
    Badge,
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
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@flows/ui-kit';

import { EmbedBrowser } from './EmbedBrowser';
import { NoteList } from './NoteList';
import { STATUS_CONFIG, StatusBadge } from './StatusBadge';
import { TaskList } from './TaskList';
import { ToolAction } from './ToolAction';
import { useCurrentActor } from '../hooks/useCurrentActor';
import { useFlowExecution } from '../hooks/useFlowExecution';

import type { Actor, Item, Stage, Status, ToolContext } from '@flows/flows';

interface StageDetailPanelProps {
    item: Item | null;
    stageId: string | null;
    actors: Actor[];
    onClose: () => void;
    onSelectStage: (stageId: string) => void;
}

export const StageDetailPanel = ({ item, stageId, actors, onClose, onSelectStage }: StageDetailPanelProps) => {
    const { t } = useTranslation();
    const [embedUrl, setEmbedUrl] = useState<string | null>(null);
    const changeStatusMutation = useChangeStageStatusMutation();
    const updateStageMutation = useUpdateStageMutation();
    const { currentActorId } = useCurrentActor();
    const flowExecution = useFlowExecution(stageId ?? '');

    const stage = item?.stages.find(s => s.id === stageId) ?? null;
    const open = !!stage && !!item;

    const handleStatusChange = (newStatus: Status) => {
        if (!stage) return;
        changeStatusMutation.mutate(
            { id: stage.id, input: { status: newStatus, actorId: currentActorId ?? undefined } },
            {
                onSuccess: result => {
                    (result.warnings ?? []).forEach(w => toast.warning(w));
                    toast.success(`${stage.name} → ${STATUS_CONFIG[newStatus].label}`);
                },
            }
        );
    };

    if (embedUrl) {
        return <EmbedBrowser url={embedUrl} onClose={() => setEmbedUrl(null)} />;
    }

    if (!stage || !item) {
        return <Sheet open={open} onOpenChange={o => !o && onClose()} />;
    }

    const actorName = stage.actorId ? actors.find(a => a.id === stage.actorId)?.name : undefined;
    const unresolvedCount = getStageUnresolvedNotesCount(stage);
    const isIterative = stage.stereo === 'iterative';
    const isDone = stage.status === 'done' || stage.status === 'skip';
    const tasksDone = stage.tasks.filter(task => task.status === 'done').length;
    const tasksTotal = stage.tasks.length;

    const incompleteDeps = stage.dependencyStageIds
        .map(depId => item.stages.find(s => s.id === depId))
        .filter((s): s is Stage => !!s && s.status !== 'done' && s.status !== 'skip');

    const nextAction = getNextAction(item);
    const hasNextStage = nextAction && nextAction.stage.id !== stage.id;

    const toolContext: ToolContext = {
        itemId: item.id,
        itemName: item.name,
        stageId: stage.id,
        stageName: stage.name,
    };

    const activeActors = actors.filter(a => a.isActive || a.id === stage.actorId);

    return (
        <Sheet open={open} onOpenChange={o => !o && onClose()}>
            <SheetContent side="right" className="flex w-full flex-col sm:w-[460px] p-0">
                <SheetHeader className="shrink-0 px-6 pt-6 pb-3">
                    <StageHeaderActions
                        stage={stage}
                        actorName={actorName}
                        activeActors={activeActors}
                        unresolvedCount={unresolvedCount}
                        isPending={changeStatusMutation.isPending}
                        onStatusChange={handleStatusChange}
                        onActorChange={actorId => updateStageMutation.mutate({ id: stage.id, input: { actorId } })}
                    />
                </SheetHeader>

                <div className="flex-1 overflow-y-auto space-y-5 px-6 pb-6">
                    {/* Dependency warning — informational, never blocks */}
                    {!isDone && incompleteDeps.length > 0 && (
                        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-500/20 dark:bg-amber-500/5">
                            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                            <p className="text-sm text-amber-700 dark:text-amber-400">
                                {t('navigator.depWarning', 'Depends on: {{names}}', {
                                    names: incompleteDeps.map(s => s.name).join(', '),
                                })}
                            </p>
                        </div>
                    )}

                    {/* Guide */}
                    {stage.guideText && (
                        <p className="text-sm leading-relaxed text-muted-foreground">{stage.guideText}</p>
                    )}

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

                    {/* Tasks (iterative) */}
                    {isIterative && (
                        <>
                            <Separator />
                            <div>
                                <div className="mb-2 flex items-center justify-between">
                                    <span className="text-xs font-medium text-muted-foreground">
                                        {t('navigator.tasks', 'Tasks')}
                                    </span>
                                    {tasksTotal > 0 && (
                                        <span className="text-xs tabular-nums text-muted-foreground">
                                            {tasksDone}/{tasksTotal}
                                        </span>
                                    )}
                                </div>
                                <TaskList tasks={stage.tasks} stageId={stage.id} canAdd={isIterative} />
                            </div>
                        </>
                    )}

                    {/* Notes */}
                    <Separator />
                    <div>
                        <p className="mb-2 text-xs font-medium text-muted-foreground">
                            {t('navigator.notes', 'Notes')} {stage.notes.length > 0 && `(${stage.notes.length})`}
                        </p>
                        <NoteList notes={stage.notes} stageId={stage.id} />
                    </div>

                    {/* Completion banner */}
                    {stage.status === 'done' && (
                        <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 dark:border-green-500/20 dark:bg-green-500/10">
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                            <div className="flex-1">
                                <p className="text-sm font-medium text-green-700 dark:text-green-400">
                                    {t('navigator.stageCompleted', 'Stage completed')}
                                </p>
                                {(stage.completedAt || stage.completedByActorId) && (
                                    <p className="text-[11px] text-green-600/70 dark:text-green-400/60">
                                        {stage.completedByActorId &&
                                            actors.find(a => a.id === stage.completedByActorId)?.name}
                                        {stage.completedByActorId && stage.completedAt && ' · '}
                                        {stage.completedAt &&
                                            new Date(stage.completedAt).toLocaleString(undefined, {
                                                month: 'short',
                                                day: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit',
                                            })}
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Next stage CTA */}
                    {hasNextStage && stage.status !== 'done' && (
                        <button
                            onClick={() => onSelectStage(nextAction.stage.id)}
                            className="group flex w-full items-center gap-3 rounded-lg border border-border/40 bg-muted/20 px-4 py-3 text-left text-sm transition-all duration-200 hover:bg-accent/40 hover:border-border"
                        >
                            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                            <div className="min-w-0 flex-1">
                                <p className="text-[11px] text-muted-foreground">{t('navigator.nextStage', 'Next')}</p>
                                <p className="truncate font-medium">{nextAction.stage.name}</p>
                            </div>
                        </button>
                    )}
                </div>

                {/* Sticky footer — Mark as Done */}
                {stage.status !== 'done' && stage.status !== 'skip' && (
                    <div className="shrink-0 border-t border-border bg-background px-6 py-4">
                        <Button
                            className="w-full bg-emerald-500 text-white hover:bg-emerald-600"
                            onClick={() => handleStatusChange('done')}
                            disabled={changeStatusMutation.isPending}
                        >
                            {changeStatusMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {t('navigator.markAsDone', 'Mark as Done')}
                        </Button>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
};

interface StageHeaderActionsProps {
    stage: Stage;
    actorName: string | undefined;
    activeActors: Actor[];
    unresolvedCount: number;
    isPending: boolean;
    onStatusChange: (status: Status) => void;
    onActorChange: (actorId: string) => void;
}

const StageHeaderActions = ({
    stage,
    actorName,
    activeActors,
    unresolvedCount,
    isPending,
    onStatusChange,
    onActorChange,
}: StageHeaderActionsProps) => {
    const { t } = useTranslation();

    return (
        <>
            <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{stage.order}</span>
                <SheetTitle className="flex-1">{stage.name}</SheetTitle>
                <div className="flex shrink-0 items-center gap-1">
                    {stage.status === 'doing' && (
                        <Button size="sm" onClick={() => onStatusChange('done')} disabled={isPending}>
                            {isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                            {t('navigator.complete', 'Complete')}
                        </Button>
                    )}
                    {stage.status === 'todo' && (
                        <Button size="sm" onClick={() => onStatusChange('doing')} disabled={isPending}>
                            {isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
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
                                <DropdownMenuItem onClick={() => onStatusChange('hold')}>
                                    <Pause className="mr-2 h-3.5 w-3.5" />
                                    {t('navigator.hold', 'Hold')}
                                </DropdownMenuItem>
                            )}
                            {stage.status !== 'skip' && stage.status !== 'done' && (
                                <DropdownMenuItem onClick={() => onStatusChange('skip')}>
                                    <SkipForward className="mr-2 h-3.5 w-3.5" />
                                    {t('navigator.skip', 'Skip')}
                                </DropdownMenuItem>
                            )}
                            {stage.status === 'hold' && (
                                <DropdownMenuItem onClick={() => onStatusChange('todo')}>
                                    <Play className="mr-2 h-3.5 w-3.5" />
                                    {t('navigator.resume', 'Resume')}
                                </DropdownMenuItem>
                            )}
                            {(stage.status === 'done' || stage.status === 'skip') && (
                                <DropdownMenuItem onClick={() => onStatusChange('todo')}>
                                    <RotateCcw className="mr-2 h-3.5 w-3.5" />
                                    {t('navigator.reopen', 'Reopen')}
                                </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusBadge status={stage.status} />
                <Select
                    value={stage.actorId || '__none__'}
                    onValueChange={val => onActorChange(val === '__none__' ? '' : val)}
                >
                    <SelectTrigger className="h-6 w-auto gap-1 border-none bg-transparent px-1 text-xs text-muted-foreground shadow-none hover:bg-accent">
                        <SelectValue placeholder={t('navigator.assignActor', 'Assign actor')}>
                            {actorName ?? t('navigator.unassigned', 'Unassigned')}
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="__none__">{t('navigator.unassigned', 'Unassigned')}</SelectItem>
                        {activeActors.map(a => (
                            <SelectItem key={a.id} value={a.id}>
                                <span className="flex items-center gap-2">
                                    <span className={`h-2 w-2 rounded-full shrink-0 ${a.color}`} />
                                    {a.name}
                                </span>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {unresolvedCount > 0 && (
                    <Badge variant="destructive" className="text-xs">
                        {unresolvedCount} {t('navigator.unresolved', 'unresolved')}
                    </Badge>
                )}
            </div>
        </>
    );
};
