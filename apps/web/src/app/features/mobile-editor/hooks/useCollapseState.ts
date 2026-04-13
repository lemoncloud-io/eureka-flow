import { useEffect, useState } from 'react';

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
    const [manuallyExpanded, setManuallyExpanded] = useState<Set<string>>(new Set());

    const toggleCollapse = (nodeId: string) => {
        setCollapsedNodes(prev => {
            const next = new Set(prev);
            if (next.has(nodeId)) {
                next.delete(nodeId);
                // User manually expanded → exclude from auto-collapse
                setManuallyExpanded(me => new Set(me).add(nodeId));
            } else {
                next.add(nodeId);
                // User manually collapsed → remove from manual expand tracking
                setManuallyExpanded(me => {
                    const n = new Set(me);
                    n.delete(nodeId);
                    return n;
                });
            }
            return next;
        });
    };

    const collapseAll = () => {
        setCollapsedNodes(new Set(nodes.map(n => n.id)));
        setManuallyExpanded(new Set());
    };

    const expandAll = () => {
        setCollapsedNodes(new Set());
        setManuallyExpanded(new Set());
    };

    // Auto-collapse COMPLETED, force-expand RUNNING/ERROR
    useEffect(() => {
        nodes.forEach(node => {
            const state = node.state ?? 'IDLE';
            if (state === 'COMPLETED' && !manuallyExpanded.has(node.id)) {
                setCollapsedNodes(prev => {
                    if (prev.has(node.id)) return prev;
                    return new Set(prev).add(node.id);
                });
            }
            if (state === 'RUNNING' || state === 'ERROR') {
                setCollapsedNodes(prev => {
                    if (!prev.has(node.id)) return prev;
                    const next = new Set(prev);
                    next.delete(node.id);
                    return next;
                });
                // Reset manual expand tracking on new run
                setManuallyExpanded(prev => {
                    if (!prev.has(node.id)) return prev;
                    const next = new Set(prev);
                    next.delete(node.id);
                    return next;
                });
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nodes.map(n => `${n.id}:${n.state}`).join(',')]);

    const isAllCollapsed = nodes.length > 0 && collapsedNodes.size >= nodes.length;

    return { collapsedNodes, toggleCollapse, collapseAll, expandAll, isAllCollapsed };
};
