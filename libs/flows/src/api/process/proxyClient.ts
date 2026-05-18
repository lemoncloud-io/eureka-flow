import { api } from '@flows/web-core';

/**
 * Generic proxy client for Process Navigator API.
 * All commands go through: POST /flows/:id/proxy?type=X&cmd=Y
 *
 * Server dispatches based on { type, cmd } params.
 */
export const proxyCall = async <T>(type: string, cmd: string, id?: string, body?: unknown): Promise<T> => {
    const response = await api.post<T>(`/flows/${id ?? '0'}/proxy`, body ?? {}, {
        params: { type, cmd },
    });
    return response.data;
};
