import { useMemo } from 'react';

import { Maximize2, X } from 'lucide-react';

import { useBlockRegistry, useCanvasConnections, useCanvasNodes } from '@flows/flows';

import { buildNodeDisplayNames } from '../utils';

const STATE_FILL: Record<string, string> = {
    IDLE: 'hsl(var(--muted-foreground) / 0.3)',
    READY: 'hsl(var(--primary))',
    RUNNING: 'hsl(var(--warning))',
    COMPLETED: 'hsl(var(--success))',
    ERROR: 'hsl(var(--destructive))',
};

const STEREO_STRIPE: Record<string, string> = {
    input: 'hsl(var(--primary))',
    process: 'hsl(var(--muted-foreground) / 0.3)',
    output: 'hsl(var(--success))',
};

interface MobileFlowMapProps {
    open: boolean;
    onClose: () => void;
    onTapNode: (nodeId: string) => void;
}

const NODE_W = 140;
const NODE_H = 40;
const GAP_X = 44;
const GAP_Y = 18;
const PADDING = 32;

export const MobileFlowMap = ({ open, onClose, onTapNode }: MobileFlowMapProps) => {
    const nodes = useCanvasNodes();
    const connections = useCanvasConnections();
    const blockRegistry = useBlockRegistry();

    const displayNames = useMemo(() => buildNodeDisplayNames(nodes, blockRegistry), [nodes, blockRegistry]);

    const layout = useMemo(() => {
        if (nodes.length === 0)
            {return {
                layers: [] as Array<Array<{ id: string; name: string; state: string; stereo: string }>>,
                edges: [] as Array<{ from: { layer: number; idx: number }; to: { layer: number; idx: number } }>,
            };}

        const nodeIds = new Set(nodes.map(n => n.id));
        const inDegree = new Map<string, number>();
        const adj = new Map<string, string[]>();

        for (const n of nodes) {
            inDegree.set(n.id, 0);
            adj.set(n.id, []);
        }
        for (const c of connections) {
            if (!nodeIds.has(c.sourceNodeId) || !nodeIds.has(c.targetNodeId)) continue;
            adj.get(c.sourceNodeId)!.push(c.targetNodeId);
            inDegree.set(c.targetNodeId, (inDegree.get(c.targetNodeId) ?? 0) + 1);
        }

        const layerMap = new Map<string, number>();
        const queue = [...inDegree.entries()].filter(([, d]) => d === 0).map(([id]) => id);
        const sortedByY = new Map(nodes.map(n => [n.id, n.position?.y ?? 0]));
        queue.sort((a, b) => (sortedByY.get(a) ?? 0) - (sortedByY.get(b) ?? 0));

        let layer = 0;
        let current = [...queue];

        while (current.length > 0) {
            const next: string[] = [];
            for (const id of current) {
                if (layerMap.has(id)) continue;
                layerMap.set(id, layer);
                for (const neighbor of adj.get(id) ?? []) {
                    const d = (inDegree.get(neighbor) ?? 1) - 1;
                    inDegree.set(neighbor, d);
                    if (d === 0) next.push(neighbor);
                }
            }
            next.sort((a, b) => (sortedByY.get(a) ?? 0) - (sortedByY.get(b) ?? 0));
            current = next;
            layer++;
        }

        for (const n of nodes) {
            if (!layerMap.has(n.id)) layerMap.set(n.id, layer++);
        }

        const maxLayer = Math.max(...layerMap.values());
        const layers: Array<Array<{ id: string; name: string; state: string; stereo: string }>> = Array.from(
            { length: maxLayer + 1 },
            () => []
        );

        for (const n of nodes) {
            const l = layerMap.get(n.id) ?? 0;
            const def = blockRegistry[n.type];
            layers[l].push({
                id: n.id,
                name: displayNames.get(n.id) ?? n.type,
                state: (n.state as string) ?? 'IDLE',
                stereo: def?.stereo ?? 'process',
            });
        }

        const nodePos = new Map<string, { layer: number; idx: number }>();
        layers.forEach((l, li) => l.forEach((n, ni) => nodePos.set(n.id, { layer: li, idx: ni })));

        const edges = connections
            .filter(c => nodePos.has(c.sourceNodeId) && nodePos.has(c.targetNodeId))
            .map(c => ({
                from: nodePos.get(c.sourceNodeId)!,
                to: nodePos.get(c.targetNodeId)!,
            }));

        return { layers, edges };
    }, [nodes, connections, blockRegistry, displayNames]);

    if (!open) return null;

    const maxNodesInLayer = Math.max(...layout.layers.map(l => l.length), 1);
    const contentW = layout.layers.length * (NODE_W + GAP_X) - GAP_X + PADDING * 2;
    const contentH = maxNodesInLayer * (NODE_H + GAP_Y) - GAP_Y + PADDING * 2;

    const getNodePos = (li: number, ni: number, layerSize: number) => {
        const totalH = layerSize * (NODE_H + GAP_Y) - GAP_Y;
        const offsetY = (contentH - totalH) / 2;
        return {
            x: PADDING + li * (NODE_W + GAP_X),
            y: offsetY + ni * (NODE_H + GAP_Y),
        };
    };

    const getCenter = (li: number, ni: number, layerSize: number) => {
        const p = getNodePos(li, ni, layerSize);
        return { x: p.x + NODE_W / 2, y: p.y + NODE_H / 2 };
    };

    const truncName = (name: string): string => (name.length <= 11 ? name : name.slice(0, 10) + '…');

    return (
        <div className="fixed inset-0 z-40 bg-background flex flex-col animate-in fade-in duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-4 h-12 border-b border-border/60 shrink-0">
                <div className="flex items-center gap-2 text-sm font-semibold">
                    <Maximize2 className="w-4 h-4 text-primary" />
                    Flow Overview
                </div>
                <button
                    onClick={onClose}
                    className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-accent/50 transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Scrollable SVG canvas */}
            <div className="flex-1 overflow-auto">
                <div
                    className="min-h-full flex items-center justify-center p-4"
                    style={{ minWidth: Math.max(contentW + 32, 320) }}
                >
                    <svg
                        width={contentW}
                        height={contentH}
                        viewBox={`0 0 ${contentW} ${contentH}`}
                        className="select-none max-w-none"
                    >
                        {/* Edges */}
                        {layout.edges.map((edge, i) => {
                            const from = getCenter(
                                edge.from.layer,
                                edge.from.idx,
                                layout.layers[edge.from.layer].length
                            );
                            const to = getCenter(edge.to.layer, edge.to.idx, layout.layers[edge.to.layer].length);
                            const cp = Math.min(Math.abs(to.x - from.x) * 0.35, 50);
                            return (
                                <path
                                    key={i}
                                    d={`M ${from.x + NODE_W / 2} ${from.y} C ${from.x + NODE_W / 2 + cp} ${from.y}, ${to.x - NODE_W / 2 - cp} ${to.y}, ${to.x - NODE_W / 2} ${to.y}`}
                                    fill="none"
                                    stroke="hsl(var(--primary) / 0.18)"
                                    strokeWidth={2}
                                    strokeLinecap="round"
                                />
                            );
                        })}

                        {/* Nodes */}
                        {layout.layers.map((layer, li) =>
                            layer.map((node, ni) => {
                                const pos = getNodePos(li, ni, layer.length);
                                const stateFill = STATE_FILL[node.state] ?? STATE_FILL.IDLE;
                                const stereoStripe = STEREO_STRIPE[node.stereo] ?? STEREO_STRIPE.process;

                                return (
                                    <g
                                        key={node.id}
                                        onClick={() => onTapNode(node.id)}
                                        className="cursor-pointer"
                                        role="button"
                                        tabIndex={0}
                                    >
                                        {/* Card shadow */}
                                        <rect
                                            x={pos.x + 1}
                                            y={pos.y + 2}
                                            width={NODE_W}
                                            height={NODE_H}
                                            rx={8}
                                            fill="hsl(var(--foreground) / 0.04)"
                                        />
                                        {/* Card background */}
                                        <rect
                                            x={pos.x}
                                            y={pos.y}
                                            width={NODE_W}
                                            height={NODE_H}
                                            rx={8}
                                            fill="hsl(var(--card))"
                                            stroke="hsl(var(--border) / 0.5)"
                                            strokeWidth={1}
                                        />
                                        {/* Category stripe (left edge) */}
                                        <rect
                                            x={pos.x + 1}
                                            y={pos.y + 6}
                                            width={3}
                                            height={NODE_H - 12}
                                            rx={1.5}
                                            fill={stereoStripe}
                                        />
                                        {/* Status dot */}
                                        <circle cx={pos.x + 16} cy={pos.y + NODE_H / 2} r={4} fill={stateFill} />
                                        {/* Label */}
                                        <text
                                            x={pos.x + 26}
                                            y={pos.y + NODE_H / 2 + 1}
                                            fill="hsl(var(--foreground))"
                                            fontSize={12}
                                            fontWeight={500}
                                            dominantBaseline="central"
                                        >
                                            {truncName(node.name)}
                                        </text>
                                    </g>
                                );
                            })
                        )}
                    </svg>
                </div>
            </div>

            {/* Legend */}
            <div className="shrink-0 border-t border-border/40 px-4 py-3 bg-muted/30">
                <div className="flex items-center justify-center gap-5 text-[11px] text-muted-foreground">
                    {[
                        { label: 'Idle', color: 'bg-muted-foreground/30' },
                        { label: 'Running', color: 'bg-warning' },
                        { label: 'Done', color: 'bg-success' },
                        { label: 'Error', color: 'bg-destructive' },
                    ].map(item => (
                        <span key={item.label} className="flex items-center gap-1.5">
                            <span className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
                            {item.label}
                        </span>
                    ))}
                </div>
                <p className="text-center text-[10px] text-muted-foreground/50 mt-1.5">Tap a node to configure</p>
            </div>
        </div>
    );
};
