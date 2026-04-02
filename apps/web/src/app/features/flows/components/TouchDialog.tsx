import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Wrench } from 'lucide-react';

import { touchNode } from '@flows/flows';
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    Input,
    Label,
    Switch,
} from '@flows/ui-kit';

import type { Connection, NodeData, TouchNodeBody } from '@flows/flows';

interface TouchDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    nodeId: string;
    /** Initial node data to populate form defaults */
    initialNode?: NodeData | null;
    /** Initial connection/edge data to populate form defaults */
    initialConnection?: Connection | null;
    onSuccess: (message: string) => void;
    onError: (error: string) => void;
}

interface FormData {
    timestamp: string;
    progress: string;
    required: boolean;
    modifiedAt: string;
    enterNo: string;
    exitNo: string;
    positionX: string;
    positionY: string;
    name: string;
    width: string;
    height: string;
}

const initialFormData: FormData = {
    timestamp: '',
    progress: '',
    required: false,
    modifiedAt: '',
    enterNo: '',
    exitNo: '',
    positionX: '',
    positionY: '',
    name: '',
    width: '',
    height: '',
};

const buildTouchBody = (formData: FormData): TouchNodeBody => {
    const body: TouchNodeBody = {};

    if (formData.timestamp) body.timestamp = formData.timestamp;
    if (formData.progress) body.progress = Number(formData.progress);
    if (formData.required) body.required = formData.required;
    if (formData.modifiedAt) body.modifiedAt = formData.modifiedAt;
    if (formData.enterNo) body.enterNo = Number(formData.enterNo);
    if (formData.exitNo) body.exitNo = Number(formData.exitNo);
    if (formData.positionX || formData.positionY) {
        body.position = {
            x: formData.positionX ? Number(formData.positionX) : 0,
            y: formData.positionY ? Number(formData.positionY) : 0,
        };
    }
    if (formData.name) body.name = formData.name;
    if (formData.width) body.width = Number(formData.width);
    if (formData.height) body.height = Number(formData.height);

    return body;
};

