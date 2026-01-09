import React from 'react';

import { getBezierPath } from '../utils';

interface ConnectionLineProps {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    isActive: boolean; // If data is flowing
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

    // Only enable pointer events if handlers are provided (i.e., not a draft line)
    const isInteractive = !!onMouseEnter || !!onMouseMove || !!onMouseLeave;

    // Determine Color
    let strokeColor = '#4b5563'; // gray-600 default
    let strokeWidth = '3';
    let opacity = '1';

    if (isActive) {
        strokeColor = '#60a5fa'; // blue-400
        strokeWidth = '3';
    }

    // Override for interaction
    if (isHovered) {
        strokeColor = '#facc15'; // yellow-400
        strokeWidth = '4';
        opacity = '1';
    } else if (isSelected) {
        strokeColor = '#facc15'; // yellow-400
        strokeWidth = '4';
    } else if (!isActive) {
        strokeColor = '#374151'; // gray-700
    }

    return (
        <g>
            {/* Shadow/Outline for visibility against dark bg */}
            <path
                d={path}
                fill="none"
                stroke="#111827" // gray-900 background
                strokeWidth={isHovered || isSelected ? '8' : '6'}
                strokeLinecap="round"
            />

            {/* Main Line */}
            <path
                d={path}
                fill="none"
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                strokeOpacity={opacity}
                strokeLinecap="round"
                className={isActive && !isHovered && !isSelected ? 'animate-pulse' : 'transition-all duration-200'}
            />

            {/* Invisible Hit Area (Wide stroke for easier hovering/clicking) */}
            <path
                d={path}
                fill="none"
                stroke="transparent"
                strokeWidth="25"
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
                // Double click bubbles up to canvas to deselect everything
                className={isInteractive ? 'cursor-pointer pointer-events-auto' : 'pointer-events-none'}
            />
        </g>
    );
};
