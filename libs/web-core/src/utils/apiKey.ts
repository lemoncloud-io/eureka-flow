import axios from 'axios';

import { API_URL } from '../core';

const STORAGE_KEY = 'x-api-key';
const MULTI_KEY = 'x-api-keys';

export const getStoredApiKey = (): string | null => {
    return localStorage.getItem(STORAGE_KEY);
};

export const setStoredApiKey = (key: string): void => {
    localStorage.setItem(STORAGE_KEY, key);
};

export const clearStoredApiKey = (): void => {
    localStorage.removeItem(STORAGE_KEY);
};

export interface ApiKeyProfile {
    sid: string;
    uid: string;
}

export interface StoredApiKey {
    key: string;
    label: string;
    profile?: ApiKeyProfile;
    validated: boolean;
    addedAt: number;
}

export const getStoredApiKeys = (): StoredApiKey[] => {
    try {
        const raw = localStorage.getItem(MULTI_KEY);
        if (!raw) return migrateFromSingleKey();
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed as StoredApiKey[];
    } catch {
        return [];
    }
};

export const setStoredApiKeys = (keys: StoredApiKey[]): void => {
    localStorage.setItem(MULTI_KEY, JSON.stringify(keys));
};

/**
 * One-time migration: if single key exists but multi-key array doesn't,
 * wrap the single key into the array format.
 */
const migrateFromSingleKey = (): StoredApiKey[] => {
    const singleKey = localStorage.getItem(STORAGE_KEY);
    if (!singleKey) return [];

    const migrated: StoredApiKey[] = [
        {
            key: singleKey,
            label: maskKey(singleKey),
            validated: false,
            addedAt: Date.now(),
        },
    ];
    setStoredApiKeys(migrated);
    return migrated;
};

/** Show last 6 chars of key for display */
export const maskKey = (key: string): string => {
    if (key.length <= 6) return key;
    return `***${key.slice(-6)}`;
};

export interface ProfileValidationResult {
    valid: boolean;
    profile?: ApiKeyProfile;
}

/**
 * Validate API key by calling GET /flows/0/profile with the given key.
 * Uses standalone axios (not apiClient) to avoid circular dependency with client.ts
 * and to prevent side effects on the active key in store.
 */
export const validateApiKey = async (key: string): Promise<ProfileValidationResult> => {
    try {
        const response = await axios.get<ApiKeyProfile>(`${API_URL}/_api_/flows/0/profile`, {
            headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
            timeout: 10000,
        });
        return {
            valid: true,
            profile: { sid: response.data.sid, uid: response.data.uid },
        };
    } catch {
        return { valid: false };
    }
};
