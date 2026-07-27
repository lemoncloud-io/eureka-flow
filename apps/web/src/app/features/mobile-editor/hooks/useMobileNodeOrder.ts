import { useMemo } from 'react';

import { topologicalSort } from '../utils';

import type { GraphNode } from '@flows/flows';
import type { EdgeData } from '@lemoncloud/eureka-flows-api';

export const useMobileNodeOrder = (nodes: GraphNode[], connections: EdgeData[]) => {
    const orderedNodeIds = useMemo(() => topologicalSort(nodes, connections), [nodes, connections]);

    return { orderedNodeIds };
};
