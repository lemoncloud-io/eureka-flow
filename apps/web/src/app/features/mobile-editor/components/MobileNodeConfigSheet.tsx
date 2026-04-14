import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
    AlertCircle,
    Camera,
    Check,
    ChevronDown,
    ChevronRight,
    FileText,
    Image,
    Loader2,
    Play,
    Trash2,
    Upload,
    X,
    Zap,
} from 'lucide-react';
import { toast } from 'sonner';

import {
    EXECUTE_FUNCTIONS,
    compressImageIfNeeded,
    getPermissions,
    processImageWithConfig,
    runNode,
    upsertNode,
    useBlockRegistry,
    useCanvasStore,
} from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { Button, Input, Label, Sheet, SheetContent, SheetTitle, Switch, Textarea } from '@flows/ui-kit';

import { BlockIcon } from '../../flows/components/BlockIcon';
import { RunHistoryPanel } from '../../flows/components/RunHistoryPanel';
import { S3Image } from '../../flows/components/S3Image';
import { INPUT_FILE_ACCEPT, clearFileConfig, isTempId, processUploadedFile } from '../../flows/utils';
import { deleteNodeWithSync, hydrateInputPorts } from '../utils';

import type { FlowRole } from '@flows/flows';
import type { NodeConfigItem, NodeData, NodeState } from '@lemoncloud/eureka-flows-api';

const STATE_STYLES: Record<string, { bg: string; text: string; label: string; icon: React.ReactNode }> = {
    IDLE: { bg: 'bg-muted', text: 'text-muted-foreground', label: 'Idle', icon: null },
    READY: { bg: 'bg-primary/15', text: 'text-primary', label: 'Ready', icon: null },
    RUNNING: {
        bg: 'bg-warning/15',
        text: 'text-warning',
        label: 'Running',
        icon: <Loader2 className="w-3 h-3 animate-spin" />,
    },
    COMPLETED: {
        bg: 'bg-success/15',
        text: 'text-success',
        label: 'Done',
        icon: <Check className="w-3 h-3" />,
    },
    ERROR: {
        bg: 'bg-destructive/15',
        text: 'text-destructive',
        label: 'Error',
        icon: <AlertCircle className="w-3 h-3" />,
    },
};

interface MobileImageUploadProps {
    node: NodeData;
    onConfigChange: (key: string, value: unknown) => void;
}

