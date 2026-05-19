import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AlertTriangle, ExternalLink, GitBranch, Loader2, Maximize2 } from 'lucide-react';
import { toast } from 'sonner';

import { useCreateToolMutation, useFlowsListQuery, useUpdateToolMutation } from '@flows/flows';
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

    const flowsQuery = useFlowsListQuery(open && (tool?.stereo === 'flow' || !isEdit));
    const flows = flowsQuery.data?.pages?.flatMap(p => p.list) ?? [];

    // Auto-fetch all pages so the full flow list is available in the dropdown
    useEffect(() => {
        if (flowsQuery.hasNextPage && !flowsQuery.isFetchingNextPage) {
            flowsQuery.fetchNextPage();
        }
    }, [flowsQuery.hasNextPage, flowsQuery.isFetchingNextPage, flowsQuery.fetchNextPage]);

    const [name, setName] = useState(tool?.name ?? '');
    const [stereo, setStereo] = useState<'link' | 'embed' | 'flow'>(tool?.stereo ?? 'link');
    const [actionLabel, setActionLabel] = useState(tool?.actionLabel ?? '');
    const [urlTemplate, setUrlTemplate] = useState(tool?.urlTemplate ?? '');
    const [flowRefId, setFlowRefId] = useState(tool?.flowRef?.flowId ?? '');
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
                        flowRef: flowRefId ? { flowId: flowRefId } : undefined,
                        memo: memo || undefined,
                    },
                },
                {
                    onSuccess: result => {
                        result.warnings?.forEach(w => toast.warning(w));
                        toast.success(t('navigator.toolSaved', 'Tool saved'));
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
                    flowRef: flowRefId ? { flowId: flowRefId } : undefined,
                    memo: memo || undefined,
                },
                {
                    onSuccess: result => {
                        result.warnings?.forEach(w => toast.warning(w));
                        toast.success(t('navigator.toolCreated', 'Tool created'));
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
                            <div className="grid grid-cols-3 gap-2">
                                {(
                                    [
                                        {
                                            value: 'link' as const,
                                            icon: ExternalLink,
                                            label: 'Link',
                                            desc: 'Opens in new tab',
                                        },
                                        {
                                            value: 'embed' as const,
                                            icon: Maximize2,
                                            label: 'Embed',
                                            desc: 'Inline iframe',
                                        },
                                        {
                                            value: 'flow' as const,
                                            icon: GitBranch,
                                            label: 'Flow',
                                            desc: 'AI pipeline',
                                        },
                                    ] as const
                                ).map(opt => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setStereo(opt.value)}
                                        className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-all ${
                                            stereo === opt.value
                                                ? 'border-primary bg-primary/5 text-foreground'
                                                : 'border-border text-muted-foreground hover:border-border/80 hover:bg-accent/30'
                                        }`}
                                    >
                                        <opt.icon className="h-5 w-5" />
                                        <span className="text-xs font-medium">{opt.label}</span>
                                        <span className="text-[10px] leading-tight opacity-60">{opt.desc}</span>
                                    </button>
                                ))}
                            </div>
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
                    {stereo === 'flow' && (
                        <div className="space-y-2">
                            <Label>{t('navigator.flowRef', 'Connected Flow')}</Label>
                            <Select value={flowRefId || undefined} onValueChange={setFlowRefId}>
                                <SelectTrigger>
                                    <SelectValue placeholder={t('navigator.selectFlow', 'Select a flow...')} />
                                </SelectTrigger>
                                <SelectContent>
                                    {flows.length === 0 ? (
                                        <SelectItem value="__empty__" disabled>
                                            {t('navigator.noFlows', 'No flows available')}
                                        </SelectItem>
                                    ) : (
                                        flows
                                            .filter(f => f.id)
                                            .map(f => (
                                                <SelectItem key={f.id} value={f.id!}>
                                                    {f.name || `Flow ${f.id}`}
                                                </SelectItem>
                                            ))
                                    )}
                                </SelectContent>
                            </Select>
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
                            {isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                            {isEdit ? t('navigator.save', 'Save') : t('navigator.create', 'Create')}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
