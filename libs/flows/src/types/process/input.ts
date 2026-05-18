import type { Status } from './common';
import type { Note } from './note';
import type { Stage } from './stage';
import type { Task } from './task';

export interface CreateProcessInput {
    name: string;
    description: string;
    stereo: 'linear' | 'flexible';
    stages: CreateStageInput[];
}

export interface UpdateProcessInput {
    name?: string;
    description?: string;
    stages?: Stage[];
}

export interface CreateStageInput {
    name: string;
    stereo: 'simple' | 'iterative' | 'flow';
    guideText?: string;
    actionLabel?: string;
    actorId?: string;
    toolId?: string;
    isRequired: boolean;
    dependencyStageIds?: string[];
    order: number;
}

export interface UpdateStageInput {
    name?: string;
    guideText?: string;
    actionLabel?: string;
    actorId?: string;
    toolId?: string;
    isRequired?: boolean;
    dependencyStageIds?: string[];
    order?: number;
    tasks?: Task[];
    notes?: Note[];
}

export interface CreateItemInput {
    name: string;
    thumbnailUrl: string;
    processId: string;
}

export interface ChangeStatusInput {
    status: Status;
    actorId?: string;
}

export interface CreateNoteInput {
    content: string;
    authorId?: string;
    stereo?: 'comment' | 'issue' | 'request';
    targetActorId?: string;
}

export interface CreateTaskInput {
    title: string;
    authorId?: string;
    stereo?: 'normal' | 'review' | 'revision';
}

export interface CreateActorInput {
    name: string;
    color: string;
    stereo: 'person' | 'team' | 'vendor';
    memo?: string;
}

export interface CreateToolInput {
    name: string;
    stereo: 'link' | 'embed' | 'flow';
    actionLabel: string;
    urlTemplate?: string;
    flowRef?: { flowId: string };
    taskTemplates?: {
        id: string;
        title: string;
        guideText?: string;
        actionLabel?: string;
        toolId?: string;
        order: number;
    }[];
    memo?: string;
}
