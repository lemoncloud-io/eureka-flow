import { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { GraphCanvas, darkTheme, lightTheme, useSelection } from 'reagraph';

import { useFlowGraphQuery } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { useTheme } from '@flows/theme';

import type { GraphCanvasRef, GraphEdge, GraphNode, InternalGraphNode, LayoutTypes } from 'reagraph';

/** Node execution state → fill color mapping (hex required by Three.js) */
const STATE_FILLS: Record<string, string> = {
    IDLE: '#6b7280',
    READY: '#3b82f6',
    RUNNING: '#eab308',
    COMPLETED: '#22c55e',
    ERROR: '#ef4444',
};

const DEFAULT_FILL = '#6b7280';

/** Check if string is an emoji (not a URL) */
const isEmoji = (s?: string): boolean => {
    if (!s) return false;
    return !s.startsWith('http') && !s.startsWith('/');
};

interface FlowGraphViewProps {
    flowId: string | null;
    className?: string;
    onNodeClick?: (nodeId: string) => void;
    layoutType?: LayoutTypes;
}

const toGraphNodes = (nodes: { id: string; label: string; icon?: string; state?: string }[]): GraphNode[] =>
    nodes.map(n => ({
        id: n.id,
        // Prepend emoji to label since reagraph icon prop expects a URL, not emoji characters
        label: isEmoji(n.icon) ? `${n.icon} ${n.label}` : n.label,
        icon: isEmoji(n.icon) ? undefined : n.icon,
        fill: STATE_FILLS[n.state ?? ''] ?? DEFAULT_FILL,
    }));

const toGraphEdges = (edges: { source: string; target: string; id?: string; label?: string }[]): GraphEdge[] =>
    edges.map((e, i) => ({
        id: e.id ?? `${e.source}-${e.target}-${i}`,
        source: e.source,
        target: e.target,
        label: e.label,
    }));

export const FlowGraphView = ({
    flowId,
    className,
    onNodeClick,
    layoutType = 'forceDirected2d',
}: FlowGraphViewProps) => {
    const { t } = useTranslation(['flows']);
    const graphRef = useRef<GraphCanvasRef>(null);
    const { isDarkTheme } = useTheme();
    const { data, isLoading } = useFlowGraphQuery(flowId);

    const nodes = useMemo(() => (data ? toGraphNodes(data.nodes) : []), [data]);
    const edges = useMemo(() => (data ? toGraphEdges(data.edges) : []), [data]);

    const {
        selections,
        actives,
        onNodeClick: selectionNodeClick,
        onCanvasClick,
    } = useSelection({
        ref: graphRef,
        nodes,
        edges,
        type: 'single',
        focusOnSelect: true,
    });

    const handleNodeClick = useCallback(
        (node: InternalGraphNode) => {
            selectionNodeClick(node);
            onNodeClick?.(node.id);
        },
        [selectionNodeClick, onNodeClick]
    );

    if (isLoading) {
        return (
            <div className={cn('flex items-center justify-center', className)}>
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (nodes.length === 0) {
        return (
            <div className={cn('flex items-center justify-center text-sm text-muted-foreground', className)}>
                {t('graphView.noNodes', 'No nodes to display')}
            </div>
        );
    }

    return (
        <div className={cn('w-full h-full', className)}>
            <GraphCanvas
                ref={graphRef}
                nodes={nodes}
                edges={edges}
                layoutType={layoutType}
                theme={isDarkTheme ? darkTheme : lightTheme}
                selections={selections}
                actives={actives}
                onNodeClick={handleNodeClick}
                onCanvasClick={onCanvasClick}
                edgeInterpolation="curved"
                edgeArrowPosition="end"
                cameraMode="pan"
                animated
                labelType="all"
                defaultNodeSize={5}
            />
        </div>
    );
};
