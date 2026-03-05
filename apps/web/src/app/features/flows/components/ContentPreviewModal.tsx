import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Check, Copy, Download, Expand, FileJson, FileText, ImageIcon, Type } from 'lucide-react';

import { downloadImage, useS3Image } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import {
    Button,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    JsonViewer,
    MarkdownViewer,
    ScrollArea,
    isMarkdownContent,
} from '@flows/ui-kit';

type ContentType = 'image' | 'json' | 'markdown' | 'text';

interface ContentPreviewModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    content: {
        value: unknown;
        type?: string;
    } | null;
}

const TYPE_ICONS: Record<ContentType, typeof Type> = {
    image: ImageIcon,
    json: FileJson,
    markdown: FileText,
    text: Type,
};

const TYPE_LABELS: Record<ContentType, string> = {
    image: 'Image',
    json: 'JSON',
    markdown: 'Markdown',
    text: 'Text',
};

/** Detect content type from value and explicit type */
const detectContentType = (value: unknown, explicitType?: string): ContentType => {
    if (explicitType === 'image') return 'image';
    if (explicitType === 'json' || typeof value === 'object') return 'json';
    if (explicitType === 'markdown' || isMarkdownContent(value)) return 'markdown';
    return 'text';
};

/** Image preview with download support */
const ImagePreview: React.FC<{ src: string }> = ({ src }) => {
    const { t } = useTranslation(['nodes']);
    const { src: resolvedSrc, isLoading, error } = useS3Image(src);
    const [dims, setDims] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    const handleDownload = useCallback(() => {
        if (resolvedSrc) {
            downloadImage(resolvedSrc, `preview-${Date.now()}.png`);
        }
    }, [resolvedSrc]);

    const handleCopyToClipboard = useCallback(async () => {
        if (!resolvedSrc) return;

        const showCopied = () => {
            setCopied(true);
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            timeoutRef.current = setTimeout(() => setCopied(false), 2000);
        };

        try {
            // Fetch the image and convert to blob
            const response = await fetch(resolvedSrc);
            const blob = await response.blob();

            // Copy to clipboard
            await navigator.clipboard.write([
                new ClipboardItem({
                    [blob.type]: blob,
                }),
            ]);

            showCopied();
        } catch {
            // Fallback: copy the URL instead
            try {
                await navigator.clipboard.writeText(src);
                showCopied();
            } catch {
                // Clipboard API not available - silently fail
                console.warn('Failed to copy to clipboard');
            }
        }
    }, [resolvedSrc, src]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (error || !resolvedSrc) {
        return (
            <div className="flex items-center justify-center h-64 text-destructive">{t('visualization.noImage')}</div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex justify-center bg-black/20 rounded-lg p-4">
                <img
                    src={resolvedSrc}
                    alt="Preview"
                    className="max-w-full max-h-[60vh] object-contain rounded"
                    onLoad={e => setDims(`${e.currentTarget.naturalWidth}×${e.currentTarget.naturalHeight}`)}
                />
            </div>
            <div className="flex items-center justify-between">
                {dims && <span className="text-xs text-muted-foreground font-mono">{dims}</span>}
                <div className="flex gap-2 ml-auto">
                    <Button variant="outline" size="sm" onClick={handleCopyToClipboard}>
                        {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
                        {copied ? 'Copied!' : 'Copy'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleDownload}>
                        <Download className="w-4 h-4 mr-1" />
                        Download
                    </Button>
                </div>
            </div>
        </div>
    );
};

/** Text/JSON copy button */
const CopyButton: React.FC<{ value: string }> = ({ value }) => {
    const [copied, setCopied] = useState(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            timeoutRef.current = setTimeout(() => setCopied(false), 2000);
        } catch {
            console.warn('Failed to copy to clipboard');
        }
    }, [value]);

    return (
        <Button variant="ghost" size="sm" onClick={handleCopy} className="h-8">
            {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
            {copied ? 'Copied!' : 'Copy'}
        </Button>
    );
};

export const ContentPreviewModal: React.FC<ContentPreviewModalProps> = ({ open, onOpenChange, content }) => {
    const { t } = useTranslation(['nodes']);

    // Derive content type from props (no useState needed)
    const contentType = useMemo(() => (content ? detectContentType(content.value, content.type) : 'text'), [content]);

    if (!content) return null;

    const TypeIcon = TYPE_ICONS[contentType];
    const typeLabel = TYPE_LABELS[contentType];

    const renderContent = () => {
        switch (contentType) {
            case 'image':
                return <ImagePreview src={String(content.value)} />;

            case 'json':
                return (
                    <div className="relative">
                        <div className="absolute top-2 right-2 z-10">
                            <CopyButton value={JSON.stringify(content.value, null, 2)} />
                        </div>
                        <div
                            className="p-4 bg-muted/30 rounded-lg border border-border"
                            onWheel={e => e.stopPropagation()}
                        >
                            <JsonViewer data={content.value} collapsed={false} />
                        </div>
                    </div>
                );

            case 'markdown':
                return (
                    <div className="relative">
                        <div className="absolute top-2 right-2 z-10">
                            <CopyButton value={String(content.value)} />
                        </div>
                        <div
                            className="p-4 bg-muted/30 rounded-lg border border-border"
                            onWheel={e => e.stopPropagation()}
                        >
                            <MarkdownViewer content={String(content.value)} />
                        </div>
                    </div>
                );

            case 'text':
            default:
                return (
                    <div className="relative">
                        <div className="absolute top-2 right-2 z-10">
                            <CopyButton value={String(content.value)} />
                        </div>
                        <div className="p-4 bg-muted/30 rounded-lg border border-border font-mono text-sm whitespace-pre-wrap break-words">
                            {String(content.value)}
                        </div>
                    </div>
                );
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className={cn('max-w-4xl max-h-[85vh] p-0 gap-0', 'bg-background/95 backdrop-blur-xl', 'flex flex-col')}
            >
                {/* Header */}
                <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-full">
                            <TypeIcon className="w-4 h-4 text-muted-foreground" />
                            <span className="text-xs font-medium text-muted-foreground">{typeLabel}</span>
                        </div>
                        <DialogTitle className="flex items-center gap-2">
                            <Expand className="w-5 h-5 text-primary" />
                            {t('visualization.value')}
                        </DialogTitle>
                    </div>
                </DialogHeader>

                {/* Content */}
                <ScrollArea className="flex-1 p-6">{renderContent()}</ScrollArea>

                {/* Footer */}
                <div className="px-6 py-3 border-t border-border flex-shrink-0">
                    <div className="flex items-center justify-end text-xs text-muted-foreground">
                        <button
                            onClick={() => onOpenChange(false)}
                            className="flex items-center gap-1 hover:text-foreground transition-colors"
                        >
                            <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs">Esc</kbd>
                            <span>Close</span>
                        </button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
