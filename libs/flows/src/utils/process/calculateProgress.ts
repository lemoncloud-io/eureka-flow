import type { Item } from '../../types/process';

export const isItemComplete = (item: Item): boolean =>
    item.stages.length > 0 && item.stages.every(s => s.status === 'done' || s.status === 'skip');

export const calculateProgress = (item: Item): number => {
    const required = item.stages.filter(s => s.isRequired && s.status !== 'skip');
    if (required.length === 0) return 0;
    const done = required.filter(s => s.status === 'done');
    return Math.round((done.length / required.length) * 100);
};
