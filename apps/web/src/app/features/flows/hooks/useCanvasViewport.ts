import { useCallback, useRef, useState } from 'react';

export interface Viewport {
    x: number;
    y: number;
    zoom: number;
}

interface UseCanvasViewportOptions {
    initialViewport?: Viewport;
    minZoom?: number;
    maxZoom?: number;
    zoomSensitivity?: number;
}

interface UseCanvasViewportReturn {
    viewport: Viewport;
    setViewport: React.Dispatch<React.SetStateAction<Viewport>>;
    isPanning: boolean;
    handleWheel: (e: React.WheelEvent, canvasRect: DOMRect | null) => void;
    handlePanStart: (e: React.MouseEvent) => void;
    handlePanMove: (e: React.MouseEvent) => boolean;
    handlePanEnd: () => void;
    screenToWorld: (clientX: number, clientY: number, canvasRect: DOMRect | null) => { x: number; y: number };
    resetViewport: () => void;
    zoomIn: () => void;
    zoomOut: () => void;
    fitToScreen: (
        nodes: Array<{ position: { x: number; y: number } }>,
        canvasRect: DOMRect | null,
        padding?: number
    ) => void;
}

const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };

export const useCanvasViewport = (options: UseCanvasViewportOptions = {}): UseCanvasViewportReturn => {
    const { initialViewport = DEFAULT_VIEWPORT, minZoom = 0.1, maxZoom = 5, zoomSensitivity = 0.001 } = options;

    const [viewport, setViewport] = useState<Viewport>(initialViewport);
    const [isPanning, setIsPanning] = useState(false);
    const lastMousePosRef = useRef({ x: 0, y: 0 });

    const handleWheel = useCallback(
        (e: React.WheelEvent, canvasRect: DOMRect | null) => {
            if (!canvasRect) return;

            const delta = -e.deltaY * zoomSensitivity;
            const newZoom = Math.min(Math.max(viewport.zoom + delta, minZoom), maxZoom);

            const mouseX = e.clientX - canvasRect.left;
            const mouseY = e.clientY - canvasRect.top;

            const worldX = (mouseX - viewport.x) / viewport.zoom;
            const worldY = (mouseY - viewport.y) / viewport.zoom;

            const newX = mouseX - worldX * newZoom;
            const newY = mouseY - worldY * newZoom;

            setViewport({ x: newX, y: newY, zoom: newZoom });
        },
        [viewport, minZoom, maxZoom, zoomSensitivity]
    );

    const handlePanStart = useCallback((e: React.MouseEvent) => {
        if (e.button === 0 || e.button === 1) {
            setIsPanning(true);
            lastMousePosRef.current = { x: e.clientX, y: e.clientY };
        }
    }, []);

    const handlePanMove = useCallback(
        (e: React.MouseEvent): boolean => {
            if (!isPanning) return false;

            const dx = e.clientX - lastMousePosRef.current.x;
            const dy = e.clientY - lastMousePosRef.current.y;
            setViewport(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
            lastMousePosRef.current = { x: e.clientX, y: e.clientY };
            return true;
        },
        [isPanning]
    );

    const handlePanEnd = useCallback(() => {
        setIsPanning(false);
    }, []);

    const screenToWorld = useCallback(
        (clientX: number, clientY: number, canvasRect: DOMRect | null) => {
            if (!canvasRect) return { x: 0, y: 0 };
            return {
                x: (clientX - canvasRect.left - viewport.x) / viewport.zoom,
                y: (clientY - canvasRect.top - viewport.y) / viewport.zoom,
            };
        },
        [viewport]
    );

    const resetViewport = useCallback(() => {
        setViewport(DEFAULT_VIEWPORT);
    }, []);

    const zoomIn = useCallback(() => {
        setViewport(prev => ({
            ...prev,
            zoom: Math.min(prev.zoom * 1.2, maxZoom),
        }));
    }, [maxZoom]);

    const zoomOut = useCallback(() => {
        setViewport(prev => ({
            ...prev,
            zoom: Math.max(prev.zoom / 1.2, minZoom),
        }));
    }, [minZoom]);

    const fitToScreen = useCallback(
        (nodes: Array<{ position: { x: number; y: number } }>, canvasRect: DOMRect | null, padding = 50) => {
            if (!canvasRect || nodes.length === 0) return;

            const NODE_WIDTH = 220;
            const NODE_HEIGHT = 150;

            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;

            nodes.forEach(node => {
                minX = Math.min(minX, node.position.x);
                minY = Math.min(minY, node.position.y);
                maxX = Math.max(maxX, node.position.x + NODE_WIDTH);
                maxY = Math.max(maxY, node.position.y + NODE_HEIGHT);
            });

            const contentWidth = maxX - minX;
            const contentHeight = maxY - minY;

            const availableWidth = canvasRect.width - padding * 2;
            const availableHeight = canvasRect.height - padding * 2;

            const scaleX = availableWidth / contentWidth;
            const scaleY = availableHeight / contentHeight;
            const newZoom = Math.min(Math.max(Math.min(scaleX, scaleY), minZoom), maxZoom);

            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;

            const newX = canvasRect.width / 2 - centerX * newZoom;
            const newY = canvasRect.height / 2 - centerY * newZoom;

            setViewport({ x: newX, y: newY, zoom: newZoom });
        },
        [minZoom, maxZoom]
    );

    return {
        viewport,
        setViewport,
        isPanning,
        handleWheel,
        handlePanStart,
        handlePanMove,
        handlePanEnd,
        screenToWorld,
        resetViewport,
        zoomIn,
        zoomOut,
        fitToScreen,
    };
};
