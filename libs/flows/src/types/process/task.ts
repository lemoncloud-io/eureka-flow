import type { Status, Timestamp } from './common';
import type { Note } from './note';

export interface Task {
    id: string;
    stageId: string;
    title: string;
    stereo: 'normal' | 'review' | 'revision';
    status: Status;
    actorId?: string;
    toolId?: string;
    guideText?: string;
    actionLabel?: string;
    notes: Note[];
    createdAt: Timestamp;
    updatedAt: Timestamp;
    completedAt?: Timestamp;
    completedByActorId?: string;
}
