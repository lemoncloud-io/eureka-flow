import { useCallback, useRef } from 'react';

interface Viewport {
    x: number;
    y: number;
    zoom: number;
}

interface UseTouchCanvasOptions {
    viewport: Viewport;
    setViewport: React.Dispatch<React.SetStateAction<Viewport>>;
    minZoom: number;
    maxZoom: number;
    canvasRef: React.RefObject<HTMLDivElement | null>;
    /** When true, disables canvas panning (e.g., when dragging a node) */
    isNodeDragging?: boolean;
    onPanStart?: () => void;
    onPanEnd?: () => void;
}

interface UseTouchCanvasReturn {
    handleTouchStart: (e: React.TouchEvent) => void;
    handleTouchMove: (e: React.TouchEvent) => void;
    handleTouchEnd: (e: React.TouchEvent) => void;
}

/** Minimum distance in pixels to consider as intentional gesture (not a tap) */
export const TOUCH_GESTURE_THRESHOLD = 10;

/**
 * Hook for handling touch gestures on the workflow canvas.
 * Supports:
 * - Single finger: Pan canvas (after threshold, unless isNodeDragging)
 * - Two fingers: Pinch to zoom (centered on pinch midpoint)
 * - Tap: Passes through to allow node/button clicks
 */
export const useTouchCanvas = ({
    viewport,
    setViewport,
    minZoom,
    maxZoom,
    canvasRef,
    isNodeDragging = false,
    onPanStart,
    onPanEnd,
}: UseTouchCanvasOptions): UseTouchCanvasReturn => {
    // Track touch state
    const isTouchingRef = useRef(false);
    const isPanningRef = useRef(false); // True only after threshold exceeded
    const startTouchRef = useRef<{ x: number; y: number } | null>(null);
    const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
    const lastPinchDistanceRef = useRef<number | null>(null);
    const lastPinchCenterRef = useRef<{ x: number; y: number } | null>(null);

    // Calculate distance between two touch points
    const getTouchDistance = useCallback((touches: React.TouchList): number => {
        if (touches.length < 2) return 0;
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.hypot(dx, dy);
    }, []);

    // Calculate midpoint between two touch points
    const getTouchCenter = useCallback((touches: React.TouchList): { x: number; y: number } => {
        if (touches.length < 2) {
            return { x: touches[0].clientX, y: touches[0].clientY };
        }
        return {
            x: (touches[0].clientX + touches[1].clientX) / 2,
            y: (touches[0].clientY + touches[1].clientY) / 2,
        };
    }, []);

    const handleTouchStart = useCallback(
        (e: React.TouchEvent) => {
            // If node is being dragged, don't handle canvas touch
            if (isNodeDragging) return;

            // Don't call preventDefault here - allow taps to work
            isTouchingRef.current = true;
            isPanningRef.current = false;

            if (e.touches.length === 1) {
                // Single finger - prepare for potential pan
                const touch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                startTouchRef.current = touch;
                lastTouchRef.current = touch;
                lastPinchDistanceRef.current = null;
                lastPinchCenterRef.current = null;
            } else if (e.touches.length === 2) {
                // Two fingers - prepare for pinch zoom (immediately active)
                e.preventDefault(); // Prevent browser zoom
                isPanningRef.current = true;
                lastPinchDistanceRef.current = getTouchDistance(e.touches);
                lastPinchCenterRef.current = getTouchCenter(e.touches);
                lastTouchRef.current = null;
                startTouchRef.current = null;
                onPanStart?.();
            }
        },
        [isNodeDragging, getTouchDistance, getTouchCenter, onPanStart]
    );

    const handleTouchMove = useCallback(
        (e: React.TouchEvent) => {
            // If node is being dragged, don't handle canvas touch
            if (isNodeDragging) return;

            if (!isTouchingRef.current) return;

            if (e.touches.length === 1 && lastTouchRef.current) {
                const currentX = e.touches[0].clientX;
                const currentY = e.touches[0].clientY;

                // Check if we've exceeded threshold to start panning
                if (!isPanningRef.current && startTouchRef.current) {
                    const dx = currentX - startTouchRef.current.x;
                    const dy = currentY - startTouchRef.current.y;
                    const distance = Math.hypot(dx, dy);

                    if (distance >= TOUCH_GESTURE_THRESHOLD) {
                        // Threshold exceeded - start panning
                        isPanningRef.current = true;
                        onPanStart?.();
                    }
                }

                // Only pan if threshold was exceeded
                if (isPanningRef.current) {
                    e.preventDefault(); // Prevent scroll only when panning

                    const dx = currentX - lastTouchRef.current.x;
                    const dy = currentY - lastTouchRef.current.y;

                    setViewport(prev => ({
                        ...prev,
                        x: prev.x + dx,
                        y: prev.y + dy,
                    }));
                }

                lastTouchRef.current = { x: currentX, y: currentY };
            } else if (e.touches.length === 2 && lastPinchDistanceRef.current !== null) {
                // Pinch to zoom
                e.preventDefault();

                const rect = canvasRef.current?.getBoundingClientRect();
                if (!rect) return;

                const currentDistance = getTouchDistance(e.touches);
                const currentCenter = getTouchCenter(e.touches);

                // Calculate zoom change based on pinch distance change
                const scale = currentDistance / lastPinchDistanceRef.current;
                const newZoom = Math.min(Math.max(viewport.zoom * scale, minZoom), maxZoom);

                // Calculate the point to zoom around (pinch center in canvas coordinates)
                const pinchX = currentCenter.x - rect.left;
                const pinchY = currentCenter.y - rect.top;

                // Calculate world coordinates of pinch center
                const worldX = (pinchX - viewport.x) / viewport.zoom;
                const worldY = (pinchY - viewport.y) / viewport.zoom;

                // Calculate new viewport position to keep pinch center stationary
                const newX = pinchX - worldX * newZoom;
                const newY = pinchY - worldY * newZoom;

                // Also handle pan while pinching (if center moves)
                const panDx = lastPinchCenterRef.current ? currentCenter.x - lastPinchCenterRef.current.x : 0;
                const panDy = lastPinchCenterRef.current ? currentCenter.y - lastPinchCenterRef.current.y : 0;

                setViewport({
                    x: newX + panDx,
                    y: newY + panDy,
                    zoom: newZoom,
                });

                lastPinchDistanceRef.current = currentDistance;
                lastPinchCenterRef.current = currentCenter;
            }
        },
        [
            isNodeDragging,
            viewport,
            setViewport,
            minZoom,
            maxZoom,
            canvasRef,
            getTouchDistance,
            getTouchCenter,
            onPanStart,
        ]
    );

    const handleTouchEnd = useCallback(
        (e: React.TouchEvent) => {
            // If node is being dragged, don't handle canvas touch
            if (isNodeDragging) return;

            // Only preventDefault if we were actively panning
            if (isPanningRef.current) {
                e.preventDefault();
            }

            if (e.touches.length === 0) {
                // All fingers lifted
                if (isPanningRef.current) {
                    onPanEnd?.();
                }
                isTouchingRef.current = false;
                isPanningRef.current = false;
                startTouchRef.current = null;
                lastTouchRef.current = null;
                lastPinchDistanceRef.current = null;
                lastPinchCenterRef.current = null;
            } else if (e.touches.length === 1) {
                // One finger remains - switch to pan mode
                const touch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                startTouchRef.current = touch;
                lastTouchRef.current = touch;
                lastPinchDistanceRef.current = null;
                lastPinchCenterRef.current = null;
            }
        },
        [isNodeDragging, onPanEnd]
    );

    return {
        handleTouchStart,
        handleTouchMove,
        handleTouchEnd,
    };
};