const MobileImageUpload = ({ node, onConfigChange }: MobileImageUploadProps) => {
    const { t } = useTranslation(['flows']);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);

    const img = node.config?.imageData as string | undefined;
    const fileData = node.config?.fileData as string | undefined;
    const fileName = node.config?.fileName as string | undefined;

    const aspectRatio = node.config?.aspectRatio as string | undefined;
    const maxWidth = node.config?.maxWidth as string | undefined;
    const bypass = node.config?.bypass as string | undefined;

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            await processUploadedFile(file, onConfigChange, dataUrl =>
                processImageWithConfig(dataUrl, { aspectRatio, maxWidth, bypass })
            );
        } finally {
            setIsUploading(false);
            e.target.value = '';
        }
    };

    const handleRemove = () => {
        onConfigChange('imageData', '');
        clearFileConfig(onConfigChange);
    };

    const hasImage = !!img && !fileData;
    const hasFile = !!fileData;
    const isEmpty = !hasImage && !hasFile;

    return (
        <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">
                {t('detailPanel.fileOrImage', 'File / Image')}
            </Label>

            {/* Hidden file inputs */}
            <input
                ref={fileInputRef}
                type="file"
                accept={INPUT_FILE_ACCEPT}
                className="hidden"
                onChange={handleFileUpload}
            />
            <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileUpload}
            />

            {isUploading && (
                <div className="h-32 rounded-xl border border-dashed border-primary/40 bg-primary/5 flex items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5 text-primary animate-spin" />
                    <span className="text-sm text-primary">{t('detailPanel.uploading', 'Uploading...')}</span>
                </div>
            )}

            {/* Image preview */}
            {!isUploading && hasImage && (
                <div className="space-y-2">
                    <div className="relative w-full h-40 rounded-xl border border-border bg-black/20 overflow-hidden">
                        <S3Image src={img} alt="Preview" className="w-full h-full object-contain" />
                        <button
                            onClick={handleRemove}
                            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center active:scale-90 transition-transform"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className={cn(
                                'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium',
                                'bg-muted/50 hover:bg-muted active:scale-[0.98] transition-all border border-border/50'
                            )}
                        >
                            <Upload className="w-3.5 h-3.5" />
                            {t('detailPanel.changeFile', 'Change')}
                        </button>
                        <button
                            onClick={() => cameraInputRef.current?.click()}
                            className={cn(
                                'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium',
                                'bg-muted/50 hover:bg-muted active:scale-[0.98] transition-all border border-border/50'
                            )}
                        >
                            <Camera className="w-3.5 h-3.5" />
                            {t('detailPanel.takePhoto', 'Camera')}
                        </button>
                    </div>
                </div>
            )}

            {/* File preview */}
            {!isUploading && hasFile && (
                <div className="space-y-2">
                    <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/20">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <FileText className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{fileName || 'file'}</div>
                            <div className="text-[10px] text-muted-foreground">
                                {t('detailPanel.textFile', 'Text file')}
                            </div>
                        </div>
                        <button
                            onClick={handleRemove}
                            className="w-8 h-8 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center active:scale-90 transition-transform"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className={cn(
                            'w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium',
                            'bg-muted/50 hover:bg-muted active:scale-[0.98] transition-all border border-border/50'
                        )}
                    >
                        <Upload className="w-3.5 h-3.5" />
                        {t('detailPanel.changeFile', 'Change')}
                    </button>
                </div>
            )}

            {/* Empty state */}
            {!isUploading && isEmpty && (
                <div className="space-y-2">
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className={cn(
                            'w-full h-28 rounded-xl border-2 border-dashed border-border/60',
                            'flex flex-col items-center justify-center gap-2',
                            'hover:border-primary/40 hover:bg-primary/5 active:scale-[0.98] transition-all'
                        )}
                    >
                        <div className="w-10 h-10 rounded-full bg-muted/60 flex items-center justify-center">
                            <Image className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div className="text-center">
                            <div className="text-xs font-medium text-muted-foreground">
                                {t('detailPanel.clickToUpload', 'Tap to upload')}
                            </div>
                            <div className="text-[10px] text-muted-foreground/50">
                                {t('detailPanel.supportedFormats', 'Images, TXT, HTML, JSON')}
                            </div>
                        </div>
                    </button>
                    <button
                        onClick={() => cameraInputRef.current?.click()}
                        className={cn(
                            'w-full flex items-center justify-center gap-2 py-3 rounded-xl',
                            'bg-primary/10 text-primary text-sm font-medium',
                            'active:scale-[0.98] transition-all'
                        )}
                    >
                        <Camera className="w-4 h-4" />
                        {t('detailPanel.takePhoto', 'Camera')}
                    </button>
                </div>
            )}
        </div>
    );
};

interface MobileTextInputProps {
    node: NodeData;
    onConfigChange: (key: string, value: unknown) => void;
}

const MobileTextInput = ({ node, onConfigChange }: MobileTextInputProps) => {
    const { t } = useTranslation(['flows']);
    const text = (node.config?.text as string) || '';

    return (
        <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">
                {t('detailPanel.textContent', 'Text Content')}
            </Label>
            <Textarea
                value={text}
                onChange={e => onConfigChange('text', e.target.value)}
                rows={3}
                placeholder={t('detailPanel.enterText', 'Enter text...')}
                className="text-sm font-mono resize-y min-h-[60px]"
            />
        </div>
    );
};

interface MobileFileFieldProps {
    value: string;
    onChange: (value: string) => void;
}

