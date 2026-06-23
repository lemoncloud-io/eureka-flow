import { api } from '@flows/web-core';

import type { ProfileResponse } from '../types';

/** AI key availability derived from a profile response, as stored in useWebCoreStore. */
export interface AiKeyStatus {
    hasGeminiKey: boolean;
    hasOpenaiKey: boolean;
    useApiKey: boolean;
}

/**
 * Map a profile response to AI key status. `useApiKey` is server-authoritative;
 * when omitted, fall back to "has any provider key configured".
 */
export const toAiKeyStatus = (data: ProfileResponse): AiKeyStatus => ({
    hasGeminiKey: !!data.geminiApiKey,
    hasOpenaiKey: !!data.openaiApiKey,
    useApiKey: data.useApiKey ?? (!!data.geminiApiKey || !!data.openaiApiKey),
});

export const getProfile = async (): Promise<ProfileResponse> => {
    const response = await api.get<ProfileResponse>('/flows/0/profile', { _skipAuthError: true });
    return response.data;
};

export const saveAiKey = async (provider: 'gemini' | 'openai', apiKey: string): Promise<ProfileResponse> => {
    const body = provider === 'gemini' ? { geminiApiKey: apiKey } : { openaiApiKey: apiKey };
    const response = await api.post<ProfileResponse>('/flows/0/profile', body, { _skipAuthError: true });
    return response.data;
};
