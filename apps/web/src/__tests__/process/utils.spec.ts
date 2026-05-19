import { describe, expect, it } from 'vitest';

import {
    calculateProgress,
    generateToolUrl,
    getNextAction,
    getStageUnresolvedNotesCount,
    getUnresolvedCount,
} from '@flows/flows';

import type { Item, Stage } from '@flows/flows';

const makeStage = (overrides: Partial<Stage> = {}): Stage => ({
    id: 'stage-1',
    itemId: 'item-1',
    processId: 'process-1',
    name: 'Test Stage',
    stereo: 'simple',
    status: 'todo',
    dependencyStageIds: [],
    isRequired: true,
    order: 1,
    tasks: [],
    notes: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
});

const makeItem = (stages: Partial<Stage>[]): Item => ({
    id: 'item-1',
    processId: 'process-1',
    name: 'Test Item',
    thumbnailUrl: '',
    stages: stages.map((s, i) => makeStage({ id: `s-${i}`, order: i + 1, ...s })),
    createdAt: Date.now(),
    updatedAt: Date.now(),
});

describe('getNextAction', () => {
    it('should prioritize stage with unresolved notes', () => {
        const item = makeItem([
            { status: 'done' },
            { status: 'doing', notes: [] },
            {
                status: 'todo',
                notes: [
                    { id: 'n1', content: 'fix this', stereo: 'issue', isResolved: false, createdAt: 0, updatedAt: 0 },
                ],
            },
        ]);
        const result = getNextAction(item);
        expect(result?.reason).toBe('unresolved_notes');
        expect(result?.stage.order).toBe(3);
    });

    it('should return doing stage when no unresolved notes', () => {
        const item = makeItem([{ status: 'done' }, { status: 'doing' }, { status: 'todo' }]);
        const result = getNextAction(item);
        expect(result?.reason).toBe('doing');
        expect(result?.stage.order).toBe(2);
    });

    it('should return next required todo when no doing stages', () => {
        const item = makeItem([
            { status: 'done' },
            { status: 'todo', isRequired: false },
            { status: 'todo', isRequired: true },
        ]);
        const result = getNextAction(item);
        expect(result?.reason).toBe('next_todo');
        expect(result?.stage.order).toBe(3);
    });

    it('should return undefined when all done', () => {
        const item = makeItem([{ status: 'done' }, { status: 'done' }]);
        expect(getNextAction(item)).toBeUndefined();
    });
});

describe('calculateProgress', () => {
    it('should calculate progress based on required stages', () => {
        const item = makeItem([
            { status: 'done', isRequired: true },
            { status: 'done', isRequired: true },
            { status: 'todo', isRequired: true },
            { status: 'todo', isRequired: false },
        ]);
        expect(calculateProgress(item)).toBe(67);
    });

    it('should exclude skipped stages from denominator', () => {
        const item = makeItem([
            { status: 'done', isRequired: true },
            { status: 'skip', isRequired: true },
            { status: 'todo', isRequired: true },
        ]);
        // skip excluded: 1 done / 2 (done + todo) = 50%
        expect(calculateProgress(item)).toBe(50);
    });

    it('should return 0 when no required stages', () => {
        const item = makeItem([{ status: 'done', isRequired: false }]);
        expect(calculateProgress(item)).toBe(0);
    });

    it('should return 100 when all required are done', () => {
        const item = makeItem([
            { status: 'done', isRequired: true },
            { status: 'done', isRequired: true },
        ]);
        expect(calculateProgress(item)).toBe(100);
    });
});

describe('generateToolUrl', () => {
    it('should replace all placeholders', () => {
        const url = generateToolUrl('https://example.com/{itemId}/{stageId}?name={itemName}&stage={stageName}', {
            itemId: 'i1',
            stageId: 's1',
            itemName: '크롭 니트',
            stageName: '촬영',
        });
        expect(url).toBe(
            `https://example.com/i1/s1?name=${encodeURIComponent('크롭 니트')}&stage=${encodeURIComponent('촬영')}`
        );
    });

    it('should handle missing context values', () => {
        const url = generateToolUrl('https://example.com/{itemId}/{taskId}', {});
        expect(url).toBe('https://example.com//');
    });

    it('should encode task title', () => {
        const url = generateToolUrl('https://example.com/{taskTitle}', { taskTitle: 'hello world' });
        expect(url).toBe('https://example.com/hello%20world');
    });
});

describe('getStageUnresolvedNotesCount', () => {
    it('should count stage and task notes', () => {
        const stage = makeStage({
            notes: [
                { id: 'n1', content: 'a', stereo: 'comment', isResolved: false, createdAt: 0, updatedAt: 0 },
                { id: 'n2', content: 'b', stereo: 'comment', isResolved: true, createdAt: 0, updatedAt: 0 },
            ],
            tasks: [
                {
                    id: 't1',
                    stageId: 'stage-1',
                    title: 'task',
                    stereo: 'normal',
                    status: 'todo',
                    createdAt: 0,
                    updatedAt: 0,
                    notes: [{ id: 'n3', content: 'c', stereo: 'issue', isResolved: false, createdAt: 0, updatedAt: 0 }],
                },
            ],
        });
        expect(getStageUnresolvedNotesCount(stage)).toBe(2);
    });
});

describe('getUnresolvedCount', () => {
    it('should sum across all stages', () => {
        const item = makeItem([
            {
                notes: [{ id: 'n1', content: 'a', stereo: 'comment', isResolved: false, createdAt: 0, updatedAt: 0 }],
            },
            {
                notes: [
                    { id: 'n2', content: 'b', stereo: 'comment', isResolved: false, createdAt: 0, updatedAt: 0 },
                    { id: 'n3', content: 'c', stereo: 'comment', isResolved: true, createdAt: 0, updatedAt: 0 },
                ],
            },
        ]);
        expect(getUnresolvedCount(item)).toBe(2);
    });
});
