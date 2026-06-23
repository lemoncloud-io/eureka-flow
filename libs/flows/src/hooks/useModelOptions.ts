import { useLlmModelsQuery } from './queries';
import { isAiBlock, isImageAiBlock } from '../utils';

import type { LlmModelView } from '@lemoncloud/eureka-flows-api';

export interface ModelOptions {
    models: LlmModelView[];
    /** server-recommended default model name */
    defaultModel: string;
    isLoading: boolean;
    /** catalog unavailable (error or empty) → caller should degrade to the block's static options */
    shouldFallback: boolean;
    /** image catalog (price is per generated image) vs text catalog (price is per standard run) */
    isImage: boolean;
}

/**
 * Resolve the LLM model catalog for a given block type.
 * - image blocks → image catalog; text/json blocks → text catalog
 * - only enabled for AI blocks (non-AI blocks skip the request)
 */
export const useModelOptions = (blockType: string | undefined): ModelOptions => {
    const enabled = !!blockType && isAiBlock(blockType);
    const image = !!blockType && isImageAiBlock(blockType);

    const { data, isLoading, isError } = useLlmModelsQuery({ image }, enabled);
    const models = data?.list ?? [];

    return {
        models,
        defaultModel: data?.default ?? '',
        isLoading: enabled && isLoading,
        shouldFallback: !isLoading && (isError || models.length === 0),
        isImage: image,
    };
};
