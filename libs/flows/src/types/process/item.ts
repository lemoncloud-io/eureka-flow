import type { Timestamp } from './common';
import type { Stage } from './stage';

export interface Item {
    id: string;
    processId: string;
    name: string;
    thumbnailUrl: string;
    stages: Stage[];
    memo?: string;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}
