import React from 'react';

import { TooltipContentRenderer } from './TooltipContentRenderer';

export interface TooltipData {
    x: number;
    y: number;
    content: unknown;
    type: string;
}

interface DataTooltipProps {
    tooltip: TooltipData;
}

export const DataTooltip: React.FC<DataTooltipProps> = ({ tooltip }) => {
    return (
        <div
            className="absolute z-50 bg-popover border border-border rounded p-2 shadow-xl pointer-events-none transform -translate-y-full -translate-x-1/2 mt-[-10px]"
            style={{ left: tooltip.x, top: tooltip.y }}
        >
            <div className="text-[10px] text-muted-foreground uppercase font-bold mb-1">{tooltip.type}</div>
            <TooltipContentRenderer content={tooltip.content} type={tooltip.type} />
        </div>
    );
};
