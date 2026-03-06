import React from 'react';
import { useTranslation } from 'react-i18next';

import { JsonViewer, MarkdownViewer, isMarkdownContent } from '@flows/ui-kit';

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
            {(() => {
                // Image type
                if (tooltip.type === 'image') {
                    return <TooltipImage src={tooltip.content as string} altText={t('nodeBlock.previewAlt')} />;
                }

                // JSON/object type
                if (tooltip.type === 'json' || (tooltip.content !== null && typeof tooltip.content === 'object')) {
                    return (
                        <div className="min-w-[100px] max-w-[400px]">
                            <JsonViewer data={tooltip.content} maxHeight={120} collapsed={2} />
                        </div>
                    );
                }

                // String content - check for markdown
                const strValue = String(tooltip.content ?? '');
                if (tooltip.type === 'markdown' || isMarkdownContent(strValue)) {
                    return (
                        <div className="min-w-[100px] max-w-[400px]">
                            <MarkdownViewer
                                content={strValue.slice(0, 500)}
                                maxHeight={120}
                                className="text-xs [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-xs [&_p]:text-xs [&_code]:text-[10px]"
                            />
                        </div>
                    );
                }

                // Plain text
                return (
                    <div className="text-xs text-foreground min-w-[100px] max-w-[400px] break-all whitespace-pre-wrap">
                        {strValue.slice(0, 150)}
                        {strValue.length > 150 && <span className="text-muted-foreground">...</span>}
                    </div>
                );
            })()}
        </div>
    );
};
