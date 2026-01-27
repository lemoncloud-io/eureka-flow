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
    onMouseEnter,
    onMouseMove,
    onMouseLeave,
    onClick,
}) => {
    const path = getBezierPath(x1, y1, x2, y2);

    const isInteractive = !!onMouseEnter || !!onMouseMove || !!onMouseLeave;

    const getStrokeClass = () => {
        if (isHovered || isSelected) return 'stroke-primary';
        if (isActive) return 'stroke-connection-active';
        return 'stroke-muted-foreground/40';
    };

    const strokeWidth = isHovered || isSelected ? 2.5 : 2;

    return (
        <g>
            {/* Main Line */}
            <path
                d={path}
                fill="none"
                className={`${getStrokeClass()} transition-all duration-200`}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
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
