import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Copy, FileText, Pencil, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

import { decodeDataUrl } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import {
    Button,
    Dialog,
    DialogClose,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    ScrollArea,
} from '@flows/ui-kit';

/** Max height for the editor textarea */
const EDITOR_MAX_HEIGHT = 'calc(85vh - 160px)';

export interface FilePreviewDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    fileData: string;
    fileName: string;
    onDelete: () => void;
    onEdit?: (newDataUrl: string) => void;
}

/** Encode text content back to base64 data URL with proper UTF-8 support */
const encodeToDataUrl = (content: string, mimeType: string): string => {
    const bytes = new TextEncoder().encode(content);
    const binary = Array.from(bytes, b => String.fromCharCode(b)).join('');
    return `data:${mimeType};base64,${btoa(binary)}`;
};

/** Extract MIME type from data URL */
const getMimeType = (dataUrl: string): string => {
    const match = dataUrl.match(/^data:([^;,]+)/);
    return match?.[1] || 'text/plain';
};

export const FilePreviewDialog: React.FC<FilePreviewDialogProps> = ({
    open,
    onOpenChange,
    fileData,
    fileName,
    onDelete,
    onEdit,
}) => {
    const { t } = useTranslation(['flows', 'nodes']);
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState('');

    const decodedContent = useMemo(() => decodeDataUrl(fileData), [fileData]);

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(decodedContent);
            toast.success(t('nodes:preview.copied'));
        } catch {
            toast.error(t('nodes:preview.copyFailed'));
        }
    }, [decodedContent, t]);

    const handleStartEdit = () => {
        setEditContent(decodedContent);
        setIsEditing(true);
    };

    const handleCancelEdit = () => {
        setIsEditing(false);
        setEditContent('');
    };

    const handleSaveEdit = () => {
        if (onEdit) {
            onEdit(encodeToDataUrl(editContent, getMimeType(fileData)));
        }
        setIsEditing(false);
        setEditContent('');
    };

    const handleDelete = () => {
        onDelete();
        onOpenChange(false);
    };

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen) {
            setIsEditing(false);
            setEditContent('');
        }
        onOpenChange(nextOpen);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent
                className={cn(
                    'max-w-3xl max-h-[85vh] p-0 gap-0',
                    'bg-background/95 backdrop-blur-xl',
                    '[&>button]:hidden'
                )}
            >
                {/* Header */}
                <DialogHeader className="flex flex-row items-center justify-between p-4 border-b border-border space-y-0">
                    <DialogTitle className="flex items-center gap-2 text-sm font-medium">
                        <FileText className="w-4 h-4" />
                        <span className="truncate max-w-[300px]">{fileName}</span>
                    </DialogTitle>
                    <div className="flex items-center gap-1">
                        {!isEditing && (
                            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={handleCopy}>
                                <Copy className="w-3.5 h-3.5" />
                                {t('nodes:preview.copy')}
                            </Button>
                        )}
                        {onEdit && !isEditing && (
                            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={handleStartEdit}>
                                <Pencil className="w-3.5 h-3.5" />
                                {t('flows:detailPanel.editFile')}
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={handleDelete}
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            {t('flows:detailPanel.removeFile')}
                        </Button>
                        <DialogClose asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-muted">
                                <X className="w-4 h-4" />
                            </Button>
                        </DialogClose>
                    </div>
                </DialogHeader>

                {/* Content */}
                {isEditing ? (
                    <div className="p-4">
                        <textarea
                            className="w-full bg-muted/30 border border-border rounded-lg p-3 font-mono text-sm text-foreground focus:border-primary/50 outline-none resize-none"
                            style={{ maxHeight: EDITOR_MAX_HEIGHT, minHeight: '300px', height: '60vh' }}
                            value={editContent}
                            onChange={e => setEditContent(e.target.value)}
                            spellCheck={false}
                        />
                    </div>
                ) : (
                    <ScrollArea className="max-h-[calc(85vh-120px)]">
                        <div className="p-4">
                            <pre className="font-mono text-sm whitespace-pre-wrap break-all text-foreground/90">
                                {decodedContent}
                            </pre>
                        </div>
                    </ScrollArea>
                )}

                {/* Footer (edit mode only) */}
                {isEditing && (
                    <DialogFooter className="flex flex-row justify-end gap-2 p-4 border-t border-border">
                        <Button variant="outline" size="sm" onClick={handleCancelEdit}>
                            {t('flows:detailPanel.cancelEdit')}
                        </Button>
                        <Button size="sm" onClick={handleSaveEdit}>
                            {t('flows:detailPanel.saveFile')}
                        </Button>
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    );
};
