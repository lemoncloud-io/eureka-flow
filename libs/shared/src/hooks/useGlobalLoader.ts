import { create } from 'zustand';

interface LoaderStore {
    isLoading: boolean;
    setIsLoading: (isLoading: boolean) => void;
}

export const useLoaderStore = create<LoaderStore>(set => ({
    isLoading: false,
    setIsLoading: (isLoading: boolean) => set({ isLoading }),
}));

export const useGlobalLoader = () => {
    const isLoading = useLoaderStore(state => state.isLoading);
    const setIsLoading = useLoaderStore(state => state.setIsLoading);

    return { isLoading, setIsLoading };
};
