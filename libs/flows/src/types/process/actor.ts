import type { Timestamp } from './common';

export interface Actor {
    id: string;
    name: string;
    color: string;
    stereo: 'person' | 'team' | 'vendor';
    isActive: boolean;
    memo?: string;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}
