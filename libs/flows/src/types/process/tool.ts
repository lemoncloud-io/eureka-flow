import type { Timestamp } from './common';

export interface TaskTemplate {
    id: string;
    title: string;
    guideText?: string;
    actionLabel?: string;
    toolId?: string;
    order: number;
}

export interface Tool {
    id: string;
    name: string;
    stereo: 'link' | 'embed' | 'flow';
    urlTemplate?: string;
    actionLabel: string;
    taskTemplates?: TaskTemplate[];
    flowRef?: { flowId: string };
    memo?: string;
    isActive: boolean;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}
