import { ACTORS, INITIAL_ITEMS, PROCESSES, TOOLS } from './mockData';

import type { ProcessApi } from './interface';
import type {
    Actor,
    ChangeStatusInput,
    CreateActorInput,
    CreateItemInput,
    CreateNoteInput,
    CreateProcessInput,
    CreateTaskInput,
    CreateToolInput,
    Item,
    Note,
    Process,
    ProcessApiListResponse,
    ProcessApiResponse,
    Stage,
    Task,
    Tool,
    UpdateProcessInput,
    UpdateStageInput,
} from '../../types/process';

let dbItems: Item[] = [...INITIAL_ITEMS];
let dbProcesses: Record<string, Process> = { ...PROCESSES };
let dbActors: Record<string, Actor> = { ...ACTORS };
let dbTools: Record<string, Tool> = { ...TOOLS };

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const success = <T>(data: T, warnings: string[] = []): ProcessApiResponse<T> => ({ data, warnings });
const listSuccess = <T>(data: T[], warnings: string[] = []): ProcessApiListResponse<T> => ({
    data,
    warnings,
    meta: { page: 1, pageSize: data.length, total: data.length },
});

const DEFAULT_THUMBNAIL =
    'https://images.unsplash.com/photo-1544441893-675973e31985?auto=format&fit=crop&q=80&w=200&h=200';

