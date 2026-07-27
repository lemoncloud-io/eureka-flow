import { useCallback, useMemo, useRef, useState } from 'react';

import { Map as MapIcon, X } from 'lucide-react';

import { getEffectiveState, getNodeWidth } from '@flows/flows';
import { cn } from '@flows/lib/utils';

import type { EdgeData, NodeData } from '@lemoncloud/eureka-flows-api';

const MINIMAP_SIZE = 160;
const WORLD_PADDING = 80;
const NODE_HEIGHT_ESTIMATE = 60;
const STORAGE_KEY = 'flows-minimap-visible';

const STATE_COLORS: Record<string, string> = {
    RUNNING: '#eab308',
    COMPLETED: '#22c55e',
    ERROR: '#ef4444',
    READY: '#818cf8',
};
const DEFAULT_NODE_COLOR = 'hsl(var(--muted-foreground) / 0.4)';
const VIEWPORT_STROKE = 'hsl(var(--primary) / 0.6)';
const CONNECTION_STROKE = 'hsl(var(--muted-foreground) / 0.25)';

interface MinimapProps {
    nodes: NodeData[];
    connections: EdgeData[];
    viewport: { x: number; y: number; zoom: number };
    canvasWidth: number;
    canvasHeight: number;
    onViewportChange: (vp: { x: number; y: number; zoom: number }) => void;
}

