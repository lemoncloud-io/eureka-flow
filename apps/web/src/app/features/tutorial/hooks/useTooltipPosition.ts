import { useCallback, useEffect, useState } from 'react';

import type { ArrowDirection } from '../types/tour';

const TOOLTIP_GAP = 18;
const TOOLTIP_WIDTH = 420; // max width for viewport clamping
const VIEWPORT_PADDING = 16;

const centered: React.CSSProperties = {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
};

/** Clamp a value so the tooltip stays within the viewport */
const clampLeft = (left: number): number =>
    Math.max(VIEWPORT_PADDING, Math.min(left, window.innerWidth - TOOLTIP_WIDTH - VIEWPORT_PADDING));

const clampTop = (top: number): number => Math.max(VIEWPORT_PADDING, Math.min(top, window.innerHeight - 300)); // 300 ≈ tooltip height estimate

/**
 * Calculates tooltip position relative to a highlighted DOM element.
 * Falls back to centered positioning when no target is specified or found.
 * Clamps to viewport so the tooltip never overflows off-screen.
 */
export const useTooltipPosition = (targetSelector?: string, arrowDirection: ArrowDirection = 'none') => {
    const [style, setStyle] = useState<React.CSSProperties>(centered);

    const measure = useCallback(() => {
        if (!targetSelector || arrowDirection === 'none') {
            setStyle(centered);
            return;
        }

        const el = document.querySelector(targetSelector);
        if (!el) {
            setStyle(centered);
            return;
        }

        const r = el.getBoundingClientRect();
        const s: React.CSSProperties = { position: 'fixed' };

        if (arrowDirection === 'top') {
            s.top = clampTop(r.bottom + TOOLTIP_GAP);
            s.left = clampLeft(r.left);
        } else if (arrowDirection === 'bottom') {
            s.top = Math.max(VIEWPORT_PADDING, r.top - TOOLTIP_GAP);
            s.left = clampLeft(r.left);
            s.transform = 'translateY(-100%)';
        } else if (arrowDirection === 'left') {
            s.top = clampTop(r.top + r.height / 2);
            s.left = clampLeft(r.right + TOOLTIP_GAP);
            s.transform = 'translateY(-50%)';
        } else if (arrowDirection === 'right') {
            s.top = clampTop(r.top + r.height / 2);
            s.left = Math.max(VIEWPORT_PADDING, r.left - TOOLTIP_GAP - TOOLTIP_WIDTH);
            s.transform = 'translateY(-50%)';
        }

        setStyle(s);
    }, [targetSelector, arrowDirection]);

    useEffect(() => {
        measure();
        window.addEventListener('resize', measure);
        window.addEventListener('scroll', measure);
        return () => {
            window.removeEventListener('resize', measure);
            window.removeEventListener('scroll', measure);
        };
    }, [measure]);

    return style;
};
