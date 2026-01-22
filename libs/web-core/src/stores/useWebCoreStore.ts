import { create } from 'zustand';

import { clearStoredApiKey, getStoredApiKey, setStoredApiKey } from '../utils/apiKey';

export interface UserProfile {
    id: string;
    name: string;
    email?: string;
    roles?: string[];
    [key: string]: unknown;
}

export type UserView = Partial<UserProfile>;

export interface WebCoreState {
    isInitialized: boolean;
    isAuthenticated: boolean;
    error: Error | null;
    profile: UserProfile | null;
    userName: string;
    apiKey: string | null;
}

export interface WebCoreStore extends WebCoreState {
    initialize: () => void;
    logout: () => Promise<void>;
    setIsAuthenticated: (isAuth: boolean) => void;
    setProfile: (profile: UserProfile) => void;
    updateProfile: (user: UserView) => void;
    registerLogoutCallback: (callback: () => void) => () => void;
    setApiKey: (key: string) => void;
    clearApiKey: () => void;
    initializeApiKey: () => void;
}

const initialState: Pick<WebCoreStore, keyof WebCoreState> = {
    isInitialized: false,
    isAuthenticated: false,
    error: null,
    profile: null,
    userName: '',
    apiKey: null,
};

export const useWebCoreStore = create<WebCoreStore>()(set => {
    const logoutCallbacks: Set<() => void> = new Set();

    return {
        ...initialState,

        initialize: () => {
            set({ isInitialized: true, error: null });
        },

        logout: async () => {
            logoutCallbacks.forEach(callback => {
                try {
                    callback();
                } catch (error) {
                    console.error('[WebCore] Logout callback error:', error);
                }
            });

            set({ isAuthenticated: false, profile: null, userName: '' });
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

        setApiKey: (key: string) => {
            setStoredApiKey(key);
            set({ apiKey: key });
        },

        clearApiKey: () => {
            clearStoredApiKey();
            set({ apiKey: null });
        },

        initializeApiKey: () => {
            const storedKey = getStoredApiKey();
            set({ apiKey: storedKey });
        },
    };
});
