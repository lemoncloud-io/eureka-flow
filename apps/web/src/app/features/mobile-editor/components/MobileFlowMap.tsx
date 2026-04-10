import { useMemo } from 'react';

import { X } from 'lucide-react';

import {
    LAYOUT_CONFIG,
    estimateNodeHeight,
    useBlockRegistry,
    useCanvasConnections,
    useCanvasNodes,
} from '@flows/flows';

import { WorkflowCanvas } from '../../flows/components/WorkflowCanvas';

import type { BlockDefinitionWithFrontend } from '@flows/flows';
import type { Connection, NodeData } from '@lemoncloud/eureka-flows-api';

interface MobileFlowMapProps {
    open: boolean;
    onClose: () => void;
    onTapNode: (nodeId: string) => void;
}

/** Pure function: apply auto-layout positioning to nodes (same algorithm as WorkflowCanvas.autoLayout) */
const applyAutoLayout = (
    nodes: NodeData[],
    connections: Connection[],
    blockRegistry: Record<string, BlockDefinitionWithFrontend>
): NodeData[] => {
    if (nodes.length === 0) return nodes;

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

    const levels: Record<string, number> = {};
    const queue: string[] = [];

    nodes.forEach(n => {
        if (inDegree[n.id] === 0) {
            queue.push(n.id);
            levels[n.id] = 0;
        }
    });

    const processed = new Set<string>();
    const tempInDegree = { ...inDegree };

    while (queue.length > 0) {
        const u = queue.shift();
        if (!u) break;
        processed.add(u);

        for (const v of adj[u] ?? []) {
            levels[v] = Math.max(levels[v] ?? 0, (levels[u] ?? 0) + 1);
            tempInDegree[v]--;
            if (tempInDegree[v] === 0) queue.push(v);
        }
    }

    let maxLevel = 0;
    Object.values(levels).forEach(l => (maxLevel = Math.max(maxLevel, l)));

    nodes.forEach(n => {
        if (!processed.has(n.id)) levels[n.id] = maxLevel + 1;
    });

    const levelGroups: Record<number, NodeData[]> = {};
    nodes.forEach(n => {
        const l = levels[n.id] ?? 0;
        if (!levelGroups[l]) levelGroups[l] = [];
        levelGroups[l].push(n);
    });

    const sortedLevels = Object.keys(levelGroups)
        .map(Number)
        .sort((a, b) => a - b);
    const nodeYPositions: Record<string, number> = {};
    const result = [...nodes];

    sortedLevels.forEach(level => {
        const group = levelGroups[level];
        group.sort((a, b) => {
            const getAvgParentY = (nodeId: string) => {
                const parents = incomingEdges[nodeId];
                if (parents.length === 0) return 0;
                const sum = parents.reduce((acc, pid) => acc + (nodeYPositions[pid] ?? 0), 0);
                return sum / parents.length;
            };
            const avgA = getAvgParentY(a.id);
            const avgB = getAvgParentY(b.id);
            if (Math.abs(avgA - avgB) < 10) return a.id.localeCompare(b.id);
            return avgA - avgB;
        });

        let currentY = LAYOUT_CONFIG.START_Y;
        group.forEach(node => {
            const x = LAYOUT_CONFIG.START_X + level * LAYOUT_CONFIG.LEVEL_WIDTH;
            nodeYPositions[node.id] = currentY;
            const idx = result.findIndex(n => n.id === node.id);
            if (idx !== -1) {
                result[idx] = { ...result[idx], position: { x, y: currentY } };
            }
            const nodeHeight = estimateNodeHeight(node, blockRegistry[node.type]);
            currentY += nodeHeight + LAYOUT_CONFIG.MIN_GAP;
        });
    });

    return result;
};

export const MobileFlowMap = ({ open, onClose, onTapNode }: MobileFlowMapProps) => {
    const nodes = useCanvasNodes();
    const connections = useCanvasConnections();
    const blockRegistry = useBlockRegistry();

    // Snapshot + auto-layout when overlay opens
    const layoutData = useMemo(
        () => {
            if (!open) return null;
            const layoutNodes = applyAutoLayout(nodes, connections, blockRegistry);
            return { nodes: layoutNodes, connections };
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [open]
    );

    if (!open || !layoutData) return null;

    return (
        <div className="fixed inset-0 z-40 bg-background flex flex-col animate-in fade-in duration-200">
            <div className="flex items-center justify-between px-4 h-12 border-b border-border/60 shrink-0 pt-[env(safe-area-inset-top)]">
                <span className="text-sm font-semibold">Flow Overview</span>
                <button
                    onClick={onClose}
                    className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-accent/50 transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            <div className="flex-1 relative overflow-hidden">
                <WorkflowCanvas
                    readOnly
                    initialData={layoutData}
                    onNodeSelect={nodeId => {
                        if (nodeId) onTapNode(nodeId);
                    }}
                />
            </div>
        </div>
    );
};
