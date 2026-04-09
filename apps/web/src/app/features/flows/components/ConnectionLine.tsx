import React from 'react';

import { getBezierPath, getPortStyleKey } from '../utils';

import type { PortStyleKey } from '../utils';

/**
 * Static stroke class mapping per port type.
 * IMPORTANT: Use complete static class names for Tailwind's static analyzer.
 */
const EDGE_STROKE_STYLES: Record<PortStyleKey, { active: string; muted: string; dim: string }> = {
    text: { active: 'stroke-port-text', muted: 'stroke-port-text/60', dim: 'stroke-port-text/30' },
    image: { active: 'stroke-port-image', muted: 'stroke-port-image/60', dim: 'stroke-port-image/30' },
    number: { active: 'stroke-port-number', muted: 'stroke-port-number/60', dim: 'stroke-port-number/30' },
    json: { active: 'stroke-port-json', muted: 'stroke-port-json/60', dim: 'stroke-port-json/30' },
    any: { active: 'stroke-port-any', muted: 'stroke-port-any/60', dim: 'stroke-port-any/30' },
};

interface ConnectionLineProps {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    isActive: boolean;
    isSelected?: boolean;
    isHovered?: boolean;
    isDraft?: boolean;
    isFlowing?: boolean;
    portType?: string;
    onMouseEnter?: (e: React.MouseEvent) => void;
    onMouseMove?: (e: React.MouseEvent) => void;
    onMouseLeave?: () => void;
    onClick?: (e: React.MouseEvent) => void;
}

export const ConnectionLine: React.FC<ConnectionLineProps> = ({
    x1,
    y1,
    x2,
    y2,
    isActive,
    isSelected,
    isHovered,
    isDraft,
    isFlowing,
    portType,
    onMouseEnter,
    onMouseMove,
    onMouseLeave,
    onClick,
}) => {
    const path = getBezierPath(x1, y1, x2, y2);

    const isInteractive = !!onMouseEnter || !!onMouseMove || !!onMouseLeave;

    const styles = EDGE_STROKE_STYLES[portType ? getPortStyleKey(portType) : 'any'];
    const strokeClass = isDraft
        ? styles.muted
        : isFlowing || isHovered || isSelected
          ? styles.active
          : isActive
            ? styles.muted
            : styles.dim;

    const strokeWidth = isFlowing ? 2 : isHovered || isSelected ? 2.5 : isDraft ? 1.5 : 1.2;

    const flowAnimationStyle: React.CSSProperties = isFlowing
        ? { animation: 'edge-pulse 1.5s ease-in-out infinite' }
        : {};

    return (
        <g>
            {/* Main Line - no transition for draft to prevent lag */}
            <path
                d={path}
                fill="none"
                className={`${strokeClass} ${isDraft || isFlowing ? '' : 'transition-colors duration-150'}`}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                style={flowAnimationStyle}
            />

            {/* Invisible Hit Area */}
            <path
                d={path}
                fill="none"
                stroke="transparent"
                strokeWidth="20"
                strokeLinecap="round"
                onMouseEnter={onMouseEnter}
                onMouseMove={onMouseMove}
                onMouseLeave={onMouseLeave}
                onClick={
                    onClick
                        ? e => {
                              e.stopPropagation();
                              onClick(e);
                          }
                        : undefined
                }
                onMouseDown={e => {
                    if (isInteractive) e.stopPropagation();
                }}
                className={isInteractive ? 'cursor-pointer pointer-events-auto' : 'pointer-events-none'}
            />
        </g>
    );
};
