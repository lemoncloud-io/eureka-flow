import { useQuery } from '@tanstack/react-query';

import { toolKeys } from './keys';
import { processApi } from '../../api/process';

export const useTools = () => {
    return useQuery({
        queryKey: toolKeys.lists(),
        queryFn: () => processApi.tools.list(),
        staleTime: 60_000,
    });
};