const MobileFileField = ({ value, onChange }: MobileFileFieldProps) => {
    const { t } = useTranslation(['flows']);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        const reader = new FileReader();
        reader.onload = async evt => {
            try {
                if (evt.target?.result) {
                    const { dataUrl } = await compressImageIfNeeded(evt.target.result as string);
                    onChange(dataUrl);
                }
            } finally {
                setIsUploading(false);
            }
        };
        reader.onerror = () => setIsUploading(false);
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const hasValue = !!value && value.startsWith('data:');

    return (
        <div className="space-y-2">
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />

            {isUploading ? (
                <div className="h-20 rounded-lg border border-dashed border-primary/40 bg-primary/5 flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 text-primary animate-spin" />
                    <span className="text-xs text-primary">{t('detailPanel.uploading', 'Uploading...')}</span>
                </div>
            ) : hasValue ? (
                <div className="relative w-full h-28 rounded-lg border border-border bg-black/20 overflow-hidden">
                    <img src={value} alt="" className="w-full h-full object-contain" />
                    <button
                        onClick={() => onChange('')}
                        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            ) : null}

            <button
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                    'w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium',
                    'bg-muted/50 hover:bg-muted active:scale-[0.98] transition-all border border-border/50'
                )}
            >
                <Upload className="w-3.5 h-3.5" />
                {hasValue ? t('detailPanel.changeFile', 'Change') : t('detailPanel.uploadFile', 'Upload Image')}
            </button>
        </div>
    );
};

interface DataPreviewProps {
    data: { value?: unknown; type?: string };
    expanded?: boolean;
}

const DataPreview = React.memo(({ data, expanded }: DataPreviewProps) => {
    const jsonStr = useMemo(
        () => (data?.value !== null && typeof data?.value === 'object' ? JSON.stringify(data.value, null, 2) : null),
        [data?.value]
    );

    if (!data?.value) return <span className="text-muted-foreground/40 italic text-[11px]">empty</span>;

    if (data.type === 'image' && typeof data.value === 'string') {
        return (
            <div className="w-full h-32 rounded-lg border border-border bg-black/20 overflow-hidden">
                <S3Image src={data.value} alt="Output" className="w-full h-full object-contain" />
            </div>
        );
    }

    if (jsonStr) {
        return (
            <pre
                className={cn(
                    'text-[11px] font-mono text-foreground whitespace-pre-wrap break-all',
                    !expanded && 'line-clamp-5'
                )}
            >
                {jsonStr}
            </pre>
        );
    }

    return (
        <div className={cn('text-sm text-foreground break-all', !expanded && 'line-clamp-5')}>{String(data.value)}</div>
    );
});

interface MobileNodeConfigSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    nodeId: string | null;
    flowId: string | null;
    socketConnectionId?: string;
    role?: FlowRole;
}

