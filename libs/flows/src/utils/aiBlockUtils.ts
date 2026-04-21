/** Block types that require AI provider keys to execute */
const AI_BLOCK_TYPES = new Set(['single-image-generator', 'single-output-generator', 'schema-json-converter']);

export const isAiBlock = (blockType: string): boolean => AI_BLOCK_TYPES.has(blockType);

/** Determine required AI provider from model config value */
export const getRequiredAiProvider = (model?: string): 'gemini' | 'openai' => {
    if (model?.startsWith('gpt-')) return 'openai';
    return 'gemini';
};

/** Check if an AI block is missing the required provider key */
export const isMissingAiKey = (model: string | undefined, hasGeminiKey: boolean, hasOpenaiKey: boolean): boolean => {
    const provider = getRequiredAiProvider(model);
    return provider === 'gemini' ? !hasGeminiKey : !hasOpenaiKey;
};
