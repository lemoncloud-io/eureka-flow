import React from 'react';

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
    onMouseEnter,
    onMouseMove,
    onMouseLeave,
    onClick,
}) => {
    const path = getBezierPath(x1, y1, x2, y2);

    const isInteractive = !!onMouseEnter || !!onMouseMove || !!onMouseLeave;

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

    return (
        <g>
            {/* Main Line - no transition for draft to prevent lag */}
            <path
                d={path}
                fill="none"
                className={`${getStrokeClass()} ${isDraft || isFlowing ? '' : 'transition-colors duration-150'}`}
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
