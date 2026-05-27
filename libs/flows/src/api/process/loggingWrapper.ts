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
    ItemListParams,
    Tool,
    UpdateItemInput,
    UpdateProcessInput,
    UpdateStageInput,
} from '../../types/process';

/**
 * A highly polished logging wrapper for ProcessApi.
 * Intercepts all requests, logging arguments, successful results, and execution latency.
 * Elegantly formats output differently for browser environments (with colored groupCollapsed)
 * and terminal environments (with clean, uncluttered stdout).
 */
export class LoggingProcessApiWrapper implements ProcessApi {
    constructor(private readonly api: ProcessApi) {}

    private async logCall<T>(group: string, method: string, args: unknown[], fn: () => Promise<T>): Promise<T> {
        const start = Date.now();
        const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined';

        if (isBrowser) {
            console.groupCollapsed(
                `%c[API Request] ${group}.${method}`,
                'color: #3b82f6; font-weight: bold; background: #e0f2fe; padding: 2px 6px; border-radius: 4px;'
            );
            console.log('Arguments:', args);
            console.groupEnd();
        } else {
            console.log(`[API Request] ${group}.${method} - Arguments:`, JSON.stringify(args));
        }

        try {
            const result = await fn();
            const duration = Date.now() - start;

            if (isBrowser) {
                console.groupCollapsed(
                    `%c[API Response] ${group}.${method} %c(${duration}ms)`,
                    'color: #10b981; font-weight: bold; background: #dcfce7; padding: 2px 6px; border-radius: 4px;',
                    'color: #6b7280; font-weight: normal;'
                );
                console.log('Result:', result);
                console.groupEnd();
            } else {
                console.log(`[API Response] ${group}.${method} (${duration}ms) - Success`);
            }
            return result;
        } catch (error) {
            const duration = Date.now() - start;

            if (isBrowser) {
                console.groupCollapsed(
                    `%c[API Error] ${group}.${method} %c(${duration}ms)`,
                    'color: #ef4444; font-weight: bold; background: #fee2e2; padding: 2px 6px; border-radius: 4px;',
                    'color: #6b7280; font-weight: normal;'
                );
                console.error('Error:', error);
                console.groupEnd();
            } else {
                console.error(`[API Error] ${group}.${method} (${duration}ms) - Error:`, error);
            }
            throw error;
        }
    }

    public readonly processes = {
        list: () => this.logCall('processes', 'list', [], () => this.api.processes.list()),
        get: (id: string) => this.logCall('processes', 'get', [id], () => this.api.processes.get(id)),
        create: (input: CreateProcessInput) =>
            this.logCall('processes', 'create', [input], () => this.api.processes.create(input)),
        update: (id: string, input: UpdateProcessInput) =>
            this.logCall('processes', 'update', [id, input], () => this.api.processes.update(id, input)),
        remove: (id: string) => this.logCall('processes', 'remove', [id], () => this.api.processes.remove(id)),
        apply: (id: string, input: CreateItemInput) =>
            this.logCall('processes', 'apply', [id, input], () => this.api.processes.apply(id, input)),
    };

    public readonly items = {
        list: (params?: ItemListParams) => this.logCall('items', 'list', [params], () => this.api.items.list(params)),
        get: (id: string) => this.logCall('items', 'get', [id], () => this.api.items.get(id)),
        create: (input: CreateItemInput) =>
            this.logCall('items', 'create', [input], () => this.api.items.create(input)),
        update: (id: string, input: UpdateItemInput) =>
            this.logCall('items', 'update', [id, input], () => this.api.items.update(id, input)),
        remove: (id: string) => this.logCall('items', 'remove', [id], () => this.api.items.remove(id)),
    };

    public readonly stages = {
        get: (id: string) => this.logCall('stages', 'get', [id], () => this.api.stages.get(id)),
        update: (id: string, input: UpdateStageInput) =>
            this.logCall('stages', 'update', [id, input], () => this.api.stages.update(id, input)),
        changeStatus: (id: string, input: ChangeStatusInput) =>
            this.logCall('stages', 'changeStatus', [id, input], () => this.api.stages.changeStatus(id, input)),
        addNote: (id: string, input: CreateNoteInput) =>
            this.logCall('stages', 'addNote', [id, input], () => this.api.stages.addNote(id, input)),
        addTask: (id: string, input: CreateTaskInput) =>
            this.logCall('stages', 'addTask', [id, input], () => this.api.stages.addTask(id, input)),
    };

    public readonly tasks = {
        changeStatus: (id: string, input: ChangeStatusInput) =>
            this.logCall('tasks', 'changeStatus', [id, input], () => this.api.tasks.changeStatus(id, input)),
        addNote: (id: string, input: CreateNoteInput) =>
            this.logCall('tasks', 'addNote', [id, input], () => this.api.tasks.addNote(id, input)),
    };

    public readonly notes = {
        resolve: (id: string, input: { resolvedByActorId?: string }) =>
            this.logCall('notes', 'resolve', [id, input], () => this.api.notes.resolve(id, input)),
        reopen: (id: string) => this.logCall('notes', 'reopen', [id], () => this.api.notes.reopen(id)),
    };

    public readonly actors = {
        list: () => this.logCall('actors', 'list', [], () => this.api.actors.list()),
        create: (input: CreateActorInput) =>
            this.logCall('actors', 'create', [input], () => this.api.actors.create(input)),
        update: (id: string, input: Partial<Actor>) =>
            this.logCall('actors', 'update', [id, input], () => this.api.actors.update(id, input)),
        deactivate: (id: string) => this.logCall('actors', 'deactivate', [id], () => this.api.actors.deactivate(id)),
        activate: (id: string) => this.logCall('actors', 'activate', [id], () => this.api.actors.activate(id)),
    };

    public readonly tools = {
        list: () => this.logCall('tools', 'list', [], () => this.api.tools.list()),
        create: (input: CreateToolInput) =>
            this.logCall('tools', 'create', [input], () => this.api.tools.create(input)),
        update: (id: string, input: Partial<Tool>) =>
            this.logCall('tools', 'update', [id, input], () => this.api.tools.update(id, input)),
        deactivate: (id: string) => this.logCall('tools', 'deactivate', [id], () => this.api.tools.deactivate(id)),
        activate: (id: string) => this.logCall('tools', 'activate', [id], () => this.api.tools.activate(id)),
    };
}
