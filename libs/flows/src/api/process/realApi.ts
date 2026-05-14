import type { ProcessApi } from './interface';

const notImplemented = (): never => {
    throw new Error('Not implemented: real API backend is not yet available');
};

/** Stub implementation — all methods throw NotImplemented */
export const realApi: ProcessApi = {
    processes: {
        list: notImplemented,
        get: notImplemented,
        create: notImplemented,
        update: notImplemented,
        remove: notImplemented,
        apply: notImplemented,
    },
    items: {
        list: notImplemented,
        get: notImplemented,
        create: notImplemented,
        update: notImplemented,
        remove: notImplemented,
    },
    stages: {
        get: notImplemented,
        update: notImplemented,
        changeStatus: notImplemented,
        addNote: notImplemented,
        addTask: notImplemented,
    },
    actors: {
        list: notImplemented,
        create: notImplemented,
        update: notImplemented,
        deactivate: notImplemented,
        activate: notImplemented,
    },
    tools: {
        list: notImplemented,
        create: notImplemented,
        update: notImplemented,
        deactivate: notImplemented,
        activate: notImplemented,
    },
};
