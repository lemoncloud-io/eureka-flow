import { useMemo } from 'react';

import { topologicalSort } from '../utils';

import type { Connection, NodeData } from '@lemoncloud/eureka-flows-api';

export const useMobileNodeOrder = (nodes: NodeData[], connections: Connection[]) => {
    const orderedNodeIds = useMemo(() => topologicalSort(nodes, connections), [nodes, connections]);

    return { orderedNodeIds };
};
