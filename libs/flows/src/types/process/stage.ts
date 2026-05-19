import type { Status, Timestamp } from './common';
import type { Note } from './note';
import type { Task } from './task';

export interface Stage {
    id: string;
    itemId: string;
    processId: string;
    name: string;
    stereo: 'simple' | 'iterative' | 'flow';
    status: Status;
    actorId?: string;
    guideText?: string;
    actionLabel?: string;
    toolId?: string;
    dependencyStageIds: string[];
    isRequired: boolean;
    order: number;
    tasks: Task[];
    notes: Note[];
    createdAt: Timestamp;
    updatedAt: Timestamp;
    completedAt?: Timestamp;
    completedByActorId?: string;
}
