import { useQuery } from '@tanstack/react-query';

import { logsKeys } from './keys';
import { fetchBlockLogs } from '../../api';

export const useBlockLogsQuery = (nodeId: string) =>
    useQuery({
        queryKey: logsKeys.node(nodeId),
        queryFn: () => fetchBlockLogs(nodeId),
    });
