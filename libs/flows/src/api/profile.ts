import { api } from '@flows/web-core';

import type { ProfileResponse } from '../types';

export const getProfile = async (): Promise<ProfileResponse> => {
    const response = await api.get<ProfileResponse>('/flows/0/profile', { _skipAuthError: true });
    return response.data;
};
