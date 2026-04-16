import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface HighlightRect {
    top: number;
    left: number;
    width: number;
    height: number;
}

interface TourOverlayProps {
    opacity: number;
    highlightSelector?: string;
    highlightPadding?: number;
    /** When false, the highlighted element is not clickable (view-only) */
    interactive?: boolean;
    onClose?: () => void;
    children: React.ReactNode;
}

const GLOW_COLOR = 'hsl(272, 92%, 53%)';
const HIGHLIGHT_RADIUS = 15;

const useHighlightRect = (selector?: string, padding = 8): HighlightRect | null => {
    const [rect, setRect] = useState<HighlightRect | null>(null);
    const rafRef = useRef(0);

    const measure = useCallback(() => {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
            if (!selector) {
                setRect(null);
                return;
            }
            const el = document.querySelector(selector);
            if (!el) {
                setRect(null);
                return;
            }
            // Scroll element into view within its scroll container (e.g. sidebar)
            el.scrollIntoView({ block: 'nearest' });
            const r = el.getBoundingClientRect();
            setRect({
                top: r.top - padding,
                left: r.left - padding,
                width: r.width + padding * 2,
                height: r.height + padding * 2,
            });
        });
    }, [selector, padding]);

    useEffect(() => {
        measure();
        window.addEventListener('resize', measure);
        window.addEventListener('scroll', measure);
        return () => {
            cancelAnimationFrame(rafRef.current);
            window.removeEventListener('resize', measure);
            window.removeEventListener('scroll', measure);
        };
    }, [measure]);

    return rect;
};

export const TourOverlay: React.FC<TourOverlayProps> = ({
    opacity,
    highlightSelector,
    highlightPadding = 8,
    interactive = true,
    onClose,
    children,
}) => {
    const maskId = useId();
    const highlight = useHighlightRect(highlightSelector, highlightPadding);
    const fillColor = useMemo(() => `rgba(14, 14, 15, ${opacity})`, [opacity]);

    const glowStyle = useMemo<React.CSSProperties | undefined>(
        () =>
            highlight
                ? {
                      top: highlight.top,
                      left: highlight.left,
                      width: highlight.width,
                      height: highlight.height,
                      borderRadius: HIGHLIGHT_RADIUS,
                      border: `1px solid ${GLOW_COLOR}`,
                      boxShadow: `0 0 12px ${GLOW_COLOR}`,
                  }
                : undefined,
        [highlight]
    );

    // ESC key to close
    useEffect(() => {
        if (!onClose) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    return createPortal(
        <div className="fixed inset-0 z-[9999]" role="dialog" aria-modal="true">
            <svg className="absolute inset-0 h-full w-full">
                <defs>
                    <mask id={maskId}>
                        <rect x="0" y="0" width="100%" height="100%" fill="white" />
                        {highlight && (
                            <rect
                                x={highlight.left}
                                y={highlight.top}
                                width={highlight.width}
                                height={highlight.height}
                                rx={HIGHLIGHT_RADIUS}
                                fill="black"
                            />
                        )}
                    </mask>
                </defs>
                <rect x="0" y="0" width="100%" height="100%" fill={fillColor} mask={`url(#${maskId})`} />
            </svg>

            {glowStyle && <div className="pointer-events-none absolute" style={glowStyle} />}

            {/* Block interactions with highlighted element when non-interactive */}
            {!interactive && highlight && (
                <div
                    className="absolute"
                    style={{
                        top: highlight.top,
                        left: highlight.left,
                        width: highlight.width,
                        height: highlight.height,
                        borderRadius: HIGHLIGHT_RADIUS,
                    }}
                />
            )}

            {children}
        </div>,
        document.body
    );
};
