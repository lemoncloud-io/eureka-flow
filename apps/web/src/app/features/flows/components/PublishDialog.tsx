import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Check, Copy, Link } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@flows/lib/utils';
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
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
                toast.success(t('publish.published'));
                onOpenChange(false);
            }
        } finally {
            setIsSubmitting(false);
        }
    }, [name, description, flowName, onPublish, onOpenChange, t]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('publish.title')}</DialogTitle>
                    <DialogDescription>{t('publish.description')}</DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Name */}
                    <div className="space-y-1.5">
                        <Label htmlFor="publish-name" className="text-sm">
                            {t('publish.flowName')}
                        </Label>
                        <Input
                            id="publish-name"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder={t('header.untitledWorkflow')}
                        />
                    </div>

                    {/* Description */}
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="publish-description" className="text-sm">
                                {t('publish.flowDescription')}
                            </Label>
                            <span
                                className={cn(
                                    'text-xs',
                                    description.length > DESCRIPTION_MAX_LENGTH
                                        ? 'text-destructive'
                                        : 'text-muted-foreground'
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
                        />
                    </div>

                    {/* Share Link */}
                    {flowId && (
                        <div className="space-y-1.5">
                            <Label className="text-sm">{t('publish.shareLink')}</Label>
                            <div className="flex items-center gap-2">
                                <div
                                    className={cn(
                                        'flex-1 flex items-center gap-2 rounded-md border px-3 py-2',
                                        'bg-muted/50 text-sm text-muted-foreground truncate'
                                    )}
                                >
                                    <Link className="w-3.5 h-3.5 shrink-0" />
                                    <span className="truncate">{flowUrl}</span>
                                </div>
                                <Button variant="outline" size="sm" onClick={handleCopyLink} className="shrink-0">
                                    {linkCopied ? (
                                        <Check className="w-4 h-4 text-emerald-500" />
                                    ) : (
                                        <Copy className="w-4 h-4" />
                                    )}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        {t('publish.cancel')}
                    </Button>
                    <Button
                        onClick={handlePublish}
                        disabled={isSubmitting || description.length > DESCRIPTION_MAX_LENGTH}
                    >
                        {isSubmitting ? t('publish.saving') : t('publish.publishButton')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
