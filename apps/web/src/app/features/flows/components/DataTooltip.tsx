import React from 'react';
import { useTranslation } from 'react-i18next';

import { TooltipImage } from './TooltipImage';

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
    const { t } = useTranslation(['flows']);

    return (
        <div
            className="absolute z-50 bg-popover border border-border rounded p-2 shadow-xl pointer-events-none transform -translate-y-full -translate-x-1/2 mt-[-10px]"
            style={{ left: tooltip.x, top: tooltip.y }}
        >
            <div className="text-[10px] text-muted-foreground uppercase font-bold mb-1">{tooltip.type}</div>
            {tooltip.type === 'image' ? (
                <TooltipImage src={tooltip.content as string} altText={t('nodeBlock.previewAlt')} />
            ) : (
                <div className="text-xs text-foreground max-w-[200px] break-all">
                    {typeof tooltip.content === 'object'
                        ? JSON.stringify(tooltip.content).slice(0, 100) +
                          (JSON.stringify(tooltip.content).length > 100 ? '...' : '')
                        : String(tooltip.content).slice(0, 150)}
                </div>
            )}
        </div>
    );
};
