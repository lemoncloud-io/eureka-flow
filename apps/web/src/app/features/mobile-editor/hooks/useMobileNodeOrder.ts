import { useMemo } from 'react';

import { useCanvasConnections, useCanvasNodes } from '@flows/flows';

import { topologicalSort } from '../utils';

export const useMobileNodeOrder = () => {
    const nodes = useCanvasNodes();
    const connections = useCanvasConnections();

    const orderedNodeIds = useMemo(() => topologicalSort(nodes, connections), [nodes, connections]);

    return { orderedNodeIds };
};
