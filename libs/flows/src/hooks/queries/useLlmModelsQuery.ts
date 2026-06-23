import { useQuery } from '@tanstack/react-query';

import { modelsKeys } from './keys';
import { listLlmModels } from '../../api';

import type { LlmModelProvider } from '@lemoncloud/eureka-flows-api';

/**
 * Query hook for the available LLM model catalog (with expected credit price).
 *
 * The catalog is relatively static, so we use a longer staleTime.
 * `retry: false` — listLlmModels uses withRetry internally.
 */
export const useLlmModelsQuery = (params: { image: boolean; provider?: LlmModelProvider }, enabled = true) => {
    return useQuery({
        queryKey: modelsKeys.list(params.image, params.provider),
        queryFn: () => listLlmModels({ image: params.image, provider: params.provider }),
        staleTime: 5 * 60 * 1000, // 5 minutes - catalog rarely changes
        enabled,
        retry: false,
    });
};
