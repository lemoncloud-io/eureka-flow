import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ArrowRight, Focus, GitBranch, Orbit, Share2 } from 'lucide-react';
import { GraphCanvas, useSelection } from 'reagraph';

import { useFlowGraphQuery } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { useTheme } from '@flows/theme';
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@flows/ui-kit';

import type { ReagraphEdge, ReagraphNode } from '@flows/flows';
import type { LucideIcon } from 'lucide-react';
import type { GraphCanvasRef, GraphEdge, GraphNode, InternalGraphNode, LayoutTypes, Theme } from 'reagraph';

/** Execution state → node fill color */
const STATE_FILLS: Record<string, string> = {
    IDLE: '#6b7280',
    READY: '#3b82f6',
    RUNNING: '#eab308',
    COMPLETED: '#22c55e',
    ERROR: '#ef4444',
};

/** Role-based node colors — muted indigo palette */
const ROLE_FILLS = {
    source: '#818cf8',
    sink: '#6366f1',
    middle: '#a5b4fc',
    orphan: '#94a3b8',
};

const ROLE_LABELS: Record<string, string> = {
    source: 'Input',
    sink: 'Output',
    middle: 'Process',
    orphan: 'Disconnected',
};

/** Theme accent — #8F19F6 variants */
const THEME_ACTIVE = '#8F19F6';
const THEME_ACTIVE_LIGHT = '#B46EFA';

/** Custom dark theme */
const flowDarkTheme: Theme = {
    canvas: { background: '#1f2023', fog: null },
    node: {
        fill: '#6b7280',
        activeFill: THEME_ACTIVE_LIGHT,
        opacity: 1,
        selectedOpacity: 1,
        inactiveOpacity: 0.3,
        label: {
            color: '#d4d4d8',
            activeColor: '#ffffff',
            stroke: '#1f2023',
            strokeWidth: 3,
        },
    },
    ring: { fill: `${THEME_ACTIVE}15`, activeFill: `${THEME_ACTIVE_LIGHT}60` },
    edge: {
        fill: '#52525b',
        activeFill: THEME_ACTIVE_LIGHT,
        opacity: 0.6,
        selectedOpacity: 1,
        inactiveOpacity: 0.12,
        label: { color: '#71717a', activeColor: '#e5e5e5', stroke: '#1f2023' },
    },
    arrow: { fill: '#71717a', activeFill: THEME_ACTIVE_LIGHT },
    lasso: { background: 'rgba(143, 25, 246, 0.08)', border: 'rgba(143, 25, 246, 0.3)' },
};

/** Custom light theme */
const flowLightTheme: Theme = {
    canvas: { background: '#f5f5f6', fog: null },
    node: {
        fill: '#6b7280',
        activeFill: THEME_ACTIVE,
        opacity: 1,
        selectedOpacity: 1,
        inactiveOpacity: 0.3,
        label: {
            color: '#27272a',
            activeColor: '#000000',
            stroke: '#f5f5f6',
            strokeWidth: 3,
        },
    },
    ring: { fill: `${THEME_ACTIVE}10`, activeFill: `${THEME_ACTIVE}50` },
    edge: {
        fill: '#a1a1aa',
        activeFill: THEME_ACTIVE,
        opacity: 0.5,
        selectedOpacity: 1,
        inactiveOpacity: 0.1,
        label: { color: '#71717a', activeColor: '#27272a', stroke: '#f5f5f6' },
    },
    arrow: { fill: '#a1a1aa', activeFill: THEME_ACTIVE },
    lasso: { background: 'rgba(143, 25, 246, 0.06)', border: 'rgba(143, 25, 246, 0.25)' },
};

interface FlowGraphViewProps {
    flowId: string | null;
    className?: string;
    /** Called when user confirms navigation to a node via "Go to node" */
    onNavigateToNode?: (nodeId: string) => void;
}

const LAYOUT_OPTIONS: { type: LayoutTypes; icon: LucideIcon; label: string }[] = [
    { type: 'forceDirected2d', icon: Orbit, label: 'Force' },
    { type: 'treeLr2d', icon: GitBranch, label: 'Tree' },
    { type: 'hierarchicalLr', icon: Share2, label: 'Hierarchy' },
];

/** Classify node role based on edge connectivity */
const classifyNodeRoles = (nodes: ReagraphNode[], edges: ReagraphEdge[]): Map<string, keyof typeof ROLE_FILLS> => {
    const hasIncoming = new Set<string>();
    const hasOutgoing = new Set<string>();

    for (const e of edges) {
        hasOutgoing.add(e.source);
        hasIncoming.add(e.target);
    }

    const roles = new Map<string, keyof typeof ROLE_FILLS>();
    for (const n of nodes) {
        const isSource = !hasIncoming.has(n.id) && hasOutgoing.has(n.id);
        const isSink = hasIncoming.has(n.id) && !hasOutgoing.has(n.id);
        const isOrphan = !hasIncoming.has(n.id) && !hasOutgoing.has(n.id);

        if (isOrphan) roles.set(n.id, 'orphan');
        else if (isSource) roles.set(n.id, 'source');
        else if (isSink) roles.set(n.id, 'sink');
        else roles.set(n.id, 'middle');
    }
    return roles;
};

const toGraphNodes = (nodes: ReagraphNode[], roles: Map<string, keyof typeof ROLE_FILLS>): GraphNode[] =>
    nodes.map(n => {
        const stateFill = n.state ? STATE_FILLS[n.state] : undefined;
        const role = roles.get(n.id) ?? 'orphan';
        return {
            id: n.id,
            label: n.label,
            subLabel: ROLE_LABELS[role],
            fill: stateFill ?? ROLE_FILLS[role],
        };
    });

