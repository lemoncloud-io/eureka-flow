import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Circle, Loader2, Plus } from 'lucide-react';

import { useAddTaskMutation } from '@flows/flows';
import { Button, Input } from '@flows/ui-kit';

import { useCurrentActor } from '../hooks/useCurrentActor';

import type { Task } from '@flows/flows';

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

    return (
        <div className="space-y-2">
            {tasks.length === 0 && !showForm && (
                <p className="py-4 text-center text-xs text-muted-foreground">
                    {t('navigator.noTasks', 'No tasks yet')}
                </p>
            )}
            {tasks.map(task => (
                <div key={task.id} className="flex items-center gap-3 rounded-md border border-border p-3">
                    <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="text-sm flex-1 truncate">{task.title}</span>
                </div>
            ))}
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
                        {addTaskMutation.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
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
