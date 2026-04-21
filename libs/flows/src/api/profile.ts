import { api } from '@flows/web-core';

import type { ProfileResponse } from '../types';

export const getProfile = async (): Promise<ProfileResponse> => {
    const response = await api.get<ProfileResponse>('/flows/0/profile', { _skipAuthError: true });
    return response.data;
};

export const saveAiKey = async (provider: 'gemini' | 'openai', apiKey: string): Promise<ProfileResponse> => {
    const body = provider === 'gemini' ? { geminiApiKey: apiKey } : { openaiApiKey: apiKey };
    const response = await api.post<ProfileResponse>('/flows/0/profile', body, { _skipAuthError: true });
    return response.data;
};
