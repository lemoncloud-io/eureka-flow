import { useQuery } from '@tanstack/react-query';

import { appsKeys } from './keys';
import { listApps } from '../../api';

/**
 * Query hook for listing the Apps owned by the signed-in user's workspace
 * GET /apps?view=mine
 */
export const useAppsListQuery = (enabled = true) => {
    return useQuery({
        queryKey: appsKeys.list(),
        queryFn: () => listApps(),
        enabled,
    });
};
