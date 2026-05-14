import type { Timestamp } from './common';
import type { Stage } from './stage';

export interface Process {
    id: string;
    name: string;
    description: string;
    stereo: 'linear' | 'flexible';
    stages: Stage[];
    createdAt: Timestamp;
    updatedAt: Timestamp;
}
