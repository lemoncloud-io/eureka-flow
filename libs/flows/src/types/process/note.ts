import type { Timestamp } from './common';

export interface Note {
    id: string;
    stageId?: string;
    taskId?: string;
    content: string;
    stereo: 'comment' | 'issue' | 'request';
    actorId?: string;
    targetActorId?: string;
    isResolved: boolean;
    createdAt: Timestamp;
    updatedAt: Timestamp;
    resolvedAt?: Timestamp;
    resolvedByActorId?: string;
}