/** Compute world bounds including both nodes and current viewport */
const computeBounds = (
    nodes: NodeData[],
    viewport: { x: number; y: number; zoom: number },
    canvasW: number,
    canvasH: number
) => {
    // Viewport in world coords
    const vpX = -viewport.x / viewport.zoom;
    const vpY = -viewport.y / viewport.zoom;
    const vpW = canvasW / viewport.zoom;
    const vpH = canvasH / viewport.zoom;

    let minX = vpX;
    let minY = vpY;
    let maxX = vpX + vpW;
    let maxY = vpY + vpH;

    for (const n of nodes) {
        const w = getNodeWidth(n);
        minX = Math.min(minX, n.position.x);
        minY = Math.min(minY, n.position.y);
        maxX = Math.max(maxX, n.position.x + w);
        maxY = Math.max(maxY, n.position.y + NODE_HEIGHT_ESTIMATE);
    }

    return {
        minX: minX - WORLD_PADDING,
        minY: minY - WORLD_PADDING,
        maxX: maxX + WORLD_PADDING,
        maxY: maxY + WORLD_PADDING,
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
    // Snapshot of bounds/scale frozen at drag start to prevent feedback loop
    const dragSnapshotRef = useRef<{ bounds: ReturnType<typeof computeBounds>; scale: number } | null>(null);

    const bounds = useMemo(
        () => computeBounds(nodes, viewport, canvasWidth, canvasHeight),
        [nodes, viewport, canvasWidth, canvasHeight]
    );
    const worldW = bounds.maxX - bounds.minX;
    const worldH = bounds.maxY - bounds.minY;
    const scale = Math.min(MINIMAP_SIZE / worldW, MINIMAP_SIZE / worldH);

    const toMinimap = useCallback(
        (wx: number, wy: number) => ({
            x: (wx - bounds.minX) * scale,
            y: (wy - bounds.minY) * scale,
        }),
        [bounds, scale]
    );

    const moveViewportTo = useCallback(
        (mx: number, my: number) => {
            // Use frozen snapshot during drag, live values on click
            const snap = dragSnapshotRef.current ?? { bounds, scale };
            const snapW = snap.bounds.maxX - snap.bounds.minX;
            const snapH = snap.bounds.maxY - snap.bounds.minY;
            const clampedX = Math.max(0, Math.min(mx, snapW * snap.scale));
            const clampedY = Math.max(0, Math.min(my, snapH * snap.scale));
            const worldX = clampedX / snap.scale + snap.bounds.minX;
            const worldY = clampedY / snap.scale + snap.bounds.minY;
            onViewportChange({
                x: canvasWidth / 2 - worldX * viewport.zoom,
                y: canvasHeight / 2 - worldY * viewport.zoom,
                zoom: viewport.zoom,
            });
        },
        [onViewportChange, canvasWidth, canvasHeight, viewport.zoom, bounds, scale]
    );

    const getSvgPoint = (e: React.MouseEvent) => {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return null;
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        e.stopPropagation();
        isDraggingRef.current = true;
        dragSnapshotRef.current = { bounds, scale };
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
        dragSnapshotRef.current = null;
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

    // Viewport rect in minimap coords
    const vpWorldX = -viewport.x / viewport.zoom;
    const vpWorldY = -viewport.y / viewport.zoom;
    const vpWorldW = canvasWidth / viewport.zoom;
    const vpWorldH = canvasHeight / viewport.zoom;
    const vpMini = toMinimap(vpWorldX, vpWorldY);
    const vpMiniW = vpWorldW * scale;
    const vpMiniH = vpWorldH * scale;

    // SVG dimensions clamped to reasonable size
    const svgW = Math.min(MINIMAP_SIZE, Math.max(100, worldW * scale));
    const svgH = Math.min(MINIMAP_SIZE, Math.max(70, worldH * scale));

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
                    'absolute bottom-4 right-4 z-20 hidden sm:flex',
                    'items-center justify-center w-8 h-8 rounded-lg',
                    'bg-background/80 backdrop-blur-xl border border-border/50 shadow-sm',
                    'text-muted-foreground hover:text-foreground transition-colors'
                )}
            >
                <MapIcon className="w-3.5 h-3.5" />
            </button>
        );
    }

    return (
        <div
            className={cn(
                'absolute bottom-4 right-4 z-20 hidden sm:block',
                'rounded-lg overflow-hidden',
                'bg-background/90 backdrop-blur-xl border border-border/40 shadow-md'
            )}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-2 py-0.5">
                <span className="text-[8px] text-muted-foreground/60 font-medium uppercase tracking-widest select-none">
                    Minimap
                </span>
                <button
                    onClick={toggleVisible}
                    className="text-muted-foreground/40 hover:text-muted-foreground transition-colors p-0.5"
                >
                    <X className="w-2.5 h-2.5" />
                </button>
            </div>

            {/* SVG Canvas */}
            <svg
                ref={svgRef}
                width={svgW}
                height={svgH}
                className="cursor-crosshair block"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                {/* Background */}
                <rect width={svgW} height={svgH} fill="hsl(var(--muted) / 0.3)" rx={0} />

                {/* Viewport rect (behind nodes) */}
                <rect
                    x={vpMini.x}
                    y={vpMini.y}
                    width={vpMiniW}
                    height={vpMiniH}
                    fill="hsl(var(--primary) / 0.06)"
                    stroke={VIEWPORT_STROKE}
                    strokeWidth={1}
                    rx={1}
                />

                {/* Connections */}
                {connections.map(c => {
                    const src = nodeMap.get(c.sourceNodeId);
                    const tgt = nodeMap.get(c.targetNodeId);
                    if (!src || !tgt) return null;
                    const srcW = getNodeWidth(src);
                    const s = toMinimap(src.position.x + srcW, src.position.y + NODE_HEIGHT_ESTIMATE / 2);
                    const t = toMinimap(tgt.position.x, tgt.position.y + NODE_HEIGHT_ESTIMATE / 2);
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
                    const w = Math.max(getNodeWidth(n) * scale, 4);
                    const h = Math.max(NODE_HEIGHT_ESTIMATE * scale, 3);
                    const state = getEffectiveState(n.state, n.status);
                    const fill = (state && STATE_COLORS[state]) || DEFAULT_NODE_COLOR;
                    return (
                        <rect
                            key={n.id}
                            x={pos.x}
                            y={pos.y}
                            width={w}
                            height={h}
                            rx={1.5}
                            fill={fill}
                            stroke={fill}
                            strokeWidth={0.5}
                            strokeOpacity={0.5}
                        />
                    );
                })}
            </svg>
        </div>
    );
};
