import type { Item, Stage } from '../../types/process';

export const getStageUnresolvedNotesCount = (stage: Stage): number => {
    const stageNotesCount = stage.notes.filter(n => !n.isResolved).length;
    const taskNotesCount = stage.tasks.reduce((sum, task) => sum + task.notes.filter(n => !n.isResolved).length, 0);
    return stageNotesCount + taskNotesCount;
};

export const getUnresolvedCount = (item: Item): number => {
    return item.stages.reduce((sum, stage) => sum + getStageUnresolvedNotesCount(stage), 0);
};
