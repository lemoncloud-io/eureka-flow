import type { Status } from '@flows/flows';

export const NEXT_STATUS: Partial<Record<Status, Status>> = {
    todo: 'doing',
    doing: 'done',
};
