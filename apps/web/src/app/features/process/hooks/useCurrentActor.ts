import { useCallback, useState } from 'react';

import { useActors } from '@flows/flows';

const STORAGE_KEY = 'process-navigator:current-actor-id';

export const useCurrentActor = () => {
    const [actorId, setActorIdState] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));
    const { data: actorsData } = useActors();
    const actors = actorsData?.data ?? [];
    const currentActor = actors.find(a => a.id === actorId) ?? null;

    const setCurrentActor = useCallback((id: string | null) => {
        if (id) {
            localStorage.setItem(STORAGE_KEY, id);
        } else {
            localStorage.removeItem(STORAGE_KEY);
        }
        setActorIdState(id);
    }, []);

    return { currentActor, currentActorId: actorId, setCurrentActor, actors };
};
