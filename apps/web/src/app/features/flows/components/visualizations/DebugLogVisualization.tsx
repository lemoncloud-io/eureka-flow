import React from 'react';
import { useTranslation } from 'react-i18next';

import { JsonViewer } from '@flows/ui-kit';

import { getFirstInputData } from './helpers';
import { tryParseJson } from '../../utils';

import type { VisualizationProps } from './types';

export const DebugLogVisualization: React.FC<VisualizationProps> = ({ node, definition, contentHeight }) => {
    const { t } = useTranslation(['nodes']);
    const lastInput = getFirstInputData(node, definition)?.value;

    // Use custom height or default 112px (max-h-28)
    const maxH = contentHeight ?? 112;

    // Check if content is JSON (object or parseable string)
    const jsonData =
        typeof lastInput === 'object' && lastInput !== null
            ? lastInput
            : typeof lastInput === 'string'
              ? tryParseJson(lastInput)
              : null;

    return (
        <div
            className="p-2 bg-muted/10 rounded-lg border border-border/30 overflow-y-auto"
            style={{ maxHeight: `${maxH}px`, minHeight: contentHeight ? `${contentHeight}px` : undefined }}
            onWheel={e => e.stopPropagation()}
        >
            {lastInput !== undefined ? (
                jsonData ? (
                    <JsonViewer data={jsonData} maxHeight={maxH - 16} collapsed={2} />
                ) : (
                    <div className="text-xs text-foreground/80 break-words whitespace-pre-wrap">
                        {String(lastInput)}
                    </div>
                )
            ) : (
                <span className="text-muted-foreground/50 italic text-[10px]">{t('visualization.waitingForData')}</span>
            )}
        </div>
    );
};
