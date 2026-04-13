import { useState } from 'react';

import { useCanvasNodes } from '@flows/flows';

interface UseCollapseStateReturn {
    collapsedNodes: Set<string>;
    toggleCollapse: (nodeId: string) => void;
    collapseAll: () => void;
    expandAll: () => void;
    isAllCollapsed: boolean;
}

export const useCollapseState = (): UseCollapseStateReturn => {
    const nodes = useCanvasNodes();
    const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());

    const toggleCollapse = (nodeId: string) => {
        setCollapsedNodes(prev => {
            const next = new Set(prev);
            if (next.has(nodeId)) {
                next.delete(nodeId);
            } else {
                next.add(nodeId);
            }
            return next;
        });
    };

    const collapseAll = () => {
        setCollapsedNodes(new Set(nodes.map(n => n.id)));
    };

    const expandAll = () => {
        setCollapsedNodes(new Set());
    };

    const isAllCollapsed = nodes.length > 0 && collapsedNodes.size >= nodes.length;

    return { collapsedNodes, toggleCollapse, collapseAll, expandAll, isAllCollapsed };
};
