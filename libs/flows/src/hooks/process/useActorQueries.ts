import { useQuery } from '@tanstack/react-query';

import { actorKeys } from './keys';
import { processApi } from '../../api/process';

export const useActors = () => {
    return useQuery({
        queryKey: actorKeys.lists(),
        queryFn: () => processApi.actors.list(),
        staleTime: 60_000,
    });
};
