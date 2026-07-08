import { api } from '@flows/web-core';

import type { ProfileResponse, Project, Workspace } from '../types';

/** AI key availability + workspace/project context derived from a profile response, stored in useWebCoreStore. */
export interface AiKeyStatus {
    hasGeminiKey: boolean;
    hasOpenaiKey: boolean;
    useApiKey: boolean;
    workspace: Workspace | null;
    project: Project | null;
}

/**
 * Map a profile response to AI key status. `useApiKey` is server-authoritative;
 * when omitted, fall back to "has any provider key configured". `workspace$`/`project$`
 * are optional (older servers omit them) and normalise to null.
 */
export const toAiKeyStatus = (data: ProfileResponse): AiKeyStatus => ({
    hasGeminiKey: !!data.geminiApiKey,
    hasOpenaiKey: !!data.openaiApiKey,
    useApiKey: data.useApiKey ?? (!!data.geminiApiKey || !!data.openaiApiKey),
    workspace: data.workspace$ ?? null,
    project: data.project$ ?? null,
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
