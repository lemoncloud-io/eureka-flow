import { useWebCoreStore } from '../stores';

export const useWebCore = () => {
    const profile = useWebCoreStore(state => state.profile);

    return { profile };
};