export const MobileNodeConfigSheet = ({
    open,
    onOpenChange,
    nodeId,
    flowId,
    socketConnectionId,
    role = 'owner',
}: MobileNodeConfigSheetProps) => {
    const { t } = useTranslation(['flows']);
    const node = useCanvasStore(state => (nodeId ? state.nodes.find(n => n.id === nodeId) : undefined));
    const blockRegistry = useBlockRegistry();
    const [showInputData, setShowInputData] = useState(false);
    const [showOutputData, setShowOutputData] = useState(false);
    const [customLabel, setCustomLabel] = useState('');
    const [expandedDataKey, setExpandedDataKey] = useState<string | null>(null);

    const blockDef = node ? blockRegistry[node.type] : undefined;
    const syncTimerRef = useRef<number | null>(null);

    const { canEdit, canRun } = useMemo(() => getPermissions(role), [role]);

    const syncNodeToServer = useCallback(
        (updates: Record<string, unknown>) => {
            if (!canEdit || !nodeId || !flowId || isTempId(nodeId)) return;
            if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
            syncTimerRef.current = window.setTimeout(() => {
                upsertNode(nodeId, flowId, updates).catch(err => {
                    console.error('[MobileNodeConfigSheet] Failed to sync node:', err);
                });
            }, 500);
        },
        [canEdit, nodeId, flowId]
    );

    useEffect(
        () => () => {
            if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
        },
        [nodeId]
    );

    // Sync custom label when node changes
    useEffect(() => {
        setCustomLabel(node?.customLabel ?? '');
    }, [node?.id]);

    const handleConfigChange = useCallback(
        (key: string, value: unknown) => {
            if (role === 'anonymous' || !nodeId) return;
            const currentNode = useCanvasStore.getState().nodes.find(n => n.id === nodeId);
            if (!currentNode) return;

            // Guest: only allow input node value changes (local only)
            if (role === 'guest' && !currentNode.type?.startsWith('input-')) return;

            const newConfig = { ...currentNode.config, [key]: value };
            useCanvasStore.getState().updateNodeData(nodeId, { config: newConfig } as Partial<NodeData>);
            syncNodeToServer({ config: newConfig }); // no-op for guest (syncNodeToServer guards canEdit)
        },
        [role, nodeId, syncNodeToServer]
    );

    const handleCustomLabelChange = useCallback(
        (value: string) => {
            if (!canEdit) return;
            setCustomLabel(value);
            if (!nodeId) return;
            useCanvasStore.getState().updateNodeData(nodeId, { customLabel: value } as Partial<NodeData>);
            syncNodeToServer({ customLabel: value || undefined });
        },
        [canEdit, nodeId, syncNodeToServer]
    );

    const handleDescriptionChange = useCallback(
        (value: string) => {
            if (!canEdit || !nodeId) return;
            useCanvasStore.getState().updateNodeData(nodeId, { description: value } as Partial<NodeData>);
            syncNodeToServer({ description: value || undefined });
        },
        [canEdit, nodeId, syncNodeToServer]
    );

    const handleToggleAuto = useCallback(
        (auto: boolean) => {
            if (!canEdit || !nodeId) return;
            useCanvasStore.getState().updateNodeData(nodeId, { auto } as Partial<NodeData>);
            syncNodeToServer({ auto });
        },
        [canEdit, nodeId, syncNodeToServer]
    );

    const handleRun = useCallback(async () => {
        if (!canRun) return;
        if (!nodeId || !node || !blockDef) return;
        const { updateNodeData, connections: conns, nodes: allNodes } = useCanvasStore.getState();
        updateNodeData(nodeId, { state: 'RUNNING' } as Partial<NodeData>);

        try {
            const nodeConfig = (node.config ?? {}) as Record<string, string>;

            if (blockDef.isFrontend && EXECUTE_FUNCTIONS[blockDef.type]) {
                const executeFn = EXECUTE_FUNCTIONS[blockDef.type];
                const result = await executeFn(node.inputData ?? {}, node.config ?? {});
                updateNodeData(nodeId, { outputData: result, state: 'COMPLETED' } as Partial<NodeData>);
                const runBody = canEdit ? { output: result } : { output: result, config: nodeConfig };
                await runNode(nodeId, runBody, { force: true, connection: socketConnectionId });
            } else {
                if (canEdit && flowId) {
                    await hydrateInputPorts(nodeId, flowId, conns, allNodes, node.inputData ?? {});
                }
                const runBody = canEdit ? undefined : { config: nodeConfig };
                await runNode(nodeId, runBody, { connection: socketConnectionId });
            }
        } catch (e) {
            updateNodeData(nodeId, { state: 'ERROR' } as Partial<NodeData>);
            toast.error(e instanceof Error ? e.message : 'Node execution failed');
        }
    }, [canRun, canEdit, nodeId, node, blockDef, socketConnectionId, flowId]);

    const handleDelete = useCallback(() => {
        if (!canEdit || !nodeId) return;
        if (window.confirm(t('detailPanel.confirmDelete', 'Delete this node?'))) {
            deleteNodeWithSync(nodeId, flowId);
            onOpenChange(false);
        }
    }, [canEdit, nodeId, onOpenChange, flowId, t]);

    if (!node || !blockDef) return null;

    const state = (node.state ?? 'IDLE') as NodeState;
    const stateStyle = STATE_STYLES[state] ?? STATE_STYLES.IDLE;
    const isInputImage = blockDef.type === 'input-image';
    const isInputText = blockDef.type === 'input-text';
    const isAuto = !!(node as NodeData & { auto?: boolean }).auto;
    const configFields: NodeConfigItem[] = blockDef.config$$ ?? node.config$$ ?? [];

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="bottom"
                className="max-h-[90vh] rounded-t-2xl px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] [&>button:first-child]:hidden"
            >
                {/* Drag handle */}
                <div className="flex justify-center pt-2 pb-3">
                    <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
                </div>

                {/* Header: icon + title + status + run */}
                <div className="flex items-center gap-3 mb-4">
                    <div
                        className={cn(
                            'w-10 h-10 rounded-xl flex items-center justify-center',
                            blockDef.stereo === 'input' && 'bg-primary/10',
                            blockDef.stereo === 'process' && 'bg-muted/50',
                            blockDef.stereo === 'output' && 'bg-success/10'
                        )}
                    >
                        <BlockIcon icon={blockDef.icon} size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <SheetTitle className="text-base font-semibold truncate">{blockDef.label}</SheetTitle>
                            {state !== 'IDLE' && (
                                <div
                                    className={cn(
                                        'flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0',
                                        stateStyle.bg,
                                        stateStyle.text
                                    )}
                                >
                                    {stateStyle.icon}
                                    <span>{stateStyle.label}</span>
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-mono text-muted-foreground/60">{blockDef.type}</span>
                            {blockDef.isFrontend && (
                                <span className="text-[9px] px-1 py-0.5 rounded bg-primary/10 text-primary font-medium">
                                    frontend
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Run button */}
                    {canRun && blockDef.isRunnable !== false && (
                        <button
                            onClick={handleRun}
                            disabled={state === 'RUNNING'}
                            className={cn(
                                'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all',
                                'bg-primary/10 hover:bg-primary/20 text-primary active:scale-90',
                                'disabled:opacity-40'
                            )}
                        >
                            {state === 'RUNNING' ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <Play className="w-5 h-5 fill-current" />
                            )}
                        </button>
                    )}
                </div>

                <div className="space-y-4 overflow-y-auto max-h-[60vh] pb-4 px-0.5 -mx-0.5">
                    {/* Error message */}
                    {state === 'ERROR' && 'error' in node && typeof node.error === 'string' && node.error && (
                        <div className="flex items-start gap-2 rounded-lg bg-destructive/5 border border-destructive/20 px-3 py-2.5">
                            <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                            <p className="text-xs text-destructive break-all">{node.error}</p>
                        </div>
                    )}

                    {/* Label + Auto in compact row */}
                    <div className="flex items-center gap-2">
                        <Input
                            value={customLabel}
                            onChange={e => handleCustomLabelChange(e.target.value)}
                            placeholder={blockDef.label}
                            className="h-9 flex-1 text-sm"
                            disabled={!canEdit}
                        />
                        <div className="flex items-center gap-1.5 shrink-0 px-2 py-1.5 rounded-lg bg-muted/30">
                            <Zap className="w-3 h-3 text-muted-foreground/60" />
                            <Switch checked={isAuto} onCheckedChange={handleToggleAuto} disabled={!canEdit} />
                        </div>
                    </div>

                    {/* Special UI: input-image block */}
                    {isInputImage && <MobileImageUpload node={node} onConfigChange={handleConfigChange} />}

                    {/* Special UI: input-text block */}
                    {isInputText && <MobileTextInput node={node} onConfigChange={handleConfigChange} />}

                    {/* Config fields */}
                    {configFields
                        .filter(f => {
                            if (isInputImage || isInputText) return f.type !== 'file' && f.type !== 'separator';
                            return true;
                        })
                        .map(field => {
                            const value = node.config?.[field.key] ?? '';

                            if (field.type === 'separator') {
                                return (
                                    <div key={field.key} className="flex items-center gap-2 py-1">
                                        <div className="flex-1 h-px bg-border/50" />
                                        {field.label && (
                                            <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">
                                                {field.label}
                                            </span>
                                        )}
                                        <div className="flex-1 h-px bg-border/50" />
                                    </div>
                                );
                            }

                            return (
                                <div key={field.key}>
                                    <Label className="text-xs text-muted-foreground mb-1.5 block">
                                        {field.label || field.key}
                                    </Label>

                                    {field.type === 'boolean' || field.type === 'checkbox' ? (
                                        <Switch
                                            checked={!!value}
                                            onCheckedChange={v => handleConfigChange(field.key, v)}
                                        />
                                    ) : field.type === 'select' && field.options ? (
                                        <select
                                            value={String(value)}
                                            onChange={e => handleConfigChange(field.key, e.target.value)}
                                            className={cn(
                                                'w-full h-10 px-3 rounded-lg border border-border bg-background text-sm',
                                                'focus:outline-none focus:ring-2 focus:ring-primary/30'
                                            )}
                                        >
                                            {field.options.map(opt => (
                                                <option key={opt.value} value={opt.value}>
                                                    {opt.label}
                                                </option>
                                            ))}
                                        </select>
                                    ) : field.type === 'file' ? (
                                        <MobileFileField
                                            value={String(value)}
                                            onChange={v => handleConfigChange(field.key, v)}
                                        />
                                    ) : field.type === 'textarea' ? (
                                        <Textarea
                                            value={String(value)}
                                            onChange={e => handleConfigChange(field.key, e.target.value)}
                                            rows={4}
                                            className="text-sm"
                                        />
                                    ) : field.type === 'number' ? (
                                        <Input
                                            type="number"
                                            value={String(value)}
                                            onChange={e => handleConfigChange(field.key, Number(e.target.value))}
                                            className="h-10"
                                        />
                                    ) : (
                                        <Input
                                            value={String(value)}
                                            onChange={e => handleConfigChange(field.key, e.target.value)}
                                            className="h-10"
                                        />
                                    )}
                                </div>
                            );
                        })}

                    {/* Description — compact single line */}
                    <div>
                        <Label className="text-xs text-muted-foreground mb-1.5 block">
                            {t('detailPanel.description', 'Description')}
                        </Label>
                        <Input
                            value={node.description ?? ''}
                            onChange={e => handleDescriptionChange(e.target.value)}
                            placeholder={t('detailPanel.addDescription', 'Add a description...')}
                            className="h-9 text-xs"
                            disabled={!canEdit}
                        />
                    </div>

                    {/* Input Data */}
                    {node.inputData && Object.keys(node.inputData).length > 0 && (
                        <div>
                            <button
                                onClick={() => setShowInputData(!showInputData)}
                                className="flex items-center gap-2 w-full py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                            >
                                {showInputData ? (
                                    <ChevronDown className="w-3.5 h-3.5" />
                                ) : (
                                    <ChevronRight className="w-3.5 h-3.5" />
                                )}
                                Input Data
                            </button>
                            {showInputData && (
                                <div className="space-y-2 pl-2">
                                    {Object.entries(node.inputData).map(([key, data]) => (
                                        <button
                                            key={key}
                                            onClick={() =>
                                                setExpandedDataKey(expandedDataKey === `in-${key}` ? null : `in-${key}`)
                                            }
                                            className="w-full text-left rounded-lg bg-muted/30 p-2.5"
                                        >
                                            <div className="text-xs font-medium text-muted-foreground mb-1">{key}</div>
                                            <DataPreview data={data} expanded={expandedDataKey === `in-${key}`} />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Output Data */}
                    {node.outputData && Object.keys(node.outputData).length > 0 && (
                        <div>
                            <button
                                onClick={() => setShowOutputData(!showOutputData)}
                                className="flex items-center gap-2 w-full py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                            >
                                {showOutputData ? (
                                    <ChevronDown className="w-3.5 h-3.5" />
                                ) : (
                                    <ChevronRight className="w-3.5 h-3.5" />
                                )}
                                Output Data
                            </button>
                            {showOutputData && (
                                <div className="space-y-2 pl-2">
                                    {Object.entries(node.outputData).map(([key, data]) => (
                                        <button
                                            key={key}
                                            onClick={() =>
                                                setExpandedDataKey(
                                                    expandedDataKey === `out-${key}` ? null : `out-${key}`
                                                )
                                            }
                                            className="w-full text-left rounded-lg bg-muted/30 p-2.5"
                                        >
                                            <div className="text-xs font-medium text-muted-foreground mb-1">{key}</div>
                                            <DataPreview data={data} expanded={expandedDataKey === `out-${key}`} />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Execution History */}
                    {node && <RunHistoryPanel nodeId={node.id} maxHeight="240px" />}

                    {/* Delete button — owner only */}
                    {canEdit && (
                        <div className="pt-4 border-t border-border">
                            <Button variant="destructive" className="w-full gap-2" onClick={handleDelete}>
                                <Trash2 className="w-4 h-4" />
                                {t('detailPanel.deleteNode', 'Delete Node')}
                            </Button>
                        </div>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
};
