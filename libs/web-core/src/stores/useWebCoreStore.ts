import { create } from 'zustand';

export interface UserProfile {
    id: string;
    name: string;
    email?: string;
    roles?: string[];
}

export interface WebCoreState {
    isInitialized: boolean;
    isAuthenticated: boolean;
    error: Error | null;
    profile: UserProfile | null;
}

export interface WebCoreStore extends WebCoreState {
    initialize: () => void;
    logout: () => Promise<void>;
    setIsAuthenticated: (isAuth: boolean) => void;
    setProfile: (profile: UserProfile) => void;
    registerLogoutCallback: (callback: () => void) => () => void;
}

const initialState: Pick<WebCoreStore, keyof WebCoreState> = {
    isInitialized: false,
    isAuthenticated: false,
    error: null,
    profile: null,
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

            set({ isAuthenticated: false, profile: null });
        },

        setIsAuthenticated: (isAuthenticated: boolean) => set({ isAuthenticated }),

        setProfile: (profile: UserProfile) => set({ profile }),

        registerLogoutCallback: (callback: () => void) => {
            logoutCallbacks.add(callback);
            return () => {
                logoutCallbacks.delete(callback);
            };
        },
    };
});
