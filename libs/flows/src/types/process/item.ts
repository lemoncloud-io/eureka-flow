import type { Timestamp } from './common';
import type { Stage } from './stage';

export interface Item {
    id: string;
    processId: string;
    name: string;
    thumbnailUrl: string;
    stages: Stage[];
    memo?: string;
    $meta?: Record<string, string | null>;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}
