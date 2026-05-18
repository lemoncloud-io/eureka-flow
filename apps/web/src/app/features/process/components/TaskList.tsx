import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Eye, Pencil, Plus } from 'lucide-react';

import { useAddTaskMutation, useChangeTaskStatusMutation } from '@flows/flows';
import { Button, Input } from '@flows/ui-kit';

import { StatusBadge } from './StatusBadge';
import { useCurrentActor } from '../hooks/useCurrentActor';

import type { Status, Task } from '@flows/flows';

const NEXT_TASK_STATUS: Partial<Record<Status, Status>> = {
    todo: 'doing',
    doing: 'done',
};

interface TaskListProps {
    tasks: Task[];
    stageId: string;
    canAdd: boolean;
}

export const TaskList = ({ tasks, stageId, canAdd }: TaskListProps) => {
    const { t } = useTranslation();
    const [showForm, setShowForm] = useState(false);
    const [title, setTitle] = useState('');
    const addTaskMutation = useAddTaskMutation();
    const changeStatusMutation = useChangeTaskStatusMutation();
    const { currentActorId } = useCurrentActor();

    const handleAdd = () => {
        if (!title.trim()) return;
        addTaskMutation.mutate(
            { stageId, input: { title: title.trim(), authorId: currentActorId ?? undefined } },
            {
                onSuccess: () => {
                    setTitle('');
                    setShowForm(false);
                },
            }
        );
    };

    const handleStatusToggle = (task: Task) => {
        const nextStatus = NEXT_TASK_STATUS[task.status];
        if (!nextStatus) return;
        changeStatusMutation.mutate({
            id: task.id,
            input: { status: nextStatus, actorId: currentActorId ?? undefined },
        });
    };

    return (
        <div className="space-y-2">
            {tasks.length === 0 && !showForm && (
                <p className="py-4 text-center text-xs text-muted-foreground">
                    {t('navigator.noTasks', 'No tasks yet')}
                </p>
            )}
            {tasks.map(task => {
                const nextStatus = NEXT_TASK_STATUS[task.status];
                return (
                    <div key={task.id} className="flex items-center gap-3 rounded-md border border-border p-3">
                        <StatusBadge status={task.status} />
                        {task.stereo === 'review' && (
                            <Eye className="h-3.5 w-3.5 shrink-0 text-blue-500" title="Review" />
                        )}
                        {task.stereo === 'revision' && (
                            <Pencil className="h-3.5 w-3.5 shrink-0 text-orange-500" title="Revision" />
                        )}
                        <span className="text-sm flex-1 truncate">{task.title}</span>
                        {nextStatus && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs shrink-0"
                                onClick={() => handleStatusToggle(task)}
                                disabled={changeStatusMutation.isPending}
                            >
                                {nextStatus === 'doing'
                                    ? t('navigator.start', 'Start')
                                    : t('navigator.complete', 'Complete')}
                            </Button>
                        )}
                    </div>
                );
            })}
            {canAdd && !showForm && (
                <button
                    onClick={() => setShowForm(true)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border py-2 text-xs text-muted-foreground transition-colors hover:border-border/80 hover:text-foreground"
                >
                    <Plus className="h-3.5 w-3.5" />
                    {t('navigator.addTask', 'Add Task')}
                </button>
            )}
            {showForm && (
                <div className="flex gap-2">
                    <Input
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        placeholder={t('navigator.taskTitle', 'Task title...')}
                        className="flex-1"
                        autoFocus
                        onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    />
                    <Button size="sm" onClick={handleAdd} disabled={!title.trim() || addTaskMutation.isPending}>
                        {t('navigator.add', 'Add')}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                        {t('navigator.cancel', 'Cancel')}
                    </Button>
                </div>
            )}
        </div>
    );
};
