import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Code2, FileImage, FileText, Type, X } from 'lucide-react';
import { toast } from 'sonner';

import { downloadImage, useS3Image } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import {
    Button,
    Dialog,
    DialogClose,
    DialogContent,
    DialogHeader,
    DialogTitle,
    JsonViewer,
    MarkdownViewer,
    ScrollArea,
    isMarkdownContent,
} from '@flows/ui-kit';

import { tryParseJson } from '../utils';

type ContentType = 'image' | 'json' | 'markdown' | 'text';

/** Props for ContentPreviewModal */
export interface ContentPreviewModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    content: { value: unknown; type?: string } | null;
}

/** Get icon for content type */
const getContentTypeIcon = (type: ContentType): React.ReactNode => {
    const iconClass = 'w-4 h-4';
    switch (type) {
        case 'image':
            return <FileImage className={iconClass} />;
        case 'json':
            return <Code2 className={iconClass} />;
        case 'markdown':
            return <FileText className={iconClass} />;
        case 'text':
        default:
            return <Type className={iconClass} />;
    }
};

/** Detect content type from value and explicit type */
const detectContentType = (value: unknown, explicitType?: string): ContentType => {
    if (explicitType === 'image') return 'image';
    if (explicitType === 'json' || (value !== null && typeof value === 'object')) return 'json';
    if (tryParseJson(value)) return 'json';
    if (explicitType === 'markdown' || isMarkdownContent(value)) return 'markdown';
    return 'text';
};

/** Copy image to clipboard using canvas (handles CORS and format issues) */
const copyImageToClipboard = async (imgElement: HTMLImageElement): Promise<void> => {
    const canvas = document.createElement('canvas');
    canvas.width = imgElement.naturalWidth;
    canvas.height = imgElement.naturalHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas context');

    ctx.drawImage(imgElement, 0, 0);

    return new Promise((resolve, reject) => {
        canvas.toBlob(async blob => {
            if (!blob) {
                reject(new Error('Failed to create blob'));
                return;
            }

            try {
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                resolve();
            } catch (err) {
                reject(err);
            }
        }, 'image/png');
    });
};

/** Image preview with download support */
const ImagePreview: React.FC<{ src: string }> = ({ src }) => {
    const { t } = useTranslation(['nodes']);
    const { src: resolvedSrc, isLoading, error } = useS3Image(src);
    const [dims, setDims] = useState<string | null>(null);
    const imgRef = useRef<HTMLImageElement>(null);

    const handleDownload = useCallback(() => {
        if (resolvedSrc) {
            downloadImage(resolvedSrc, `preview-${Date.now()}.png`);
            toast.success(t('preview.downloadStarted'));
        }
    }, [resolvedSrc, t]);

    const handleCopyToClipboard = useCallback(async () => {
        if (!imgRef.current) return;

        try {
            await copyImageToClipboard(imgRef.current);
            toast.success(t('preview.imageCopied'));
        } catch {
            // Fallback: copy the URL instead
            try {
                await navigator.clipboard.writeText(src);
                toast.success(t('preview.urlCopied'));
            } catch {
                toast.error(t('preview.copyFailed'));
            }
        }
    }, [src, t]);

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
                    ref={imgRef}
                    src={resolvedSrc}
                    alt="Preview"
                    className="max-w-full max-h-[60vh] object-contain rounded"
                    onLoad={e => setDims(`${e.currentTarget.naturalWidth}×${e.currentTarget.naturalHeight}`)}
                />
            </div>
            <div className="flex items-center justify-between">
                {dims && <span className="text-xs text-muted-foreground font-mono">{dims}</span>}
                <ImageActions onCopy={handleCopyToClipboard} onDownload={handleDownload} />
            </div>
        </div>
    );
};

/** Image action buttons */
const ImageActions: React.FC<{ onCopy: () => void; onDownload: () => void }> = ({ onCopy, onDownload }) => {
    const { t } = useTranslation(['nodes']);

    return (
        <div className="flex gap-1 ml-auto">
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={onCopy}>
                {t('preview.copy')}
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={onDownload}>
                {t('preview.download')}
            </Button>
        </div>
    );
};

/** Text/JSON copy button */
const CopyButton: React.FC<{ value: string }> = ({ value }) => {
    const { t } = useTranslation(['nodes']);

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(value);
            toast.success(t('preview.copied'));
        } catch {
            toast.error(t('preview.copyFailed'));
        }
    }, [value, t]);

    return (
        <Button variant="outline" size="sm" onClick={handleCopy} className="h-8 gap-1.5 text-xs">
            {t('preview.copy')}
        </Button>
    );
};

export const ContentPreviewModal: React.FC<ContentPreviewModalProps> = ({ open, onOpenChange, content }) => {
    const { t } = useTranslation(['nodes']);

    // Derive content type from props (no useState needed)
    const contentType = useMemo(() => (content ? detectContentType(content.value, content.type) : 'text'), [content]);

    // Get localized content type label
    const contentTypeLabel = useMemo(() => {
        switch (contentType) {
            case 'image':
                return t('preview.types.image');
            case 'json':
                return t('preview.types.json');
            case 'markdown':
                return t('preview.types.markdown');
            case 'text':
            default:
                return t('preview.types.text');
        }
    }, [contentType, t]);

    if (!content) return null;

    const renderContent = () => {
        switch (contentType) {
            case 'image':
                return <ImagePreview src={String(content.value)} />;

            case 'json': {
                const jsonData = tryParseJson(content.value) ?? content.value;
                return (
                    <div className="relative">
                        <div className="absolute top-2 right-2 z-10">
                            <CopyButton value={JSON.stringify(jsonData, null, 2)} />
                        </div>
                        <div className="p-4" onWheel={e => e.stopPropagation()}>
                            <JsonViewer data={jsonData} collapsed={false} />
                        </div>
                    </div>
                );
            }

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
                        <div className="p-4 font-mono text-sm whitespace-pre-wrap break-words">
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
                {/* Header with content type and close button */}
                <DialogHeader className="flex flex-row items-center justify-between p-4 border-b border-border space-y-0">
                    <DialogTitle className="flex items-center gap-2 text-sm font-medium">
                        {getContentTypeIcon(contentType)}
                        <span>{contentTypeLabel}</span>
                    </DialogTitle>
                    <DialogClose asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-muted">
                            <X className="w-4 h-4" />
                            <span className="sr-only">{t('preview.close')}</span>
                        </Button>
                    </DialogClose>
                </DialogHeader>
                {/* Content */}
                <ScrollArea className="max-h-[calc(85vh-64px)] p-4">{renderContent()}</ScrollArea>
            </DialogContent>
        </Dialog>
    );
};
