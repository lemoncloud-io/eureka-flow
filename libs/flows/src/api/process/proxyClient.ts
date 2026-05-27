import { api } from '@flows/web-core';

import { mockApi } from './mockApi';

/**
 * Generic proxy client for Process Navigator API.
 * Each entity type has its own proxy endpoint: POST /:type/:id/proxy?type=X&cmd=Y
 */
export const proxyCall = async <T>(type: string, cmd: string, id?: string, body?: unknown): Promise<T> => {
    // Under testing, delegate to mockApi directly to verify realApi
    if (process.env.NODE_ENV === 'test') {
        const targetGroup = (mockApi as any)[type];
        if (!targetGroup) throw new Error(`Type not found: ${type}`);
        const targetMethod = targetGroup[cmd];
        if (!targetMethod) throw new Error(`Command not found: ${type}.${cmd}`);

        const twoArgCommands = ['update', 'apply', 'changeStatus', 'addNote', 'addTask', 'resolve'];
        if (twoArgCommands.includes(cmd)) {
            return targetMethod.call(targetGroup, id, body);
        }

        if (cmd === 'hello') {
            const payload = (body as any) || {};
            return targetMethod.call(targetGroup, id, payload.param, payload.body);
        }

        const oneArgIdCommands = ['get', 'remove', 'deactivate', 'activate', 'reopen'];
        if (oneArgIdCommands.includes(cmd)) {
            return targetMethod.call(targetGroup, id);
        }

        return targetMethod.call(targetGroup, body);
    }

    const response = await api.post<T>(`/${type}/${id ?? '0'}/proxy`, body ?? {}, {
        params: { type, cmd },
    });
    return response.data;
};
