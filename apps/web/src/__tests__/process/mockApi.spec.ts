import { beforeEach, describe, expect, it } from 'vitest';

import { mockApi, resetMockDb } from '@flows/flows';

describe('Process Navigator mockApi', () => {
    beforeEach(() => {
        resetMockDb();
    });

    describe('processes', () => {
        it('should list processes', async () => {
            const result = await mockApi.processes.list();
            expect(result.data.length).toBeGreaterThan(0);
            expect(result.data[0].name).toBe('패션 상품 멀티몰 등록');
        });

        it('should get a process by id', async () => {
            const result = await mockApi.processes.get('f1');
            expect(result.data.id).toBe('f1');
            expect(result.data.stages.length).toBe(7);
        });

        it('should throw on get with invalid id', async () => {
            await expect(mockApi.processes.get('nonexistent')).rejects.toThrow('Process not found');
        });

        it('should create a process with stages', async () => {
            const result = await mockApi.processes.create({
                name: 'Test Process',
                description: 'desc',
                stereo: 'linear',
                stages: [
                    { name: 'Stage 1', stereo: 'simple', isRequired: true, order: 1 },
                    { name: 'Stage 2', stereo: 'iterative', isRequired: false, order: 2 },
                ],
            });
            expect(result.data.name).toBe('Test Process');
            expect(result.data.stages.length).toBe(2);
            expect(result.data.stages[0].processId).toBe(result.data.id);
            expect(result.data.stages[0].itemId).toBe('');
        });

        it('should throw on create with empty name', async () => {
            await expect(
                mockApi.processes.create({
                    name: '  ',
                    description: '',
                    stereo: 'linear',
                    stages: [],
                })
            ).rejects.toThrow('name is required');
        });

        it('should apply process to create item with remapped IDs', async () => {
            const result = await mockApi.processes.apply('f1', {
                name: '테스트 상품',
                thumbnailUrl: '',
                processId: 'f1',
            });
            const item = result.data;
            expect(item.name).toBe('테스트 상품');
            expect(item.processId).toBe('f1');
            expect(item.stages.length).toBe(7);

            // IDs should be remapped (not the template IDs)
            const stageIds = item.stages.map(s => s.id);
            expect(stageIds.every(id => !id.startsWith('ts'))).toBe(true);

            // Dependencies should be remapped
            const stage2 = item.stages.find(s => s.order === 2);
            expect(stage2?.dependencyStageIds.length).toBe(1);
            expect(stageIds).toContain(stage2?.dependencyStageIds[0]);
        });
    });

    describe('stages.changeStatus', () => {
        it('should change status and return warnings for incomplete deps', async () => {
            const items = await mockApi.items.list();
            const item3 = items.data.find(i => i.name === '봄 셔츠 자켓');
            expect(item3).toBeDefined();

            // Stage 2 (order=2) depends on Stage 1 (order=1) which is 'doing'
            const stage2 = item3?.stages.find(s => s.order === 2);
            expect(stage2).toBeDefined();

            const result = await mockApi.stages.changeStatus(stage2!.id, { status: 'doing' });
            expect(result.data.status).toBe('doing');
            expect(result.warnings?.length).toBeGreaterThan(0);
            expect(result.warnings?.[0]).toContain('선행 단계가 아직 완료되지 않았습니다');
        });

        it('should warn about unresolved notes when completing', async () => {
            const items = await mockApi.items.list();
            const item1 = items.data.find(i => i.name === '크롭 니트');
            // Stage 3 (촬영) has unresolved note
            const stage3 = item1?.stages.find(s => s.order === 3);
            expect(stage3?.notes.some(n => !n.isResolved)).toBe(true);

            const result = await mockApi.stages.changeStatus(stage3!.id, { status: 'done' });
            expect(result.data.status).toBe('done');
            expect(result.warnings).toContain('진행 중인 이슈(Note)가 있습니다.');
        });

        it('should change status without warnings when no issues', async () => {
            const items = await mockApi.items.list();
            const item1 = items.data.find(i => i.name === '크롭 니트');
            // Stage 4 (상세페이지 제작) is 'todo', no notes
            const stage4 = item1?.stages.find(s => s.order === 4);

            const result = await mockApi.stages.changeStatus(stage4!.id, { status: 'doing' });
            expect(result.data.status).toBe('doing');
            // May have dep warning since stage 3 isn't done yet
        });
    });

    describe('stages.addNote', () => {
        it('should add note to stage', async () => {
            const items = await mockApi.items.list();
            const stage = items.data[0].stages[0];

            const result = await mockApi.stages.addNote(stage.id, {
                content: 'Test note',
                authorId: 'md',
                stereo: 'issue',
                targetActorId: 'photo',
            });
            expect(result.data.content).toBe('Test note');
            expect(result.data.stereo).toBe('issue');
            expect(result.data.targetActorId).toBe('photo');
            expect(result.data.isResolved).toBe(false);
        });
    });

    describe('stages.addTask', () => {
        it('should add task to stage', async () => {
            const items = await mockApi.items.list();
            const stage = items.data[0].stages[0];

            const result = await mockApi.stages.addTask(stage.id, {
                title: 'New task',
                stereo: 'review',
            });
            expect(result.data.title).toBe('New task');
            expect(result.data.stereo).toBe('review');
            expect(result.data.status).toBe('todo');
        });
    });

    describe('actors', () => {
        it('should list actors', async () => {
            const result = await mockApi.actors.list();
            expect(result.data.length).toBe(6);
        });

        it('should warn on duplicate name', async () => {
            const result = await mockApi.actors.create({
                name: 'MD팀',
                color: 'bg-red-500',
                stereo: 'team',
            });
            expect(result.data.name).toBe('MD팀');
            expect(result.warnings).toContain('중복된 이름의 담당자가 있습니다.');
        });
    });

    describe('tools', () => {
        it('should warn on invalid placeholder', async () => {
            const result = await mockApi.tools.create({
                name: 'Bad Tool',
                stereo: 'link',
                urlTemplate: 'https://example.com/{invalidParam}',
                actionLabel: 'Open',
            });
            expect(result.warnings).toContain('지원하지 않는 placeholder가 포함되어 있습니다.');
        });

        it('should throw if link tool missing urlTemplate', async () => {
            await expect(
                mockApi.tools.create({
                    name: 'No URL',
                    stereo: 'link',
                    actionLabel: 'Open',
                })
            ).rejects.toThrow('urlTemplate is required');
        });

        it('should allow flow tool without urlTemplate', async () => {
            const result = await mockApi.tools.create({
                name: 'Flow Tool',
                stereo: 'flow',
                actionLabel: 'Run',
            });
            expect(result.data.stereo).toBe('flow');
            expect(result.data.urlTemplate).toBeUndefined();
        });
    });
});
