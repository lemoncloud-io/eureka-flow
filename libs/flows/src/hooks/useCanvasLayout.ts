import { useCallback } from 'react';

import { useCanvasStore } from '../stores';
import { useFlowsStore } from '../stores/useFlowsStore';

import type { BlockDefinition, NodeData } from '@lemoncloud/eureka-flows-api';

/** Layout configuration for auto-layout algorithm */
export const LAYOUT_CONFIG = {
    /** Horizontal spacing between levels (columns) */
    LEVEL_WIDTH: 300,
    /** Minimum vertical gap between nodes */
    MIN_GAP: 30,
    /** Default node height when definition is unavailable */
    DEFAULT_HEIGHT: 180,
    /** Initial X position */
    START_X: 50,
    /** Initial Y position */
    START_Y: 50,
} as const;

/** Node height estimation constants */
const NODE_HEIGHT = {
    /** Base: header(40) + description(20) + border(10) + padding(40) */
    BASE: 110,
    /** Height per port row */
    PORT_ROW: 26,
    /** Extra height for input nodes (Run button + visualization) */
    INPUT_NODE: 100,
    /** Extra height for console-log nodes (visualization area) */
    DEBUG_LOG: 120,
    /** Extra height for result-preview nodes (image area) */
    PREVIEW: 100,
    /** Extra height for error state (error message box) */
    ERROR: 70,
} as const;

/**
 * Estimate node height based on node type and port count.
 * Avoids DOM measurement timing issues while providing accurate spacing.
 */
export const estimateNodeHeight = (node: NodeData, definition: BlockDefinition | undefined): number => {
    if (!definition) return LAYOUT_CONFIG.DEFAULT_HEIGHT;

    const portCount = Math.max(definition.inputs.length, definition.outputs.length);
    const portsHeight = portCount * NODE_HEIGHT.PORT_ROW;

    let extraHeight = 0;
    // Use definition.type since loaded nodes may have blockId as type
    if (definition.type.startsWith('input-')) extraHeight += NODE_HEIGHT.INPUT_NODE;
    if (definition.type === 'console-log') extraHeight += NODE_HEIGHT.DEBUG_LOG;
    if (definition.type === 'result-preview') extraHeight += NODE_HEIGHT.PREVIEW;
    if (node.status === 'ERROR') extraHeight += NODE_HEIGHT.ERROR;

    return NODE_HEIGHT.BASE + portsHeight + extraHeight;
};

interface UseCanvasLayoutOptions {
    readOnly?: boolean;
    onBeforeLayout?: () => void;
}

/**
 * Hook for canvas layout operations
 *
 * Provides auto-layout algorithm using topological sort
 * to arrange nodes in a left-to-right flow.
 */
export const useCanvasLayout = ({ readOnly, onBeforeLayout }: UseCanvasLayoutOptions = {}) => {
    const { nodes, connections, setNodes, setViewport } = useCanvasStore();
    const { blockRegistry } = useFlowsStore();

    /**
     * Auto-arrange nodes using topological sort
     *
     * Algorithm:
     * 1. Build adjacency list and calculate in-degrees
     * 2. Use Kahn's algorithm for topological sort to assign levels
     * 3. Sort nodes within each level by average parent Y position
     * 4. Position nodes in a grid layout
     */
    const autoLayout = useCallback(() => {
        if (readOnly) return;
        if (nodes.length === 0) return;

        // Call optional callback before layout (e.g., save checkpoint)
        onBeforeLayout?.();

        // Build graph structure
        const adj: Record<string, string[]> = {};
        const inDegree: Record<string, number> = {};
        const incomingEdges: Record<string, string[]> = {};

        nodes.forEach(n => {
            adj[n.id] = [];
            incomingEdges[n.id] = [];
            inDegree[n.id] = 0;
        });

        connections.forEach(c => {
            if (adj[c.sourceNodeId] && adj[c.targetNodeId] !== undefined) {
                adj[c.sourceNodeId].push(c.targetNodeId);
                incomingEdges[c.targetNodeId].push(c.sourceNodeId);
                inDegree[c.targetNodeId]++;
            }
        });

        // Topological sort using Kahn's algorithm
        const levels: Record<string, number> = {};
        const queue: string[] = [];

        // Start with nodes that have no incoming edges
        nodes.forEach(n => {
            if (inDegree[n.id] === 0) {
                queue.push(n.id);
                levels[n.id] = 0;
            }
        });

        const processed = new Set<string>();
        const tempInDegree = { ...inDegree };

        while (queue.length > 0) {
            const current = queue.shift();
            if (!current) continue;

            processed.add(current);

            const neighbors = adj[current] || [];
            neighbors.forEach(neighbor => {
                levels[neighbor] = Math.max(levels[neighbor] || 0, (levels[current] || 0) + 1);
                tempInDegree[neighbor]--;
                if (tempInDegree[neighbor] === 0) {
                    queue.push(neighbor);
                }
            });
        }

        // Handle cyclic nodes (place them at the end)
        let maxLevel = 0;
        Object.values(levels).forEach(l => (maxLevel = Math.max(maxLevel, l)));

        nodes.forEach(n => {
            if (!processed.has(n.id)) {
                levels[n.id] = maxLevel + 1;
            }
        });

        // Group nodes by level
        const levelGroups: Record<number, NodeData[]> = {};
        nodes.forEach(n => {
            const level = levels[n.id] || 0;
            if (!levelGroups[level]) levelGroups[level] = [];
            levelGroups[level].push(n);
        });

        // Sort levels and position nodes
        const sortedLevels = Object.keys(levelGroups)
            .map(Number)
            .sort((a, b) => a - b);

        const nodeYPositions: Record<string, number> = {};
        const positionedNodes = [...nodes];

        sortedLevels.forEach(level => {
            const group = levelGroups[level];

            // Sort nodes within level by average parent Y position
            group.sort((a, b) => {
                const getAvgParentY = (nodeId: string) => {
                    const parents = incomingEdges[nodeId];
                    if (parents.length === 0) return 0;
                    const sum = parents.reduce((acc, pid) => acc + (nodeYPositions[pid] || 0), 0);
                    return sum / parents.length;
                };

                const avgA = getAvgParentY(a.id);
                const avgB = getAvgParentY(b.id);

                // If similar Y positions, sort by ID for consistency
                if (Math.abs(avgA - avgB) < 10) return a.id.localeCompare(b.id);
                return avgA - avgB;
            });

            // Position each node in the group with dynamic height-based spacing
            let currentY = LAYOUT_CONFIG.START_Y;
            group.forEach(node => {
                const x = LAYOUT_CONFIG.START_X + level * LAYOUT_CONFIG.LEVEL_WIDTH;
                const y = currentY;

                nodeYPositions[node.id] = y;

                const nodeIndex = positionedNodes.findIndex(n => n.id === node.id);
                if (nodeIndex !== -1) {
                    positionedNodes[nodeIndex] = {
                        ...positionedNodes[nodeIndex],
                        position: { x, y },
                    };
                }

                // Advance Y by estimated node height + gap
                const nodeHeight = estimateNodeHeight(node, blockRegistry[node.type]);
                currentY += nodeHeight + LAYOUT_CONFIG.MIN_GAP;
            });
        });

        // Apply new positions and reset viewport
        setNodes(positionedNodes);
        setViewport({ x: 20, y: 20, zoom: 1 });
    }, [readOnly, nodes, connections, onBeforeLayout, setNodes, setViewport, blockRegistry]);

    return {
        autoLayout,
    };
};
