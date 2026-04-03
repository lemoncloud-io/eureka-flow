import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Check, Copy, Globe, Link } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@flows/lib/utils';
import {
    Button,
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Input,
    Label,
    Textarea,
} from '@flows/ui-kit';

import type { UpdateFlowBody } from '@flows/flows';

interface PublishDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    flowName: string;
    flowDescription: string;
    flowId: string | null;
    onPublish: (body: UpdateFlowBody) => Promise<boolean>;
}

const DESCRIPTION_MAX_LENGTH = 500;

export const PublishDialog: React.FC<PublishDialogProps> = ({
    open,
    onOpenChange,
    flowName,
    flowDescription,
    flowId,
    onPublish,
}) => {
    const { t } = useTranslation(['flows']);

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [linkCopied, setLinkCopied] = useState(false);

    // Reset form when dialog opens
    useEffect(() => {
        if (!open) return;
        setName(flowName);
        setDescription(flowDescription);
        setLinkCopied(false);
    }, [open, flowName, flowDescription]);

    const flowUrl = flowId ? `${window.location.origin}/flows/${flowId}` : '';

    const handleCopyLink = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(flowUrl);
            setLinkCopied(true);
            toast.success(t('flowEditor.linkCopied'));
            setTimeout(() => setLinkCopied(false), 2000);
        } catch {
            toast.error(t('flowEditor.failedToCopyLink'));
        }
    }, [flowUrl, t]);

    const handlePublish = useCallback(async () => {
        setIsSubmitting(true);
        try {
            const success = await onPublish({
                name: name.trim() || flowName,
                description: description.trim(),
                isPublic: true,
            });
            if (success) {
                // Auto-copy share link
                if (flowUrl) {
                    try {
                        await navigator.clipboard.writeText(flowUrl);
                        toast.success(t('publish.publishedWithLink', 'Published! Link copied to clipboard'));
                    } catch {
                        toast.success(t('publish.published'));
                    }
                } else {
                    toast.success(t('publish.published'));
                }
                onOpenChange(false);
            }
        } finally {
            setIsSubmitting(false);
        }
    }, [name, description, flowName, onPublish, onOpenChange, t]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md gap-0 p-0 overflow-hidden">
                {/* Header with accent */}
                <div className="relative px-6 pt-5 pb-4">
                    <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.04] to-transparent pointer-events-none" />
                    <DialogHeader className="relative">
                        <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
                                <Globe className="w-4 h-4 text-primary" />
                            </div>
                            <div>
                                <DialogTitle className="text-base">{t('publish.title')}</DialogTitle>
                                <p className="text-xs text-muted-foreground mt-0.5">{t('publish.description')}</p>
                            </div>
                        </div>
                    </DialogHeader>
                </div>

                {/* Form */}
                <div className="space-y-4 px-6 pb-4">
                    {/* Name */}
                    <div className="space-y-1.5">
                        <Label htmlFor="publish-name" className="text-xs font-medium text-muted-foreground">
                            {t('publish.flowName')}
                        </Label>
                        <Input
                            id="publish-name"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder={t('header.untitledWorkflow')}
                            className="h-9"
                        />
                    </div>

                    {/* Description */}
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="publish-description" className="text-xs font-medium text-muted-foreground">
                                {t('publish.flowDescription')}
                            </Label>
                            <span
                                className={cn(
                                    'text-[10px] tabular-nums',
                                    description.length > DESCRIPTION_MAX_LENGTH
                                        ? 'text-destructive'
                                        : 'text-muted-foreground/50'
                                )}
                            >
                                {description.length}/{DESCRIPTION_MAX_LENGTH}
                            </span>
                        </div>
                        <Textarea
                            id="publish-description"
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder={t('publish.descriptionPlaceholder')}
                            rows={3}
                            maxLength={DESCRIPTION_MAX_LENGTH}
                            className="resize-none text-sm"
                        />
                    </div>

                    {/* Share Link */}
                    {flowId && (
                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-muted-foreground">
                                {t('publish.shareLink')}
                            </Label>
                            <button
                                onClick={handleCopyLink}
                                className={cn(
                                    'group flex w-full items-center gap-2 rounded-lg border px-3 py-2',
                                    'bg-muted/30 transition-colors hover:bg-muted/50',
                                    linkCopied && 'border-emerald-500/30 bg-emerald-500/5'
                                )}
                            >
                                <Link className="w-3.5 h-3.5 shrink-0 text-muted-foreground/50" />
                                <span className="flex-1 truncate text-left text-xs text-muted-foreground">
                                    {flowUrl}
                                </span>
                                {linkCopied ? (
                                    <Check className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                                ) : (
                                    <Copy className="w-3.5 h-3.5 shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                                )}
                            </button>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <DialogFooter className="border-t border-border/40 px-6 py-3 bg-muted/20">
                    <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                        {t('publish.cancel')}
                    </Button>
                    <Button
                        size="sm"
                        className="gap-1.5"
                        onClick={handlePublish}
                        disabled={isSubmitting || description.length > DESCRIPTION_MAX_LENGTH}
                    >
                        <Globe className="w-3.5 h-3.5" />
                        {isSubmitting ? t('publish.saving') : t('publish.publishButton')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
