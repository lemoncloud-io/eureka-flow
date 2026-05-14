import { create } from 'zustand';

import { LANGUAGE_KEY, getWebCoreOrNull, isOAuthEnabled } from '../core';
import { clearStoredApiKey, getStoredApiKey, setStoredApiKey } from '../utils/apiKey';

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
    hasGeminiKey: boolean;
    hasOpenaiKey: boolean;
}

export interface WebCoreStore extends WebCoreState {
    initialize: () => Promise<void>;
    logout: () => Promise<void>;
    setIsAuthenticated: (isAuth: boolean) => void;
    setProfile: (profile: UserProfile) => void;
    updateProfile: (user: UserView) => void;
    registerLogoutCallback: (callback: () => void) => () => void;
    setAiKeyStatus: (status: { hasGeminiKey: boolean; hasOpenaiKey: boolean }) => void;
    setApiKey: (key: string) => void;
    clearApiKey: () => void;
}

const initialState: Pick<WebCoreStore, keyof WebCoreState> = {
    initState: undefined,
    isInitialized: false,
    isAuthenticated: false,
    error: null,
    profile: null,
    userName: '',
    apiKey: getStoredApiKey(),
    hasGeminiKey: false,
    hasOpenaiKey: false,
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

        setAiKeyStatus: (status: { hasGeminiKey: boolean; hasOpenaiKey: boolean }) =>
            set(state =>
                state.hasGeminiKey === status.hasGeminiKey && state.hasOpenaiKey === status.hasOpenaiKey
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
    };
});
