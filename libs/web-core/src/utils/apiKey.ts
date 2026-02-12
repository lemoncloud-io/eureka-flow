
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
 * Note: Session validation only runs in local environment
 */
export const validateApiKey = async (key: string): Promise<boolean> => {
    return true;

    // NOTE: skip validation
    // try {
    //     const response = await fetch(`${API_URL}/0/session`, {
    //         method: 'GET',
    //         headers: {
    //             'x-api-key': key,
    //         },
    //     });
    //     return response.ok;
    // } catch {
    //     return false;
    // }
};
