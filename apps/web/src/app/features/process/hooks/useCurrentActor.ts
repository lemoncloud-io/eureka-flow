import { create } from 'zustand';

import { useActors } from '@flows/flows';

const STORAGE_KEY = 'process-navigator:current-actor-id';

interface CurrentActorState {
    actorId: string | null;
    setActorId: (id: string | null) => void;
}

const useCurrentActorStore = create<CurrentActorState>(set => ({
    actorId: localStorage.getItem(STORAGE_KEY),
    setActorId: (id: string | null) => {
        if (id) {
            localStorage.setItem(STORAGE_KEY, id);
        } else {
            localStorage.removeItem(STORAGE_KEY);
        }
        set({ actorId: id });
    },
}));

export const useCurrentActor = () => {
    const { actorId, setActorId } = useCurrentActorStore();
    const { data: actorsData } = useActors();
    const actors = actorsData?.data ?? [];
    const currentActor = actors.find(a => a.id === actorId) ?? null;

    return { currentActor, currentActorId: actorId, setCurrentActor: setActorId, actors };
};
