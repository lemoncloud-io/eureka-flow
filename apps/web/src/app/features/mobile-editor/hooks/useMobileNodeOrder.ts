import { useMemo } from 'react';

import { topologicalSort } from '../utils';

import type { EdgeData, NodeData } from '@lemoncloud/eureka-flows-api';

export const useMobileNodeOrder = (nodes: NodeData[], connections: EdgeData[]) => {
    const orderedNodeIds = useMemo(() => topologicalSort(nodes, connections), [nodes, connections]);

    return { orderedNodeIds };
};
