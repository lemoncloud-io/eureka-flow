import { api, withRetry } from '@flows/web-core';

import type { ApiListResult, AppView } from '../types';

const _log = console.log.bind(console, '[apps-api]');

/**
 * The list endpoint does not exist on the server yet. Until it does, `listApps()`
 * returns mock rows. Flip to the real call with `VITE_APPS_API=real`.
 *
 * Same mock/real swap convention as the Process Navigator (`api/process/index.ts`).
 */
const useReal = import.meta.env.VITE_APPS_API === 'real';

/**
 * Only ids verified to resolve against `https://flow.eureka.codes/apps/:id` belong here —
 * a card whose link 404s is worse than no card. Add more real ids as Apps are deployed.
 * Delete the whole list once the server list endpoint ships.
 */
const MOCK_APPS: AppView[] = [
    {
        id: '1016828',
        name: 'AI Content Banner Generator',
        code: 'ai-content-banner-generator',
        status: 'deployed',
        deployedAt: 1748390400000,
        updatedAt: 1748390400000,
    },
];

/**
 * List the Apps owned by the signed-in user's workspace
 * GET /apps?view=mine&page=N
 */
export const listApps = async (page = 0): Promise<ApiListResult<AppView>> => {
    _log(`> listApps(page=${page}, real=${useReal})`);
    if (!useReal) return { list: MOCK_APPS, total: MOCK_APPS.length, page: 0 };

    const response = await withRetry(
        () => api.get<ApiListResult<AppView>>('/apps', { params: { view: 'mine', page } }),
        3,
        'listApps'
    );
    return response.data;
};
