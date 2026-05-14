import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

import { useCreateToolMutation, useUpdateToolMutation } from '@flows/flows';
import {
    Button,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    Input,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Textarea,
} from '@flows/ui-kit';

import type { Tool } from '@flows/flows';

const INVALID_PLACEHOLDER_RE = /\{(?!(itemId|itemName|stageId|stageName|taskId|taskTitle))\w+\}/;

interface ToolFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    tool?: Tool;
}

export const ToolFormDialog = ({ open, onOpenChange, tool }: ToolFormDialogProps) => {
    const { t } = useTranslation();
    const isEdit = !!tool;
    const createMutation = useCreateToolMutation();
    const updateMutation = useUpdateToolMutation();

    const [name, setName] = useState(tool?.name ?? '');
    const [stereo, setStereo] = useState<'link' | 'embed' | 'flow'>(tool?.stereo ?? 'link');
    const [actionLabel, setActionLabel] = useState(tool?.actionLabel ?? '');
    const [urlTemplate, setUrlTemplate] = useState(tool?.urlTemplate ?? '');
    const [memo, setMemo] = useState(tool?.memo ?? '');

    const hasInvalidPlaceholder = urlTemplate && INVALID_PLACEHOLDER_RE.test(urlTemplate);
    const needsUrl = stereo === 'link' || stereo === 'embed';

    const handleSubmit = () => {
        if (!name.trim() || !actionLabel.trim()) return;
        if (needsUrl && !urlTemplate.trim()) return;

        if (isEdit) {
            updateMutation.mutate(
                {
                    id: tool.id,
                    input: {
                        name: name.trim(),
                        actionLabel: actionLabel.trim(),
                        urlTemplate: urlTemplate.trim() || undefined,
                        memo: memo || undefined,
                    },
                },
                {
                    onSuccess: result => {
                        result.warnings?.forEach(w => toast.warning(w));
                        onOpenChange(false);
                    },
                }
            );
        } else {
            createMutation.mutate(
                {
                    name: name.trim(),
                    stereo,
                    actionLabel: actionLabel.trim(),
                    urlTemplate: urlTemplate.trim() || undefined,
                    memo: memo || undefined,
                },
                {
                    onSuccess: result => {
                        result.warnings?.forEach(w => toast.warning(w));
                        onOpenChange(false);
                    },
                }
            );
        }
    };

    const isPending = createMutation.isPending || updateMutation.isPending;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>
                        {isEdit ? t('navigator.editTool', 'Edit Tool') : t('navigator.createTool', 'Create Tool')}
                    </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>{t('navigator.toolName', 'Name')}</Label>
                        <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. 촬영 폴더" />
                    </div>
                    {!isEdit && (
                        <div className="space-y-2">
                            <Label>{t('navigator.toolStereo', 'Type')}</Label>
                            <Select value={stereo} onValueChange={v => setStereo(v as typeof stereo)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="link">Link (new tab)</SelectItem>
                                    <SelectItem value="embed">Embed (iframe)</SelectItem>
                                    <SelectItem value="flow">Flow (pipeline)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    <div className="space-y-2">
                        <Label>{t('navigator.actionLabel', 'Action Label')}</Label>
                        <Input
                            value={actionLabel}
                            onChange={e => setActionLabel(e.target.value)}
                            placeholder="e.g. 폴더 열기"
                        />
                    </div>
                    {(needsUrl || urlTemplate) && (
                        <div className="space-y-2">
                            <Label>URL Template {needsUrl && <span className="text-destructive">*</span>}</Label>
                            <Input
                                value={urlTemplate}
                                onChange={e => setUrlTemplate(e.target.value)}
                                placeholder="https://example.com/{itemId}"
                            />
                            {hasInvalidPlaceholder && (
                                <div className="flex items-center gap-1.5 text-xs text-orange-500">
                                    <AlertTriangle className="h-3 w-3" />
                                    {t(
                                        'navigator.invalidPlaceholder',
                                        'Unsupported placeholder detected. Allowed: {itemId}, {itemName}, {stageId}, {stageName}, {taskId}, {taskTitle}'
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                    <div className="space-y-2">
                        <Label>{t('navigator.memo', 'Memo')}</Label>
                        <Textarea value={memo} onChange={e => setMemo(e.target.value)} rows={2} />
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => onOpenChange(false)}>
                            {t('navigator.cancel', 'Cancel')}
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            disabled={
                                !name.trim() || !actionLabel.trim() || (needsUrl && !urlTemplate.trim()) || isPending
                            }
                        >
                            {isEdit ? t('navigator.save', 'Save') : t('navigator.create', 'Create')}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
