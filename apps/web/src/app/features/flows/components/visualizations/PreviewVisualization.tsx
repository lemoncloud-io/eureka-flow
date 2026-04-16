import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Expand } from 'lucide-react';

import { JsonViewer, MarkdownViewer, isMarkdownContent } from '@flows/ui-kit';

import { tryParseJson } from '../../utils';
import { ContentPreviewModal } from '../ContentPreviewModal';
import { S3Image } from '../S3Image';
import { getFirstInputData } from './helpers';

import type { VisualizationProps } from './types';

export const PreviewVisualization: React.FC<VisualizationProps> = ({ node, definition, contentHeight }) => {
    const { t } = useTranslation(['nodes']);
    const [dims, setDims] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const lastInput = getFirstInputData(node, definition);
    const maxH = contentHeight ?? 120;

    if (!lastInput) {
        return (
            <div
                className="text-[10px] text-muted-foreground/60 italic text-center py-6 bg-muted/30 rounded-lg border border-dashed border-border flex items-center justify-center"
                style={{ minHeight: contentHeight ? `${contentHeight}px` : undefined }}
            >
                {t('visualization.waitingForData')}
            </div>
        );
    }

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsModalOpen(true);
    };

    // Render inline preview based on content type
    const renderInlinePreview = () => {
        // Image type
        if (lastInput.type === 'image') {
            return (
                <>
                    <div className="flex justify-center items-center p-2 min-h-[80px]">
                        <S3Image
                            src={String(lastInput.value)}
                            className="max-w-full rounded object-contain"
                            style={{ maxHeight: `${maxH}px` }}
                            alt="Preview"
                            onLoad={e => setDims(`${e.currentTarget.naturalWidth}×${e.currentTarget.naturalHeight}`)}
                        />
                    </div>
                    {dims && (
                        <div className="absolute bottom-1 right-1 bg-black/70 text-[9px] text-white/90 px-1.5 py-0.5 rounded backdrop-blur-sm font-mono">
                            {dims}
                        </div>
                    )}
                </>
            );
        }

        // JSON type (only actual objects, not null/strings)
        if (lastInput.type === 'json' || (lastInput.value !== null && typeof lastInput.value === 'object')) {
            return (
                <div className="p-2" onWheel={e => e.stopPropagation()}>
                    <JsonViewer data={lastInput.value} maxHeight={maxH} collapsed={2} />
                </div>
            );
        }

        // Try to parse JSON string
        const parsedJson = tryParseJson(lastInput.value);
        if (parsedJson) {
            return (
                <div className="p-2" onWheel={e => e.stopPropagation()}>
                    <JsonViewer data={parsedJson} maxHeight={maxH} collapsed={2} />
                </div>
            );
        }

        // Markdown type (explicit type OR auto-detected from content)
        const strValue = String(lastInput.value ?? '');
        if (lastInput.type === 'markdown' || isMarkdownContent(strValue)) {
            return (
                <div className="p-2" onWheel={e => e.stopPropagation()}>
                    <MarkdownViewer content={strValue} maxHeight={maxH} />
                </div>
            );
        }

        // Plain text (default)
        const lines = strValue.split('\n').slice(0, 3);
        const truncatedText = lines.join('\n');
        const isTruncated = strValue.split('\n').length > 3 || strValue.length > 150;

        return (
            <div className="text-xs p-3 text-foreground/80 break-words font-mono whitespace-pre-wrap">
                {truncatedText.slice(0, 150)}
                {isTruncated && <span className="text-muted-foreground">...</span>}
            </div>
        );
    };

    return (
        <>
            <div
                className="rounded-lg border border-border/30 overflow-hidden bg-muted/10 relative cursor-pointer group hover:border-primary/50 transition-colors"
                onClick={handleClick}
                role="button"
                tabIndex={0}
                onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setIsModalOpen(true);
                    }
                }}
            >
                {renderInlinePreview()}
                {/* Expand indicator on hover */}
                <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="bg-black/70 text-white/90 p-1 rounded backdrop-blur-sm">
                        <Expand className="w-3 h-3" />
                    </div>
                </div>
            </div>
            <ContentPreviewModal
                open={isModalOpen}
                onOpenChange={setIsModalOpen}
                content={{ value: lastInput.value, type: lastInput.type }}
            />
        </>
    );
};
