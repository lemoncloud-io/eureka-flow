import React from 'react';

import type { ArrowDirection } from '../types/tour';

const ROTATION: Record<Exclude<ArrowDirection, 'none'>, string> = {
    top: 'rotate(0)',
    bottom: 'rotate(180deg)',
    left: 'rotate(-90deg)',
    right: 'rotate(90deg)',
};

/** Returns CSS position for the arrow relative to the tooltip container */
export const getArrowPositionStyle = (direction: ArrowDirection): React.CSSProperties => {
    if (direction === 'none') return { display: 'none' };
    if (direction === 'top') return { position: 'absolute', top: -7, left: 40 };
    if (direction === 'bottom') return { position: 'absolute', bottom: -7, left: 40 };
    if (direction === 'left') return { position: 'absolute', left: -7, top: '50%', transform: 'translateY(-50%)' };
    return { position: 'absolute', right: -7, top: '50%', transform: 'translateY(-50%)' };
};

interface TourArrowProps {
    direction: ArrowDirection;
    className?: string;
    style?: React.CSSProperties;
}

export const TourArrow: React.FC<TourArrowProps> = ({ direction, className, style }) => {
    if (direction === 'none') return null;

    return (
        <div className={className} style={{ ...style, transform: ROTATION[direction], width: 70, height: 7 }}>
            <svg width="70" height="7" viewBox="0 0 70 7" fill="none">
                <path d="M35 0L42 7H28L35 0Z" fill="white" />
            </svg>
        </div>
    );
};
