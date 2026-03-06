import React from 'react';

import { JsonViewer, MarkdownViewer, isMarkdownContent } from '@flows/ui-kit';

import { TooltipImage } from './TooltipImage';

export interface TooltipContentRendererProps {
    content: unknown;
    type: string;
    maxHeight?: number;
    collapsed?: number;
    textLimit?: number;
    /** Custom className for MarkdownViewer */
    markdownClassName?: string;
}

/**
 * Renders tooltip content based on type (image, json, markdown, text).
 * Single source of truth for content type rendering in tooltips.
 */
export const TooltipContentRenderer: React.FC<TooltipContentRendererProps> = ({
    content,
    type,
    maxHeight = 120,
    collapsed = 2,
    textLimit = 150,
    markdownClassName = 'text-xs [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-xs [&_p]:text-xs [&_code]:text-[10px]',
}) => {
    // Image type
    if (type === 'image') {
        return <TooltipImage src={content as string} altText="Preview" />;
    }

    // JSON/object type
    if (type === 'json' || (content !== null && typeof content === 'object')) {
        return (
            <div className="min-w-[100px] max-w-[400px]">
                <JsonViewer data={content} maxHeight={maxHeight} collapsed={collapsed} />
            </div>
        );
    }

    // String content - check for markdown
    const strValue = String(content ?? '');
    if (type === 'markdown' || isMarkdownContent(strValue)) {
        return (
            <div className="min-w-[100px] max-w-[400px]">
                <MarkdownViewer
                    content={strValue.slice(0, textLimit * 3)}
                    maxHeight={maxHeight}
                    className={markdownClassName}
                />
            </div>
        );
    }

    // Plain text
    return (
        <div className="text-xs text-foreground min-w-[100px] max-w-[400px] break-all whitespace-pre-wrap">
            {strValue.slice(0, textLimit)}
            {strValue.length > textLimit && <span className="text-muted-foreground">...</span>}
        </div>
    );
};
