import { create } from 'zustand';

import { LANGUAGE_KEY, getWebCoreOrNull, isOAuthEnabled } from '../core';
import {
    clearStoredApiKey,
    getStoredApiKey,
    getStoredApiKeys,
    maskKey,
    setStoredApiKey,
    setStoredApiKeys,
} from '../utils/apiKey';

import type { ApiKeyProfile, StoredApiKey } from '../utils/apiKey';
import type { AWSWebCoreState } from '@lemoncloud/lemon-web-core';

export interface UserProfile {
    id: string;
    name: string;
    email?: string;
    roles?: string[];
    [key: string]: unknown;
}

export type UserView = Partial<UserProfile>;

export interface WebCoreState {
    initState?: AWSWebCoreState;
    isInitialized: boolean;
    isAuthenticated: boolean;
    error: Error | null;
    profile: UserProfile | null;
    userName: string;
    apiKey: string | null;
    apiKeys: StoredApiKey[];
    hasGeminiKey: boolean;
    hasOpenaiKey: boolean;
    /** Workspace has ≥1 AI API key configured (server-authoritative). Source: GET /flows/0/profile. */
    useApiKey: boolean;
}

export interface WebCoreStore extends WebCoreState {
    initialize: () => Promise<void>;
    logout: () => Promise<void>;
    setIsAuthenticated: (isAuth: boolean) => void;
    setProfile: (profile: UserProfile) => void;
    updateProfile: (user: UserView) => void;
    registerLogoutCallback: (callback: () => void) => () => void;
    setAiKeyStatus: (status: { hasGeminiKey: boolean; hasOpenaiKey: boolean; useApiKey: boolean }) => void;
    setApiKey: (key: string) => void;
    clearApiKey: () => void;
    addApiKey: (key: string, options?: { label?: string; profile?: ApiKeyProfile }) => void;
    removeApiKey: (key: string) => void;
    switchApiKey: (key: string) => void;
    updateKeyProfile: (key: string, profile: ApiKeyProfile) => void;
    markKeyInvalid: (key: string) => void;
}

const initialState: WebCoreState = {
    initState: undefined,
    isInitialized: false,
    isAuthenticated: false,
    error: null,
    profile: null,
    userName: '',
    apiKey: getStoredApiKey(),
    apiKeys: getStoredApiKeys(),
    hasGeminiKey: false,
    hasOpenaiKey: false,
    useApiKey: false,
};

export const useWebCoreStore = create<WebCoreStore>()(set => {
    const logoutCallbacks: Set<() => void> = new Set();

    return {
        ...initialState,

        initialize: async () => {
            set({ isInitialized: false, error: null });

            const webCore = getWebCoreOrNull();
            if (webCore) {
                // OAuth mode: initialize webCore and check auth state
                const initState = await webCore.init();
                await webCore.setUseXLemonLanguage(true, LANGUAGE_KEY);
                const isAuthenticated = await webCore.isAuthenticated();
                set({ isInitialized: true, isAuthenticated, initState: initState as AWSWebCoreState });
            } else {
                // API-key-only mode: just mark as initialized
                set({ isInitialized: true });
            }
        },

        logout: async () => {
            logoutCallbacks.forEach(callback => {
                try {
                    callback();
                } catch (error) {
                    console.error('[WebCore] Logout callback error:', error);
                }
            });

            const webCore = getWebCoreOrNull();
            if (webCore) {
                await webCore.logout();
            }

            clearStoredApiKey();
            set({
                isAuthenticated: false,
                profile: null,
                userName: '',
                apiKey: null,
                hasGeminiKey: false,
                hasOpenaiKey: false,
                useApiKey: false,
            });

            if (isOAuthEnabled) {
                window.location.href = '/auth/login';
            }
        },

        setIsAuthenticated: (isAuthenticated: boolean) => set({ isAuthenticated }),

        setProfile: (profile: UserProfile) =>
            set({
                profile,
                userName: profile.name || 'Unknown',
            }),

        updateProfile: (user: UserView) => {
            set(state => {
                if (!state.profile) return state;
                const profile = { ...state.profile, ...user };
                return {
                    ...state,
                    profile,
                    userName: profile.name || state.userName,
                };
            });
        },

        registerLogoutCallback: (callback: () => void) => {
            logoutCallbacks.add(callback);
            return () => {
                logoutCallbacks.delete(callback);
            };
        },

        setAiKeyStatus: (status: { hasGeminiKey: boolean; hasOpenaiKey: boolean; useApiKey: boolean }) =>
            set(state =>
                state.hasGeminiKey === status.hasGeminiKey &&
                state.hasOpenaiKey === status.hasOpenaiKey &&
                state.useApiKey === status.useApiKey
                    ? state
                    : status
            ),

        setApiKey: (key: string) => {
            setStoredApiKey(key);
            set({ apiKey: key });
        },

        clearApiKey: () => {
            clearStoredApiKey();
            set({ apiKey: null });
        },

        addApiKey: (key: string, options?: { label?: string; profile?: ApiKeyProfile }) => {
            set(state => {
                if (state.apiKeys.some(k => k.key === key)) return state;

                const newEntry: StoredApiKey = {
                    key,
                    label: options?.label || maskKey(key),
                    validated: !!options?.profile,
                    profile: options?.profile,
                    addedAt: Date.now(),
                };
                const updated = [...state.apiKeys, newEntry];
                setStoredApiKeys(updated);
                return { apiKeys: updated };
            });
        },

        removeApiKey: (key: string) => {
            set(state => {
                const updated = state.apiKeys.filter(k => k.key !== key);
                setStoredApiKeys(updated);

                // If removing active key, clear it
                if (state.apiKey === key) {
                    clearStoredApiKey();
                    return { apiKeys: updated, apiKey: null };
                }
                return { apiKeys: updated };
            });
        },

        switchApiKey: (key: string) => {
            setStoredApiKey(key);
            set({ apiKey: key, profile: null, hasGeminiKey: false, hasOpenaiKey: false, useApiKey: false });
        },

        updateKeyProfile: (key: string, profile: ApiKeyProfile) => {
            set(state => {
                const updated = state.apiKeys.map(k => (k.key === key ? { ...k, profile, validated: true } : k));
                setStoredApiKeys(updated);
                return { apiKeys: updated };
            });
        },

        markKeyInvalid: (key: string) => {
            set(state => {
                const updated = state.apiKeys.map(k =>
                    k.key === key ? { ...k, validated: false, profile: undefined } : k
                );
                setStoredApiKeys(updated);
                return { apiKeys: updated };
            });
        },
    };
});
