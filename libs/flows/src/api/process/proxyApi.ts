import { onlyDefined } from './adapters';

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
    ItemListParams,
    Note,
    Process,
    ProcessApiListResponse,
    ProcessApiResponse,
    Stage,
    Task,
    Tool,
    UpdateActorInput,
    UpdateItemInput,
    UpdateProcessInput,
    UpdateStageInput,
    UpdateToolInput,
} from '../../types/process';

/**
 * type: `ProxyClient`
 * - type definition for proxy client function.
 * - the final real endpoint will be determined by the implementation of the `ProxyClient` function.
 *
 * @param type      API type (e.g. 'tools', 'processes', etc.)
 * @param cmd       API command (e.g. 'list', 'create', etc.)
 * @param id        Resource ID (optional, depending on the API command)
 * @param param     URL query parameters (optional)
 * @param body      Request body (optional)
 * @returns         Promise resolving to the API response.
 */
export interface ProxyClient {
    <P = any, B = any, R = any>(type: string, cmd: string, id?: string, param?: P, body?: B): Promise<R>;
}

/**
 * param for `/proxy` endpoint.
 * - `body` should be body of request.
 */
export interface ProxyParam<P = any> {
    type: string;
    id?: string;
    cmd?: string;
    param?: P;
}

/**
 * create proxy api with not implemented function.
 *
 * @returns proxy api object with not implemented function.
 * @throws Error when the function is called.
 * @example
 * const proxyApi = createProxyApi();
 * await proxyApi.processes.list(); // throws Error: 501 NOT IMPLEMENTED - processesApi.processes.list()
 */
export const createProxyApi = (client: ProxyClient): ProcessApi => {
    if (!client) throw new Error('ProxyClient is required to create ProxyApi');

    return onlyDefined<ProcessApi>({
        processes: {
            list: (): Promise<ProcessApiListResponse<Process>> => client('processes', 'list'),
            get: (id: string): Promise<ProcessApiResponse<Process>> => client('processes', 'get', id),
            create: (input: CreateProcessInput): Promise<ProcessApiResponse<Process>> =>
                client('processes', 'create', undefined, undefined, input),
            update: (id: string, input: UpdateProcessInput): Promise<ProcessApiResponse<Process>> =>
                client('processes', 'update', id, undefined, input),
            remove: (id: string): Promise<ProcessApiResponse<{ id: string }>> => client('processes', 'remove', id),
            apply: (id: string, input: CreateItemInput): Promise<ProcessApiResponse<Item>> =>
                client('processes', 'apply', id, undefined, input),
        },
        items: {
            list: (param?: ItemListParams): Promise<ProcessApiListResponse<Item>> =>
                client('items', 'list', undefined, param),
            get: (id: string): Promise<ProcessApiResponse<Item>> => client('items', 'get', id),
            create: (input: CreateItemInput): Promise<ProcessApiResponse<Item>> =>
                client('items', 'create', undefined, undefined, input),
            update: (id: string, input: UpdateItemInput): Promise<ProcessApiResponse<Item>> =>
                client('items', 'update', id, undefined, input),
            remove: (id: string): Promise<ProcessApiResponse<{ id: string }>> => client('items', 'remove', id),
        },
        stages: {
            get: (id: string): Promise<ProcessApiResponse<Stage>> => client('stages', 'get', id),
            update: (id: string, input: UpdateStageInput): Promise<ProcessApiResponse<Stage>> =>
                client('stages', 'update', id, undefined, input),
            changeStatus: (id: string, input: ChangeStatusInput): Promise<ProcessApiResponse<Stage>> =>
                client('stages', 'changeStatus', id, undefined, input),
            addNote: (id: string, input: CreateNoteInput): Promise<ProcessApiResponse<Note>> =>
                client('stages', 'addNote', id, undefined, input),
            addTask: (id: string, input: CreateTaskInput): Promise<ProcessApiResponse<Task>> =>
                client('stages', 'addTask', id, undefined, input),
        },
        actors: {
            list: (): Promise<ProcessApiListResponse<Actor>> => client('actors', 'list'),
            get: (id: string): Promise<ProcessApiResponse<Actor>> => client('actors', 'get', id),
            create: (input: CreateActorInput): Promise<ProcessApiResponse<Actor>> =>
                client('actors', 'create', undefined, undefined, input),
            update: (id: string, input: Omit<UpdateActorInput, 'id'>): Promise<ProcessApiResponse<Actor>> =>
                client('actors', 'update', id, undefined, input),
            deactivate: (id: string): Promise<ProcessApiResponse<Actor>> => client('actors', 'deactivate', id),
            activate: (id: string): Promise<ProcessApiResponse<Actor>> => client('actors', 'activate', id),
        },
        tools: {
            hello: async (id?: string, param?: any, body?: any): Promise<ProcessApiResponse<string>> =>
                client('tools', 'hello', id, param, body),
            list: (): Promise<ProcessApiListResponse<Tool>> => client('tools', 'list'),
            get: (id: string): Promise<ProcessApiResponse<Tool>> => client('tools', 'get', id),
            create: async (input: CreateToolInput): Promise<ProcessApiResponse<Tool>> =>
                client('tools', 'create', undefined, undefined, input),
            update: (id: string, input: UpdateToolInput): Promise<ProcessApiResponse<Tool>> =>
                client('tools', 'update', id, undefined, input),
            deactivate: (id: string): Promise<ProcessApiResponse<Tool>> => client('tools', 'deactivate', id),
            activate: (id: string): Promise<ProcessApiResponse<Tool>> => client('tools', 'activate', id),
        },
        tasks: {
            changeStatus: (id: string, input: ChangeStatusInput): Promise<ProcessApiResponse<Task>> =>
                client('tasks', 'changeStatus', id, undefined, input),
            addNote: (id: string, input: CreateNoteInput): Promise<ProcessApiResponse<Note>> =>
                client('tasks', 'addNote', id, undefined, input),
        },
        notes: {
            resolve: (id: string, input: { resolvedByActorId?: string }): Promise<ProcessApiResponse<Note>> =>
                client('notes', 'resolve', id, undefined, input),
            reopen: (id: string): Promise<ProcessApiResponse<Note>> => client('notes', 'reopen', id),
        },
    });
};