const toGraphEdges = (edges: ReagraphEdge[]): GraphEdge[] =>
    edges.map((e, i) => ({
        id: e.id ?? `${e.source}-${e.target}-${i}`,
        source: e.source,
        target: e.target,
        label: e.label,
    }));

export const FlowGraphView = ({ flowId, className, onNavigateToNode }: FlowGraphViewProps) => {
    const { t } = useTranslation(['flows']);
    const graphRef = useRef<GraphCanvasRef>(null);
    const { isDarkTheme } = useTheme();
    const { data, isLoading } = useFlowGraphQuery(flowId);
    const [layout, setLayout] = useState<LayoutTypes>('forceDirected2d');
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

    const roles = useMemo(() => (data ? classifyNodeRoles(data.nodes, data.edges) : new Map()), [data]);
    const nodes = useMemo(() => (data ? toGraphNodes(data.nodes, roles) : []), [data, roles]);
    const edges = useMemo(() => (data ? toGraphEdges(data.edges) : []), [data]);

    const selectedNodeData = useMemo(
        () => (selectedNodeId && data ? data.nodes.find(n => n.id === selectedNodeId) : null),
        [selectedNodeId, data]
    );

    const {
        selections,
        actives,
        onNodeClick: selectionNodeClick,
        onCanvasClick: selectionCanvasClick,
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
            setSelectedNodeId(node.id);
        },
        [selectionNodeClick]
    );

    const handleCanvasClick = useCallback(
        (event: MouseEvent) => {
            selectionCanvasClick(event);
            setSelectedNodeId(null);
        },
        [selectionCanvasClick]
    );

    const handleFitToView = useCallback(() => {
        graphRef.current?.fitNodesInView();
    }, []);

    const handleGoToNode = useCallback(() => {
        if (selectedNodeId && onNavigateToNode) {
            onNavigateToNode(selectedNodeId);
        }
    }, [selectedNodeId, onNavigateToNode]);

    if (isLoading) {
        return (
            <div className={cn('flex items-center justify-center', className)}>
                <div className="w-8 h-8 border-2 border-border/40 border-t-primary rounded-full animate-spin" />
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

    const selectedRole = selectedNodeId ? roles.get(selectedNodeId) : null;

    return (
        <div className={cn('w-full h-full relative', className)}>
            {/* Graph Canvas */}
            <GraphCanvas
                ref={graphRef}
                nodes={nodes}
                edges={edges}
                layoutType={layout}
                theme={isDarkTheme ? flowDarkTheme : flowLightTheme}
                selections={selections}
                actives={actives}
                onNodeClick={handleNodeClick}
                onCanvasClick={handleCanvasClick}
                edgeInterpolation="curved"
                edgeArrowPosition="end"
                cameraMode="pan"
                animated
                labelType="all"
                defaultNodeSize={6}
            />

            {/* Unified Floating Bottom Toolbar */}
            <TooltipProvider delayDuration={300}>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 pointer-events-auto">
                    <div
                        className={cn(
                            'flex items-center gap-1 h-10 px-1.5 rounded-xl',
                            'bg-background/80 backdrop-blur-xl border border-border/50',
                            'shadow-floating transition-all duration-200'
                        )}
                    >
                        {/* Layout Switcher */}
                        {LAYOUT_OPTIONS.map(opt => (
                            <Tooltip key={opt.type}>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant={layout === opt.type ? 'default' : 'ghost'}
                                        size="icon"
                                        className={cn('w-7 h-7 rounded-lg', layout === opt.type && 'shadow-sm')}
                                        onClick={() => setLayout(opt.type)}
                                    >
                                        <opt.icon className="w-3.5 h-3.5" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                    {opt.label}
                                </TooltipContent>
                            </Tooltip>
                        ))}

                        <div className="w-px h-5 bg-border/60 mx-0.5" />

                        {/* Fit to View */}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="w-7 h-7 rounded-lg"
                                    onClick={handleFitToView}
                                >
                                    <Focus className="w-3.5 h-3.5" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                                {t('graphView.fitToView', 'Fit to View')}
                            </TooltipContent>
                        </Tooltip>

                        <div className="w-px h-5 bg-border/60 mx-0.5" />

                        {/* Right section: node info or counts */}
                        {selectedNodeData ? (
                            <div className="flex items-center gap-2 pl-1.5 pr-0.5">
                                <div
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{ backgroundColor: ROLE_FILLS[selectedRole ?? 'orphan'] }}
                                />
                                <span className="text-xs font-medium text-foreground max-w-[140px] truncate">
                                    {selectedNodeData.label}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                    {ROLE_LABELS[selectedRole ?? 'orphan']}
                                </span>
                                {onNavigateToNode && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2 rounded-lg gap-1 text-xs text-primary hover:text-primary"
                                        onClick={handleGoToNode}
                                    >
                                        {t('graphView.goToNode', 'Go to node')}
                                        <ArrowRight className="w-3 h-3" />
                                    </Button>
                                )}
                            </div>
                        ) : (
                            <div className="flex items-center gap-1.5 px-2 text-[11px] text-muted-foreground tabular-nums">
                                <span>{nodes.length} nodes</span>
                                <span className="text-border">·</span>
                                <span>{edges.length} edges</span>
                            </div>
                        )}
                    </div>
                </div>
            </TooltipProvider>
        </div>
    );
};
