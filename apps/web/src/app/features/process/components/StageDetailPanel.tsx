import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Maximize2 } from 'lucide-react';
import { toast } from 'sonner';

import { getStageUnresolvedNotesCount, useChangeStageStatusMutation } from '@flows/flows';
import { Badge, Button, Separator, Sheet, SheetContent, SheetHeader, SheetTitle } from '@flows/ui-kit';

import { EmbedBrowser } from './EmbedBrowser';
import { NoteList } from './NoteList';
import { StatusBadge } from './StatusBadge';
import { TaskList } from './TaskList';
import { ToolAction } from './ToolAction';
import { NEXT_STATUS } from '../consts';
import { useFlowExecution } from '../hooks/useFlowExecution';

import type { Actor, Stage, Status, ToolContext } from '@flows/flows';

interface StageDetailPanelProps {
    stage: Stage | null;
    actors: Actor[];
    itemName: string;
    onClose: () => void;
}

export const StageDetailPanel = ({ stage, actors, itemName, onClose }: StageDetailPanelProps) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [embedUrl, setEmbedUrl] = useState<string | null>(null);
    const changeStatusMutation = useChangeStageStatusMutation();
    const flowExecution = useFlowExecution(stage?.id ?? '');

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

    if (embedUrl) {
        return <EmbedBrowser url={embedUrl} onClose={() => setEmbedUrl(null)} />;
    }

    const actorName = stage?.actorId ? actors.find(a => a.id === stage.actorId)?.name : undefined;
    const unresolvedCount = stage ? getStageUnresolvedNotesCount(stage) : 0;
    const nextStatus = stage ? NEXT_STATUS[stage.status] : undefined;
    const isIterative = stage?.stereo === 'iterative';

    const toolContext: ToolContext = {
        itemId: stage?.itemId,
        itemName,
        stageId: stage?.id,
        stageName: stage?.name,
    };

    return (
        <Sheet open={!!stage} onOpenChange={open => !open && onClose()}>
            <SheetContent side="right" className="w-full sm:w-[420px] overflow-y-auto p-0">
                {stage && (
                    <>
                        <SheetHeader className="px-6 pt-6 pb-4">
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">{stage.order}</span>
                                <SheetTitle className="flex-1">{stage.name}</SheetTitle>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 shrink-0"
                                    onClick={() => navigate(`/items/${stage.itemId}/stages/${stage.id}`)}
                                    title={t('navigator.focusMode', 'Focus mode')}
                                >
                                    <Maximize2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                                <StatusBadge status={stage.status} />
                                {actorName && (
                                    <Badge variant="outline" className="text-xs">
                                        {actorName}
                                    </Badge>
                                )}
                                {unresolvedCount > 0 && (
                                    <Badge variant="destructive" className="text-xs">
                                        {unresolvedCount} {t('navigator.unresolved', 'unresolved')}
                                    </Badge>
                                )}
                            </div>
                        </SheetHeader>

                        <div className="px-6 pb-6 space-y-6">
                            {/* Guide text */}
                            {stage.guideText && <p className="text-sm text-muted-foreground">{stage.guideText}</p>}

                            {/* Actions row */}
                            <div className="flex flex-wrap items-center gap-2">
                                {nextStatus && (
                                    <Button size="sm" onClick={() => handleStatusChange(nextStatus)}>
                                        {nextStatus === 'doing'
                                            ? t('navigator.start', 'Start')
                                            : t('navigator.complete', 'Complete')}
                                    </Button>
                                )}
                                {stage.status !== 'hold' && stage.status !== 'done' && (
                                    <Button variant="outline" size="sm" onClick={() => handleStatusChange('hold')}>
                                        {t('navigator.hold', 'Hold')}
                                    </Button>
                                )}
                                {stage.status === 'hold' && (
                                    <Button variant="outline" size="sm" onClick={() => handleStatusChange('todo')}>
                                        {t('navigator.resume', 'Resume')}
                                    </Button>
                                )}
                                {stage.toolId && (
                                    <ToolAction
                                        toolId={stage.toolId}
                                        context={toolContext}
                                        onEmbed={setEmbedUrl}
                                        onFlowExecute={flowExecution.execute}
                                        flowState={{ status: flowExecution.status, error: flowExecution.error }}
                                    />
                                )}
                            </div>

                            {/* Tasks section (iterative stages only) */}
                            {isIterative && (
                                <>
                                    <Separator />
                                    <div>
                                        <h3 className="text-sm font-medium mb-2">
                                            {t('navigator.tasks', 'Tasks')} ({stage.tasks.length})
                                        </h3>
                                        <TaskList tasks={stage.tasks} stageId={stage.id} canAdd={isIterative} />
                                    </div>
                                </>
                            )}

                            {/* Notes section */}
                            <Separator />
                            <div>
                                <h3 className="text-sm font-medium mb-2">
                                    {t('navigator.notes', 'Notes')} ({stage.notes.length})
                                </h3>
                                <NoteList notes={stage.notes} stageId={stage.id} />
                            </div>
                        </div>
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
};
