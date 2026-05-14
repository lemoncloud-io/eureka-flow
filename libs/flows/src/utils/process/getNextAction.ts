import { getStageUnresolvedNotesCount } from './getUnresolvedCount';

import type { Item, Stage } from '../../types/process';

export type NextActionReason = 'unresolved_notes' | 'doing' | 'next_todo';

export interface NextAction {
    stage: Stage;
    reason: NextActionReason;
}

export const getNextAction = (item: Item): NextAction | undefined => {
    const { stages } = item;

    // Priority 1: unresolved notes
    const stageWithNotes = stages.find(s => getStageUnresolvedNotesCount(s) > 0);
    if (stageWithNotes) return { stage: stageWithNotes, reason: 'unresolved_notes' };

    // Priority 2: currently doing
    const doingStage = stages.find(s => s.status === 'doing');
    if (doingStage) return { stage: doingStage, reason: 'doing' };

    // Priority 3: next required todo
    const todoStage = stages.find(s => s.status === 'todo' && s.isRequired);
    if (todoStage) return { stage: todoStage, reason: 'next_todo' };

    return undefined;
};
