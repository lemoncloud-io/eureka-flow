import { fromServer, toServer } from './adapters';
import { proxyCall } from './proxyClient';

import type { ProcessApi } from './interface';
import type {
    Actor,
    Item,
    ItemListParams,
    Note,
    Process,
    ProcessApiListResponse,
    ProcessApiResponse,
    Stage,
    Task,
    Tool,
} from '../../types/process';

/**
 * Real API implementation using server proxy pattern.
 *
 * All calls go through: POST /flows/:id/proxy?type=X&cmd=Y
 * Server field `flowId` is mapped to frontend `processId` at this boundary.
 */

// --- Helper: adapt response data ---

const adaptResponse = <T>(res: ProcessApiResponse<T>): ProcessApiResponse<T> => ({
    ...res,
    data: fromServer(res.data),
});

const adaptListResponse = <T>(res: ProcessApiListResponse<T>): ProcessApiListResponse<T> => ({
    ...res,
    data: res.data.map(fromServer),
});

// --- Stub for server commands not yet available ---

const notYetAvailable = (method: string) => async () => {
    throw new Error(`Server command not yet available: ${method}. Use mock API for now.`);
};

// --- Implementation ---

export const realApi: ProcessApi = {
    processes: {
        list: async () => {
            const res = await proxyCall<ProcessApiListResponse<Process>>('flows', 'list');
            return adaptListResponse(res);
        },
        get: async id => {
            const res = await proxyCall<ProcessApiResponse<Process>>('flows', 'get', id);
            return adaptResponse(res);
        },
        create: async input => {
            const res = await proxyCall<ProcessApiResponse<Process>>('flows', 'create', '0', toServer(input));
            return adaptResponse(res);
        },
        update: async (id, input) => {
            const res = await proxyCall<ProcessApiResponse<Process>>('flows', 'update', id, toServer(input));
            return adaptResponse(res);
        },
        remove: async id => {
            return proxyCall<ProcessApiResponse<{ id: string }>>('flows', 'remove', id);
        },
        apply: async (id, input) => {
            const res = await proxyCall<ProcessApiResponse<Item>>('flows', 'apply', id, toServer(input));
            return adaptResponse(res);
        },
    },

    items: {
        list: async (params?: ItemListParams) => {
            const res = await proxyCall<ProcessApiListResponse<Item>>('items', 'list', '0', params);
            return adaptListResponse(res);
        },
        get: async id => {
            const res = await proxyCall<ProcessApiResponse<Item>>('items', 'get', id);
            return adaptResponse(res);
        },
        create: async input => {
            const res = await proxyCall<ProcessApiResponse<Item>>('items', 'create', '0', toServer(input));
            return adaptResponse(res);
        },
        update: async (id, input) => {
            const res = await proxyCall<ProcessApiResponse<Item>>('items', 'update', id, toServer(input));
            return adaptResponse(res);
        },
        remove: async id => {
            return proxyCall<ProcessApiResponse<{ id: string }>>('items', 'remove', id);
        },
    },

    stages: {
        get: async id => {
            const res = await proxyCall<ProcessApiResponse<Stage>>('stages', 'get', id);
            return adaptResponse(res);
        },
        update: async (id, input) => {
            const res = await proxyCall<ProcessApiResponse<Stage>>('stages', 'update', id, toServer(input));
            return adaptResponse(res);
        },
        changeStatus: async (id, input) => {
            const res = await proxyCall<ProcessApiResponse<Stage>>('stages', 'changeStatus', id, input);
            return adaptResponse(res);
        },
        addNote: async (id, input) => {
            const res = await proxyCall<ProcessApiResponse<Note>>('stages', 'addNote', id, input);
            return adaptResponse(res);
        },
        addTask: async (id, input) => {
            const res = await proxyCall<ProcessApiResponse<Task>>('stages', 'addTask', id, input);
            return adaptResponse(res);
        },
    },

    // Server may not support these yet — stub with clear error
    tasks: {
        changeStatus: notYetAvailable('tasks.changeStatus') as ProcessApi['tasks']['changeStatus'],
        addNote: notYetAvailable('tasks.addNote') as ProcessApi['tasks']['addNote'],
    },

    notes: {
        resolve: notYetAvailable('notes.resolve') as ProcessApi['notes']['resolve'],
        reopen: notYetAvailable('notes.reopen') as ProcessApi['notes']['reopen'],
    },

    actors: {
        list: async () => {
            return proxyCall<ProcessApiListResponse<Actor>>('actors', 'list');
        },
        create: async input => {
            return proxyCall<ProcessApiResponse<Actor>>('actors', 'create', '0', input);
        },
        update: async (id, input) => {
            return proxyCall<ProcessApiResponse<Actor>>('actors', 'update', id, input);
        },
        deactivate: async id => {
            return proxyCall<ProcessApiResponse<Actor>>('actors', 'deactivate', id);
        },
        activate: async id => {
            return proxyCall<ProcessApiResponse<Actor>>('actors', 'activate', id);
        },
    },

    tools: {
        list: async () => {
            return proxyCall<ProcessApiListResponse<Tool>>('tools', 'list');
        },
        create: async input => {
            return proxyCall<ProcessApiResponse<Tool>>('tools', 'create', '0', input);
        },
        update: async (id, input) => {
            return proxyCall<ProcessApiResponse<Tool>>('tools', 'update', id, input);
        },
        deactivate: async id => {
            return proxyCall<ProcessApiResponse<Tool>>('tools', 'deactivate', id);
        },
        activate: async id => {
            return proxyCall<ProcessApiResponse<Tool>>('tools', 'activate', id);
        },
    },
};
