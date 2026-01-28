import { API_URL } from '../core';

const STORAGE_KEY = 'x-api-key';

export const getStoredApiKey = (): string | null => {
    return localStorage.getItem(STORAGE_KEY);
};

export const setStoredApiKey = (key: string): void => {
    localStorage.setItem(STORAGE_KEY, key);
};

export const clearStoredApiKey = (): void => {
    localStorage.removeItem(STORAGE_KEY);
};

/**
 * Validate API key by calling session endpoint
 * Returns true if valid, false otherwise
 */
export const validateApiKey = async (key: string): Promise<boolean> => {
    try {
        const response = await fetch(`${API_URL}/0/session`, {
            method: 'GET',
            headers: {
                'x-api-key': key,
            },
        });
        return response.ok;
    } catch {
        return false;
    }
};
