import { beforeEach, describe, expect, it } from 'vitest';

import { realApi, resetMockDb } from '@flows/flows';

describe('Process Navigator realApi (skeleton proxy over mockApi)', () => {
    beforeEach(() => {
        resetMockDb();
    });

    describe('processes', () => {
        it('should list processes', async () => {
            const result = await realApi.processes.list();
            expect(result.data.length).toBeGreaterThan(0);
            expect(result.data[0].name).toBe('패션 상품 멀티몰 등록');
        });

        it('should get a process template by id', async () => {
            const result = await realApi.processes.get('f1');
            expect(result.data.id).toBe('f1');
            expect(result.data.stages.length).toBe(7);
        });

        it('should create and update process templates', async () => {
            const createRes = await realApi.processes.create({
                name: 'New template',
                description: 'desc',
                stereo: 'linear',
                stages: [{ name: 'Stage 1', stereo: 'simple', isRequired: true, order: 1 }],
            });
            expect(createRes.data.name).toBe('New template');

            const updateRes = await realApi.processes.update(createRes.data.id, {
                name: 'Updated template name',
            });
            expect(updateRes.data.name).toBe('Updated template name');
        });

        it('should instantiate items from a process template', async () => {
            const applyRes = await realApi.processes.apply('f1', {
                name: 'Applied Item',
                thumbnailUrl: 'https://example.com/thumb.jpg',
                processId: 'f1',
                meta: { custom: 'true' },
            });
            expect(applyRes.data.name).toBe('Applied Item');
            expect(applyRes.data.processId).toBe('f1');
            expect(applyRes.data.thumbnailUrl).toBe('https://example.com/thumb.jpg');
            expect(applyRes.data.$meta).toEqual({ custom: 'true' });
        });
    });

    describe('items', () => {
        it('should list items with params and support CRUD', async () => {
            const listRes = await realApi.items.list({ page: 0, limit: 10 });
            expect(listRes.data.length).toBeGreaterThan(0);

            const getRes = await realApi.items.get('item-1');
            expect(getRes.data.id).toBe('item-1');

            const createRes = await realApi.items.create({
                name: 'Direct Item',
                processId: 'f1',
            });
            expect(createRes.data.name).toBe('Direct Item');

            const updateRes = await realApi.items.update(createRes.data.id, {
                name: 'Updated Direct Item',
            });
            expect(updateRes.data.name).toBe('Updated Direct Item');

            const removeRes = await realApi.items.remove(createRes.data.id);
            expect(removeRes.data.id).toBe(createRes.data.id);
        });
    });

    describe('stages', () => {
        it('should get, update, and manage stages, tasks, and notes', async () => {
            const itemRes = await realApi.items.get('item-1');
            const targetStage = itemRes.data.stages[0];

            const stageRes = await realApi.stages.get(targetStage.id);
            expect(stageRes.data.id).toBe(targetStage.id);

            const statusRes = await realApi.stages.changeStatus(targetStage.id, { status: 'doing' });
            expect(statusRes.data.status).toBe('doing');

            const noteRes = await realApi.stages.addNote(targetStage.id, {
                actorId: 'md',
                content: 'Hello, this is a note',
                stereo: 'issue',
            });
            expect(noteRes.data.content).toBe('Hello, this is a note');

            const taskRes = await realApi.stages.addTask(targetStage.id, {
                title: 'New task',
                stereo: 'todo',
            });
            expect(taskRes.data.title).toBe('New task');
        });
    });

    describe('actors & tools', () => {
        it('should manage actors CRUD', async () => {
            const actorRes = await realApi.actors.create({
                name: 'New Actor',
                color: 'bg-red-500',
                stereo: 'person',
            });
            expect(actorRes.data.name).toBe('New Actor');

            const updateRes = await realApi.actors.update(actorRes.data.id, {
                name: 'Updated Actor',
            });
            expect(updateRes.data.name).toBe('Updated Actor');

            const deactiveRes = await realApi.actors.deactivate(actorRes.data.id);
            expect(deactiveRes.data.isActive).toBe(false);

            const activeRes = await realApi.actors.activate(actorRes.data.id);
            expect(activeRes.data.isActive).toBe(true);
        });

        it('should manage tools CRUD', async () => {
            const toolRes = await realApi.tools.create({
                name: 'New Tool',
                url: 'https://test-tool.com/{itemId}',
                actionLabel: 'Open',
            });
            expect(toolRes.data.name).toBe('New Tool');

            const updateRes = await realApi.tools.update(toolRes.data.id, {
                name: 'Updated Tool',
            });
            expect(updateRes.data.name).toBe('Updated Tool');

            const helloRes = await realApi.tools.hello(toolRes.data.id, { param: 'x' }, { body: 'y' });
            expect(helloRes.data).toBeDefined();
        });
    });

    describe('tasks & notes', () => {
        it('should change task status and resolve notes', async () => {
            const itemRes = await realApi.items.get('item-1');
            const targetStage = itemRes.data.stages[0];

            // Add a task to target
            const taskRes = await realApi.stages.addTask(targetStage.id, {
                title: 'Check task',
                stereo: 'todo',
            });
            const targetTaskId = taskRes.data.id;

            // Task status change
            const taskStatusRes = await realApi.tasks.changeStatus(targetTaskId, { status: 'done' });
            expect(taskStatusRes.data.status).toBe('done');

            // Add a note to target
            const noteRes = await realApi.stages.addNote(targetStage.id, {
                content: 'Resolvable issue',
                actorId: 'md',
                stereo: 'issue',
            });
            const targetNoteId = noteRes.data.id;

            // Resolve and reopen note
            const resolveRes = await realApi.notes.resolve(targetNoteId, { resolvedByActorId: 'md' });
            expect(resolveRes.data.isResolved).toBe(true);

            const reopenRes = await realApi.notes.reopen(targetNoteId);
            expect(reopenRes.data.isResolved).toBe(false);
        });
    });
});
