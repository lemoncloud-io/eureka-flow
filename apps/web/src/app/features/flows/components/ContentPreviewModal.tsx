import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Check, Copy, Download, X } from 'lucide-react';

import { downloadImage, useS3Image } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import {
    Button,
    Dialog,
    DialogClose,
    DialogContent,
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
                <div className="flex gap-1 ml-auto">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCopyToClipboard}>
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleDownload}>
                        <Download className="w-4 h-4" />
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
        <Button variant="ghost" size="icon" onClick={handleCopy} className="h-8 w-8">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        </Button>
    );
};

export const ContentPreviewModal: React.FC<ContentPreviewModalProps> = ({ open, onOpenChange, content }) => {
    // Derive content type from props (no useState needed)
    const contentType = useMemo(() => (content ? detectContentType(content.value, content.type) : 'text'), [content]);

    if (!content) return null;

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
                        <div className="p-4 bg-muted/30 rounded-lg" onWheel={e => e.stopPropagation()}>
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
                        <div className="p-4" onWheel={e => e.stopPropagation()}>
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
                        <div className="p-4 bg-muted/30 rounded-lg font-mono text-sm whitespace-pre-wrap break-words">
                            {String(content.value)}
                        </div>
                    </div>
                );
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className={cn(
                    'max-w-4xl max-h-[85vh] p-0 gap-0',
                    'bg-background/95 backdrop-blur-xl',
                    '[&>button]:hidden' // Hide default close button
                )}
            >
                {/* Custom header with prominent close button */}
                <div className="flex items-center justify-end p-3 border-b border-border">
                    <DialogClose asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-muted">
                            <X className="w-5 h-5" />
                        </Button>
                    </DialogClose>
                </div>
                {/* Content */}
                <ScrollArea className="max-h-[calc(85vh-56px)] p-6">{renderContent()}</ScrollArea>
            </DialogContent>
        </Dialog>
    );
};
