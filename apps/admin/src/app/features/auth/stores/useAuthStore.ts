import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthUser {
    name: string;
}

interface AuthState {
    isLoggedIn: boolean;
    user: AuthUser | null;
    login: (email: string) => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        set => ({
            isLoggedIn: false,
            user: null,
            login: (email: string) => {
                set({ isLoggedIn: true, user: { name: email } });
            },
            logout: () => {
                set({ isLoggedIn: false, user: null });
            },
        }),
        { name: 'admin-auth' }
    )
);
