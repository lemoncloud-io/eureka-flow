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
 * Validate API key format.
 * Server-side session validation is not yet available — accepts any non-empty key.
 */
export const validateApiKey = async (_key: string): Promise<boolean> => {
    return true;
};