const instantiateItem = (process: Process, processId: string, name: string, thumbnailUrl: string): Item => {
    const itemId = `item-${Date.now()}`;
    const idMap = new Map<string, string>();
    process.stages.forEach(s => {
        idMap.set(s.id, `s${s.order}-${Math.random().toString(36).substring(7)}`);
    });

    const stages = process.stages.map(tmpl => ({
        ...tmpl,
        id: idMap.get(tmpl.id) ?? tmpl.id,
        itemId,
        processId,
        status: 'todo' as const,
        dependencyStageIds: tmpl.dependencyStageIds.map(depId => idMap.get(depId) ?? depId).filter(Boolean),
        createdAt: Date.now(),
        updatedAt: Date.now(),
    }));

    return {
        id: itemId,
        processId,
        name,
        thumbnailUrl: thumbnailUrl || DEFAULT_THUMBNAIL,
        stages,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
};

export const mockApi: ProcessApi = {
    processes: {
        async list(): Promise<ProcessApiListResponse<Process>> {
            await delay(200);
            return listSuccess(Object.values(dbProcesses));
        },
        async get(id: string): Promise<ProcessApiResponse<Process>> {
            await delay(200);
            const process = dbProcesses[id];
            if (!process) throw new Error(`Process not found: ${id}`);
            return success(process);
        },
        async create(input: CreateProcessInput): Promise<ProcessApiResponse<Process>> {
            await delay(300);
            if (!input.name.trim()) throw new Error('name is required');
            const id = `flow-${Date.now()}`;
            const stages: Stage[] = input.stages.map((s, i) => ({
                id: `ts-${Date.now()}-${i}`,
                itemId: '',
                processId: id,
                name: s.name,
                stereo: s.stereo,
                status: 'todo' as const,
                guideText: s.guideText,
                actionLabel: s.actionLabel || '작업 열기',
                actorId: s.actorId,
                toolId: s.toolId,
                dependencyStageIds: s.dependencyStageIds || [],
                isRequired: s.isRequired,
                order: s.order || i + 1,
                tasks: [],
                notes: [],
                createdAt: Date.now(),
                updatedAt: Date.now(),
            }));
            const newProcess: Process = {
                id,
                name: input.name,
                description: input.description || '',
                stereo: input.stereo,
                stages,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };
            dbProcesses[id] = newProcess;
            return success(newProcess);
        },
        async update(id: string, input: UpdateProcessInput): Promise<ProcessApiResponse<Process>> {
            await delay(300);
            const process = dbProcesses[id];
            if (!process) throw new Error(`Process not found: ${id}`);
            if (input.name !== undefined && !input.name.trim()) throw new Error('name cannot be empty');
            const updated = { ...process, ...input, updatedAt: Date.now() };
            dbProcesses[id] = updated;
            return success(updated);
        },
        async remove(id: string): Promise<ProcessApiResponse<{ id: string }>> {
            await delay(300);
            delete dbProcesses[id];
            return success({ id });
        },
        async apply(id: string, input: CreateItemInput): Promise<ProcessApiResponse<Item>> {
            await delay(400);
            const process = dbProcesses[id];
            if (!process) throw new Error(`Process not found: ${id}`);
            if (!input.name.trim()) throw new Error('name is required');

            const newItem = instantiateItem(process, id, input.name, input.thumbnailUrl);
            dbItems = [newItem, ...dbItems];
            return success(newItem);
        },
    },
    items: {
        async list(): Promise<ProcessApiListResponse<Item>> {
            await delay(300);
            return listSuccess(dbItems);
        },
        async get(id: string): Promise<ProcessApiResponse<Item>> {
            await delay(200);
            const item = dbItems.find(i => i.id === id);
            if (!item) throw new Error('Item not found');
            return success(item);
        },
        async create(input: CreateItemInput): Promise<ProcessApiResponse<Item>> {
            await delay(300);
            const process = dbProcesses[input.processId];
            if (!process) throw new Error(`Process not found: ${input.processId}`);
            if (!input.name.trim()) throw new Error('name is required');

            const newItem = instantiateItem(process, input.processId, input.name, input.thumbnailUrl);
            dbItems = [newItem, ...dbItems];
            return success(newItem);
        },
        async update(id: string, input: Partial<Item>): Promise<ProcessApiResponse<Item>> {
            await delay(300);
            const idx = dbItems.findIndex(i => i.id === id);
            if (idx === -1) throw new Error('Item not found');
            dbItems[idx] = { ...dbItems[idx], ...input, updatedAt: Date.now() };
            return success(dbItems[idx]);
        },
        async remove(id: string): Promise<ProcessApiResponse<{ id: string }>> {
            await delay(300);
            dbItems = dbItems.filter(i => i.id !== id);
            return success({ id });
        },
    },
    stages: {
        async get(id: string): Promise<ProcessApiResponse<Stage>> {
            await delay(100);
            for (const item of dbItems) {
                const stage = item.stages.find(s => s.id === id);
                if (stage) return success(stage);
            }
            throw new Error('Stage not found');
        },
        async update(id: string, input: UpdateStageInput): Promise<ProcessApiResponse<Stage>> {
            await delay(200);
            for (const item of dbItems) {
                const idx = item.stages.findIndex(s => s.id === id);
                if (idx !== -1) {
                    item.stages[idx] = { ...item.stages[idx], ...input, updatedAt: Date.now() };
                    return success(item.stages[idx]);
                }
            }
            throw new Error('Stage not found');
        },
        async changeStatus(id: string, input: ChangeStatusInput): Promise<ProcessApiResponse<Stage>> {
            await delay(200);
            const warnings: string[] = [];
            for (const item of dbItems) {
                const idx = item.stages.findIndex(s => s.id === id);
                if (idx !== -1) {
                    const stage = item.stages[idx];
                    if (input.status === 'done' || input.status === 'doing') {
                        const deps = stage.dependencyStageIds.map(depId => item.stages.find(s => s.id === depId));
                        const incompleteDeps = deps.filter(d => d && d.status !== 'done' && d.status !== 'skip');
                        if (incompleteDeps.length > 0) {
                            warnings.push(
                                `선행 단계가 아직 완료되지 않았습니다: ${incompleteDeps.map(d => d?.name).join(', ')}`
                            );
                        }
                    }
                    if (input.status === 'done' && stage.notes.some(n => !n.isResolved)) {
                        warnings.push('진행 중인 이슈(Note)가 있습니다.');
                    }

                    item.stages[idx] = { ...stage, status: input.status, updatedAt: Date.now() };
                    return success(item.stages[idx], warnings);
                }
            }
            throw new Error('Stage not found');
        },
        async addNote(id: string, input: CreateNoteInput): Promise<ProcessApiResponse<Note>> {
            await delay(200);
            const newNote: Note = {
                id: `note-${Date.now()}`,
                stageId: id,
                content: input.content,
                stereo: input.stereo || 'comment',
                actorId: input.authorId,
                targetActorId: input.targetActorId,
                isResolved: false,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };
            for (const item of dbItems) {
                const stage = item.stages.find(s => s.id === id);
                if (stage) {
                    stage.notes = [newNote, ...stage.notes];
                    stage.updatedAt = Date.now();
                    return success(newNote);
                }
            }
            throw new Error('Stage not found');
        },
        async addTask(id: string, input: CreateTaskInput): Promise<ProcessApiResponse<Task>> {
            await delay(200);
            const newTask: Task = {
                id: `task-${Date.now()}`,
                stageId: id,
                title: input.title,
                stereo: input.stereo || 'normal',
                status: 'todo',
                actorId: input.authorId,
                notes: [],
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };
            for (const item of dbItems) {
                const stage = item.stages.find(s => s.id === id);
                if (stage) {
                    stage.tasks = [...stage.tasks, newTask];
                    stage.updatedAt = Date.now();
                    return success(newTask);
                }
            }
            throw new Error('Stage not found');
        },
    },
    actors: {
        async list(): Promise<ProcessApiListResponse<Actor>> {
            await delay(100);
            return listSuccess(Object.values(dbActors));
        },
        async create(input: CreateActorInput): Promise<ProcessApiResponse<Actor>> {
            await delay(200);
            const warnings: string[] = [];
            if (Object.values(dbActors).some(a => a.name === input.name)) {
                warnings.push('중복된 이름의 담당자가 있습니다.');
            }
            const id = `actor-${Date.now()}`;
            const newActor: Actor = {
                id,
                name: input.name,
                color: input.color,
                stereo: input.stereo,
                memo: input.memo,
                isActive: true,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };
            dbActors[id] = newActor;
            return success(newActor, warnings);
        },
        async update(id: string, input: Partial<Actor>): Promise<ProcessApiResponse<Actor>> {
            await delay(200);
            const actor = dbActors[id];
            if (!actor) throw new Error('Actor not found');
            const updated = { ...actor, ...input, stereo: actor.stereo, id: actor.id, updatedAt: Date.now() };
            dbActors[id] = updated;
            return success(updated);
        },
        async deactivate(id: string): Promise<ProcessApiResponse<Actor>> {
            await delay(100);
            if (!dbActors[id]) throw new Error('Actor not found');
            dbActors[id].isActive = false;
            dbActors[id].updatedAt = Date.now();
            return success(dbActors[id]);
        },
        async activate(id: string): Promise<ProcessApiResponse<Actor>> {
            await delay(100);
            if (!dbActors[id]) throw new Error('Actor not found');
            dbActors[id].isActive = true;
            dbActors[id].updatedAt = Date.now();
            return success(dbActors[id]);
        },
    },
    tools: {
        async list(): Promise<ProcessApiListResponse<Tool>> {
            await delay(100);
            return listSuccess(Object.values(dbTools));
        },
        async create(input: CreateToolInput): Promise<ProcessApiResponse<Tool>> {
            await delay(200);
            if ((input.stereo === 'link' || input.stereo === 'embed') && !input.urlTemplate) {
                throw new Error('urlTemplate is required for link/embed tools');
            }
            const warnings: string[] = [];
            if (Object.values(dbTools).some(t => t.name === input.name)) {
                warnings.push('중복된 이름의 도구가 있습니다.');
            }
            if (input.urlTemplate) {
                const hasInvalidPlaceholder = input.urlTemplate.match(
                    /\{(?!(itemId|itemName|stageId|stageName|taskId|taskTitle))\w+\}/
                );
                if (hasInvalidPlaceholder) {
                    warnings.push('지원하지 않는 placeholder가 포함되어 있습니다.');
                }
            }
            const id = `tool-${Date.now()}`;
            const newTool: Tool = {
                id,
                name: input.name,
                stereo: input.stereo,
                urlTemplate: input.urlTemplate,
                actionLabel: input.actionLabel,
                taskTemplates: input.taskTemplates,
                memo: input.memo,
                isActive: true,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };
            dbTools[id] = newTool;
            return success(newTool, warnings);
        },
        async update(id: string, input: Partial<Tool>): Promise<ProcessApiResponse<Tool>> {
            await delay(200);
            const tool = dbTools[id];
            if (!tool) throw new Error('Tool not found');
            const warnings: string[] = [];
            if (input.urlTemplate) {
                const hasInvalidPlaceholder = input.urlTemplate.match(
                    /\{(?!(itemId|itemName|stageId|stageName|taskId|taskTitle))\w+\}/
                );
                if (hasInvalidPlaceholder) {
                    warnings.push('지원하지 않는 placeholder가 포함되어 있습니다.');
                }
            }
            const updated = { ...tool, ...input, stereo: tool.stereo, id: tool.id, updatedAt: Date.now() };
            dbTools[id] = updated;
            return success(updated, warnings);
        },
        async deactivate(id: string): Promise<ProcessApiResponse<Tool>> {
            await delay(100);
            const tool = dbTools[id];
            if (!tool) throw new Error('Tool not found');
            tool.isActive = false;
            tool.updatedAt = Date.now();
            return success(tool);
        },
        async activate(id: string): Promise<ProcessApiResponse<Tool>> {
            await delay(100);
            const tool = dbTools[id];
            if (!tool) throw new Error('Tool not found');
            tool.isActive = true;
            tool.updatedAt = Date.now();
            return success(tool);
        },
    },
};

/** Reset mock database to initial state (for testing) */
export const resetMockDb = () => {
    dbItems = [...INITIAL_ITEMS];
    dbProcesses = { ...PROCESSES };
    dbActors = { ...ACTORS };
    dbTools = { ...TOOLS };
};
