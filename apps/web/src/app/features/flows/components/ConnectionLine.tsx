import React, { useId } from 'react';

import { getBezierPath } from '../utils';

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
    /** Show arrow at target end */
    showArrow?: boolean;
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
    showArrow = true,
    onMouseEnter,
    onMouseMove,
    onMouseLeave,
    onClick,
}) => {
    const markerId = useId();
    const path = getBezierPath(x1, y1, x2, y2);

    const isInteractive = !!onMouseEnter || !!onMouseMove || !!onMouseLeave;

    const getStrokeColor = () => {
        if (isDraft) return 'hsl(var(--primary) / 0.7)';
        if (isFlowing) return 'hsl(var(--primary))';
        if (isHovered || isSelected) return 'hsl(var(--primary))';
        if (isActive) return 'hsl(var(--muted-foreground) / 0.7)';
        return 'hsl(var(--muted-foreground) / 0.5)';
    };

    const getStrokeClass = () => {
        if (isDraft) return 'stroke-primary/70';
        if (isFlowing) return 'stroke-primary';
        if (isHovered || isSelected) return 'stroke-primary';
        if (isActive) return 'stroke-muted-foreground/70';
        return 'stroke-muted-foreground/50';
    };

    const strokeWidth = isFlowing ? 2 : isHovered || isSelected ? 2.5 : isDraft ? 2 : 1.5;

    // Flow animation styles
    const flowAnimationStyle: React.CSSProperties = isFlowing
        ? {
              strokeDasharray: '6 14',
              animation: 'edge-flow 1s linear infinite',
          }
        : {};

    const arrowMarkerId = `arrow-${markerId}`;

    return (
        <g>
            {/* Arrow marker definition */}
            {showArrow && !isDraft && (
                <defs>
                    <marker
                        id={arrowMarkerId}
                        markerWidth="6"
                        markerHeight="6"
                        refX="5"
                        refY="3"
                        orient="auto"
                        markerUnits="strokeWidth"
                    >
                        <path d="M0,0 L0,6 L6,3 z" fill={getStrokeColor()} />
                    </marker>
                </defs>
            )}

            {/* Main Line - no transition for draft to prevent lag */}
            <path
                d={path}
                fill="none"
                className={`${getStrokeClass()} ${isDraft || isFlowing ? '' : 'transition-colors duration-150'}`}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                style={flowAnimationStyle}
                markerEnd={showArrow && !isDraft ? `url(#${arrowMarkerId})` : undefined}
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
                onClick={e => {
                    if (onClick) {
                        e.stopPropagation();
                        onClick(e);
                    }
                }}
                onMouseDown={e => {
                    if (isInteractive) e.stopPropagation();
                }}
                className={isInteractive ? 'cursor-pointer pointer-events-auto' : 'pointer-events-none'}
            />
        </g>
    );
};