export const TouchDialog = ({
    open,
    onOpenChange,
    nodeId,
    initialNode,
    initialConnection,
    onSuccess,
    onError,
}: TouchDialogProps) => {
    const { t } = useTranslation(['flows']);
    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState<FormData>(initialFormData);

    // Compute initial form data from node or connection
    const computedFormData = useMemo<FormData>(() => {
        // Node data takes priority
        if (initialNode) {
            return {
                timestamp: '',
                progress: initialNode.executionStats?.progress?.toString() ?? '',
                required: initialNode.required ?? false,
                modifiedAt: '',
                enterNo: initialNode.enterNo?.toString() ?? '',
                exitNo: initialNode.exitNo?.toString() ?? '',
                positionX: initialNode.position?.x?.toString() ?? '',
                positionY: initialNode.position?.y?.toString() ?? '',
                name: initialNode.customLabel ?? initialNode.name ?? '',
                width: initialNode.width?.toString() ?? '',
                height: initialNode.height?.toString() ?? '',
            };
        }

        // Connection/edge data
        if (initialConnection) {
            return {
                timestamp: '',
                progress: '',
                required: false,
                modifiedAt: '',
                enterNo: '',
                exitNo: '',
                positionX: initialConnection.position?.x?.toString() ?? '',
                positionY: initialConnection.position?.y?.toString() ?? '',
                name: initialConnection.label ?? '',
                width: '',
                height: '',
            };
        }

        return initialFormData;
    }, [initialNode, initialConnection]);

    // Reset form when dialog opens
    useEffect(() => {
        if (open) {
            setFormData(computedFormData);
        }
    }, [open, computedFormData]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const body = buildTouchBody(formData);
            await touchNode(nodeId, body);
            onSuccess(t('flows:detailPanel.touchDialog.success'));
            onOpenChange(false);
        } catch (error) {
            onError(error instanceof Error ? error.message : t('flows:detailPanel.touchDialog.error'));
        } finally {
            setIsLoading(false);
        }
    };

    const handleReset = () => {
        setFormData(computedFormData);
    };

    const updateField = <K extends keyof FormData>(key: K, value: FormData[K]) => {
        setFormData(prev => ({ ...prev, [key]: value }));
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md p-5 max-h-[85vh] overflow-y-auto">
                <DialogHeader className="space-y-1">
                    <DialogTitle className="text-base flex items-center gap-2">
                        <Wrench className="w-4 h-4" />
                        {t('flows:detailPanel.touchDialog.title')}
                    </DialogTitle>
                    <DialogDescription className="text-xs font-mono">
                        {t('flows:detailPanel.touchDialog.description', { nodeId })}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-3">
                    {/* Timestamps Section */}
                    <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            {t('flows:detailPanel.touchDialog.sections.timestamps')}
                        </h4>
                        <div className="grid gap-2">
                            <div className="space-y-1">
                                <Label className="text-xs">timestamp</Label>
                                <Input
                                    type="datetime-local"
                                    value={formData.timestamp}
                                    onChange={e => updateField('timestamp', e.target.value)}
                                    className="h-8 text-xs"
                                    onKeyDown={e => e.stopPropagation()}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">modifiedAt</Label>
                                <Input
                                    type="datetime-local"
                                    value={formData.modifiedAt}
                                    onChange={e => updateField('modifiedAt', e.target.value)}
                                    className="h-8 text-xs"
                                    onKeyDown={e => e.stopPropagation()}
                                />
                            </div>
                        </div>
                    </div>

                    {/* State Section */}
                    <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            {t('flows:detailPanel.touchDialog.sections.state')}
                        </h4>
                        <div className="grid gap-2">
                            <div className="space-y-1">
                                <Label className="text-xs">progress (0-100)</Label>
                                <Input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={formData.progress}
                                    onChange={e => updateField('progress', e.target.value)}
                                    placeholder="0-100"
                                    className="h-8 text-xs"
                                    onKeyDown={e => e.stopPropagation()}
                                />
                            </div>
                            <div className="flex items-center justify-between py-1">
                                <Label className="text-xs">required</Label>
                                <Switch
                                    checked={formData.required}
                                    onCheckedChange={checked => updateField('required', checked)}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Counters Section */}
                    <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            {t('flows:detailPanel.touchDialog.sections.counters')}
                        </h4>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                                <Label className="text-xs">enterNo</Label>
                                <Input
                                    type="number"
                                    value={formData.enterNo}
                                    onChange={e => updateField('enterNo', e.target.value)}
                                    className="h-8 text-xs"
                                    onKeyDown={e => e.stopPropagation()}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">exitNo</Label>
                                <Input
                                    type="number"
                                    value={formData.exitNo}
                                    onChange={e => updateField('exitNo', e.target.value)}
                                    className="h-8 text-xs"
                                    onKeyDown={e => e.stopPropagation()}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Layout Section */}
                    <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            {t('flows:detailPanel.touchDialog.sections.layout')}
                        </h4>
                        <div className="grid gap-2">
                            <div className="space-y-1">
                                <Label className="text-xs">position</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="relative">
                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-mono">
                                            x
                                        </span>
                                        <Input
                                            type="number"
                                            value={formData.positionX}
                                            onChange={e => updateField('positionX', e.target.value)}
                                            placeholder="0"
                                            className="h-8 text-xs pl-6"
                                            onKeyDown={e => e.stopPropagation()}
                                        />
                                    </div>
                                    <div className="relative">
                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-mono">
                                            y
                                        </span>
                                        <Input
                                            type="number"
                                            value={formData.positionY}
                                            onChange={e => updateField('positionY', e.target.value)}
                                            placeholder="0"
                                            className="h-8 text-xs pl-6"
                                            onKeyDown={e => e.stopPropagation()}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">size</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="relative">
                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-mono">
                                            w
                                        </span>
                                        <Input
                                            type="number"
                                            value={formData.width}
                                            onChange={e => updateField('width', e.target.value)}
                                            placeholder="0"
                                            className="h-8 text-xs pl-6"
                                            onKeyDown={e => e.stopPropagation()}
                                        />
                                    </div>
                                    <div className="relative">
                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-mono">
                                            h
                                        </span>
                                        <Input
                                            type="number"
                                            value={formData.height}
                                            onChange={e => updateField('height', e.target.value)}
                                            placeholder="0"
                                            className="h-8 text-xs pl-6"
                                            onKeyDown={e => e.stopPropagation()}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Metadata Section */}
                    <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            {t('flows:detailPanel.touchDialog.sections.metadata')}
                        </h4>
                        <div className="space-y-1">
                            <Label className="text-xs">name</Label>
                            <Input
                                type="text"
                                value={formData.name}
                                onChange={e => updateField('name', e.target.value)}
                                className="h-8 text-xs"
                                onKeyDown={e => e.stopPropagation()}
                            />
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="text-xs flex-1"
                            onClick={handleReset}
                            disabled={isLoading}
                        >
                            {t('flows:detailPanel.touchDialog.reset')}
                        </Button>
                        <Button type="submit" size="sm" className="text-xs flex-1" disabled={isLoading}>
                            {isLoading
                                ? t('flows:detailPanel.touchDialog.sending')
                                : t('flows:detailPanel.touchDialog.send')}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};
