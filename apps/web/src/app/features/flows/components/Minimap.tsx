import { useCallback, useMemo, useRef, useState } from 'react';

import { Map as MapIcon, X } from 'lucide-react';

import { getEffectiveState, getNodeWidth } from '@flows/flows';
import { cn } from '@flows/lib/utils';

import type { Connection, NodeData } from '@lemoncloud/eureka-flows-api';

const MINIMAP_WIDTH = 200;
const MINIMAP_HEIGHT = 140;
const MINIMAP_PADDING = 20;
const ESTIMATED_NODE_HEIGHT = 120;
const STORAGE_KEY = 'flows-minimap-visible';

const STATE_COLORS: Record<string, string> = {
    RUNNING: '#eab308',
    COMPLETED: '#22c55e',
    ERROR: '#ef4444',
    READY: '#6366f1',
};
const DEFAULT_NODE_COLOR = 'hsl(var(--muted-foreground) / 0.3)';
const VIEWPORT_FILL = 'hsl(var(--primary) / 0.08)';
const VIEWPORT_STROKE = 'hsl(var(--primary) / 0.5)';
const CONNECTION_STROKE = 'hsl(var(--muted-foreground) / 0.15)';

interface MinimapProps {
    nodes: NodeData[];
    connections: Connection[];
    viewport: { x: number; y: number; zoom: number };
    canvasWidth: number;
    canvasHeight: number;
    onViewportChange: (vp: { x: number; y: number; zoom: number }) => void;
}

const computeBounds = (nodes: NodeData[]) => {
    if (nodes.length === 0) return { minX: 0, minY: 0, maxX: 1000, maxY: 700 };

    let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
    for (const n of nodes) {
        const w = getNodeWidth(n);
        minX = Math.min(minX, n.position.x);
        minY = Math.min(minY, n.position.y);
        maxX = Math.max(maxX, n.position.x + w);
        maxY = Math.max(maxY, n.position.y + ESTIMATED_NODE_HEIGHT);
    }
    return {
        minX: minX - MINIMAP_PADDING,
        minY: minY - MINIMAP_PADDING,
        maxX: maxX + MINIMAP_PADDING,
        maxY: maxY + MINIMAP_PADDING,
    };
};

