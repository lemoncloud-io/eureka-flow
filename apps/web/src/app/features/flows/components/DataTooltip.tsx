import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface TooltipImageProps {
    src: string;
    altText: string;
}

export const TooltipImage: React.FC<TooltipImageProps> = ({ src, altText }) => {
    const [dims, setDims] = useState<string | null>(null);
    return (
        <div className="relative inline-block">
            <img
                src={src}
                alt={altText}
                className="max-w-[140px] max-h-[140px] rounded border border-border bg-background/50 block"
                onLoad={e => setDims(`${e.currentTarget.naturalWidth}x${e.currentTarget.naturalHeight}`)}
            />
            {dims && (
                <div className="absolute bottom-1 right-1 bg-popover/80 text-[9px] text-foreground px-1.5 py-0.5 rounded backdrop-blur-md border border-border/10 font-mono shadow-sm">
                    {dims}
                </div>
            )}
        </div>
    );
};

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
