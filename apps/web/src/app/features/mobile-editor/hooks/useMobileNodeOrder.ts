import { useMemo } from 'react';

import { topologicalSort } from '../utils';

import type { GraphEdge, GraphNode } from '@flows/flows';

export const useMobileNodeOrder = (nodes: GraphNode[], connections: GraphEdge[]) => {
    const orderedNodeIds = useMemo(() => topologicalSort(nodes, connections), [nodes, connections]);

    return { orderedNodeIds };
};
