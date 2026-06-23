import { api, withRetry } from '@flows/web-core';

import type { ListAvailableLlmModelsParam, ListAvailableLlmModelsResult } from '@lemoncloud/eureka-flows-api';

const _log = console.log.bind(console, '[models-api]');

/**
 * List the available LLM model catalog with the expected per-result credit price.
 *
 * Calls the keyed alias `/runs/0/models` (the no-key public alias is `/hello/models`).
 * - `image: true` → image-generation model catalog
 * - `image` omitted/false → text/json model catalog
 * - `provider` → optional `'openai' | 'gemini'` filter
 */
export const listLlmModels = async (
    params: ListAvailableLlmModelsParam = {}
): Promise<ListAvailableLlmModelsResult> => {
    const qs = new URLSearchParams();
    if (params.image) qs.set('image', '1');
    if (params.provider) qs.set('provider', params.provider);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';

    _log('> listLlmModels()', suffix);
    const res = await withRetry(
        () => api.get<ListAvailableLlmModelsResult>(`/runs/0/models${suffix}`),
        3,
        'listLlmModels'
    );
    return res.data;
};
