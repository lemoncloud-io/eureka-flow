import React from 'react';
import { useTranslation } from 'react-i18next';

import { JsonViewer, MarkdownViewer, isMarkdownContent } from '@flows/ui-kit';

import { getUploadHtmlProduct, tryParseJson } from '../../utils';
import { ProductLinkCard } from '../ProductLinkCard';
import { S3Image } from '../S3Image';
import { VISUALIZATION_COMPONENTS, getFirstOutputData } from './helpers';

import type { VisualizationProps } from './types';

export const OutputPreview: React.FC<VisualizationProps> = ({ node, definition, contentHeight }) => {
    const { t } = useTranslation(['nodes']);
    const packet = getFirstOutputData(node, definition);

    // Use custom height or default 180px
    const maxH = contentHeight ?? 180;

    // Skip if this is an input/output visualization node (they have their own visualizations)
    if (
        definition.type?.startsWith('input-') ||
        definition.type?.startsWith('output-') ||
        VISUALIZATION_COMPONENTS[definition.type ?? '']
    ) {
        return null;
    }

    // No data yet - show waiting message
    if (!packet) {
        return (
            <div
                className="text-[10px] text-muted-foreground/60 italic text-center py-4 bg-muted/30 rounded-lg border border-dashed border-border flex items-center justify-center"
                style={{ minHeight: contentHeight ? `${contentHeight}px` : undefined }}
            >
                {t('visualization.waitingForData')}
            </div>
        );
    }

    if (packet.type === 'image') {
        return (
            <div className="rounded-lg border border-border overflow-hidden bg-black/20">
                <div className="flex justify-center items-center p-2">
                    <S3Image
                        src={packet.value as string}
                        className="max-w-full rounded object-contain"
                        style={{ maxHeight: `${maxH}px` }}
                        alt="Output"
                    />
                </div>
            </div>
        );
    }

    // upload-html product → link card instead of raw JSON
    const product = getUploadHtmlProduct(packet);
    if (product) {
        return <ProductLinkCard product={product} />;
    }

    // JSON type or object value
    if (packet.type === 'json' || (packet.value !== null && typeof packet.value === 'object')) {
        return (
            <div className="p-2 bg-muted/10 rounded-lg border border-border/30" onWheel={e => e.stopPropagation()}>
                <JsonViewer data={packet.value} maxHeight={maxH} collapsed={2} />
            </div>
        );
    }

    // Try to parse JSON string
    const parsedJson = tryParseJson(packet.value);
    if (parsedJson) {
        return (
            <div className="p-2 bg-muted/10 rounded-lg border border-border/30" onWheel={e => e.stopPropagation()}>
                <JsonViewer data={parsedJson} maxHeight={maxH} collapsed={2} />
            </div>
        );
    }

    if (packet.type === 'markdown' || isMarkdownContent(packet.value)) {
        return (
            <div className="p-2 bg-muted/10 rounded-lg border border-border/30" onWheel={e => e.stopPropagation()}>
                <MarkdownViewer content={String(packet.value)} maxHeight={maxH} />
            </div>
        );
    }

    // Text/number/any
    const strValue = String(packet.value);
    return (
        <div
            className="p-2.5 bg-muted/10 rounded-lg border border-border/30 overflow-auto"
            style={{ maxHeight: `${maxH}px` }}
        >
            <div className="text-xs text-foreground/80 break-words whitespace-pre-wrap">{strValue}</div>
        </div>
    );
};