export const Minimap = ({
    nodes,
    connections,
    viewport,
    canvasWidth,
    canvasHeight,
    onViewportChange,
}: MinimapProps) => {
    const [visible, setVisible] = useState(() => {
        try {
            return localStorage.getItem(STORAGE_KEY) !== 'false';
        } catch {
            return true;
        }
    });
    const isDraggingRef = useRef(false);
    const svgRef = useRef<SVGSVGElement>(null);

    const bounds = useMemo(() => computeBounds(nodes), [nodes]);
    const worldW = bounds.maxX - bounds.minX;
    const worldH = bounds.maxY - bounds.minY;
    const scale = Math.min(MINIMAP_WIDTH / worldW, MINIMAP_HEIGHT / worldH);

    const toMinimap = useCallback(
        (wx: number, wy: number) => ({
            x: (wx - bounds.minX) * scale,
            y: (wy - bounds.minY) * scale,
        }),
        [bounds, scale]
    );

    const fromMinimap = useCallback(
        (mx: number, my: number) => ({
            x: mx / scale + bounds.minX,
            y: my / scale + bounds.minY,
        }),
        [bounds, scale]
    );

    const moveViewportTo = useCallback(
        (mx: number, my: number) => {
            const world = fromMinimap(mx, my);
            onViewportChange({
                x: canvasWidth / 2 - world.x * viewport.zoom,
                y: canvasHeight / 2 - world.y * viewport.zoom,
                zoom: viewport.zoom,
            });
        },
        [fromMinimap, onViewportChange, canvasWidth, canvasHeight, viewport.zoom]
    );

    const getSvgPoint = (e: React.MouseEvent) => {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return null;
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        e.stopPropagation();
        isDraggingRef.current = true;
        const pt = getSvgPoint(e);
        if (pt) moveViewportTo(pt.x, pt.y);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDraggingRef.current) return;
        const pt = getSvgPoint(e);
        if (pt) moveViewportTo(pt.x, pt.y);
    };

    const handleMouseUp = () => {
        isDraggingRef.current = false;
    };

    const toggleVisible = () => {
        const next = !visible;
        setVisible(next);
        try {
            localStorage.setItem(STORAGE_KEY, String(next));
        } catch {
            /* noop */
        }
    };

    // Viewport rect in world coords
    const vpWorldX = -viewport.x / viewport.zoom;
    const vpWorldY = -viewport.y / viewport.zoom;
    const vpWorldW = canvasWidth / viewport.zoom;
    const vpWorldH = canvasHeight / viewport.zoom;
    const vpMini = toMinimap(vpWorldX, vpWorldY);
    const vpMiniW = vpWorldW * scale;
    const vpMiniH = vpWorldH * scale;

    // Node lookup for connection centers
    const nodeMap = useMemo(() => {
        const map = new Map<string, NodeData>();
        for (const n of nodes) map.set(n.id, n);
        return map;
    }, [nodes]);

    if (!visible) {
        return (
            <button
                onClick={toggleVisible}
                className={cn(
                    'absolute bottom-14 right-4 z-20 hidden sm:flex',
                    'items-center justify-center w-9 h-9 rounded-xl',
                    'bg-background/80 backdrop-blur-xl border border-border/50 shadow-sm',
                    'text-muted-foreground hover:text-foreground transition-colors'
                )}
            >
                <MapIcon className="w-4 h-4" />
            </button>
        );
    }

    return (
        <div
            className={cn(
                'absolute bottom-14 right-4 z-20 hidden sm:block',
                'rounded-xl overflow-hidden',
                'bg-background/80 backdrop-blur-xl border border-border/50 shadow-sm'
            )}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-2 py-1 border-b border-border/30">
                <span className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">Map</span>
                <button
                    onClick={toggleVisible}
                    className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                >
                    <X className="w-3 h-3" />
                </button>
            </div>

            {/* SVG Canvas */}
            <svg
                ref={svgRef}
                width={MINIMAP_WIDTH}
                height={MINIMAP_HEIGHT}
                className="cursor-crosshair"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                {/* Connections */}
                {connections.map(c => {
                    const src = nodeMap.get(c.sourceNodeId);
                    const tgt = nodeMap.get(c.targetNodeId);
                    if (!src || !tgt) return null;
                    const srcW = getNodeWidth(src);
                    const s = toMinimap(src.position.x + srcW, src.position.y + ESTIMATED_NODE_HEIGHT / 2);
                    const t = toMinimap(tgt.position.x, tgt.position.y + ESTIMATED_NODE_HEIGHT / 2);
                    return (
                        <line
                            key={c.id}
                            x1={s.x}
                            y1={s.y}
                            x2={t.x}
                            y2={t.y}
                            stroke={CONNECTION_STROKE}
                            strokeWidth={1}
                        />
                    );
                })}

                {/* Nodes */}
                {nodes.map(n => {
                    const pos = toMinimap(n.position.x, n.position.y);
                    const w = getNodeWidth(n) * scale;
                    const h = ESTIMATED_NODE_HEIGHT * scale;
                    const state = getEffectiveState(n.state, n.status);
                    const fill = (state && STATE_COLORS[state]) || DEFAULT_NODE_COLOR;
                    return (
                        <rect
                            key={n.id}
                            x={pos.x}
                            y={pos.y}
                            width={Math.max(w, 2)}
                            height={Math.max(h, 2)}
                            rx={2}
                            fill={fill}
                            opacity={0.8}
                        />
                    );
                })}

                {/* Viewport rect */}
                <rect
                    x={vpMini.x}
                    y={vpMini.y}
                    width={vpMiniW}
                    height={vpMiniH}
                    fill={VIEWPORT_FILL}
                    stroke={VIEWPORT_STROKE}
                    strokeWidth={1.5}
                    rx={2}
                />
            </svg>
        </div>
    );
};
