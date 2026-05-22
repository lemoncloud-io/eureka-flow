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
    // For 'link'/'embed': URL with {itemId}/{stageId}/etc placeholders.
    // For 'flow': flowId of the connected workflow (server has no flowRef field).
    urlTemplate?: string;
    actionLabel: string;
    taskTemplates?: TaskTemplate[];
    memo?: string;
    isActive: boolean;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}
