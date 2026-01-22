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
