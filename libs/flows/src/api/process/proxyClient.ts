import { api } from '@flows/web-core';

/**
 * Generic proxy client for Process Navigator API.
 * Each entity type has its own proxy endpoint: POST /:type/:id/proxy?type=X&cmd=Y
 */
export const proxyCall = async <T>(type: string, cmd: string, id?: string, body?: unknown): Promise<T> => {
    const response = await api.post<T>(`/${type}/${id ?? '0'}/proxy`, body ?? {}, {
        params: { type, cmd },
    });
    return response.data;
};
