import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';

import { upsertNode, useBlockRegistry, useCanvasStore } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { Button, Input, Label, Sheet, SheetContent, SheetTitle, Switch, Textarea } from '@flows/ui-kit';

import { BlockIcon } from '../../flows/components/BlockIcon';
import { isTempId } from '../../flows/utils';
import { deleteNodeWithSync } from '../utils';

import type { NodeConfigItem, NodeData } from '@lemoncloud/eureka-flows-api';

interface MobileNodeConfigSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    nodeId: string | null;
    flowId: string | null;
}

export const MobileNodeConfigSheet = ({ open, onOpenChange, nodeId, flowId }: MobileNodeConfigSheetProps) => {
    const { t } = useTranslation(['flows']);
    const node = useCanvasStore(state => (nodeId ? state.nodes.find(n => n.id === nodeId) : undefined));
    const blockRegistry = useBlockRegistry();
    const [showInputData, setShowInputData] = useState(false);
    const [showOutputData, setShowOutputData] = useState(false);
    const [customLabel, setCustomLabel] = useState('');

    const blockDef = node ? blockRegistry[node.type] : undefined;
    const syncTimerRef = useRef<number | null>(null);

    const syncNodeToServer = useCallback(
        (updates: Record<string, unknown>) => {
            if (!nodeId || !flowId || isTempId(nodeId)) return;
            if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
            syncTimerRef.current = window.setTimeout(() => {
                upsertNode(nodeId, flowId, updates).catch(err => {
                    console.error('[MobileNodeConfigSheet] Failed to sync node:', err);
                });
            }, 500);
        },
        [nodeId, flowId]
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
            if (!nodeId) return;
            const currentNode = useCanvasStore.getState().nodes.find(n => n.id === nodeId);
            if (!currentNode) return;
            const newConfig = { ...currentNode.config, [key]: value };
            useCanvasStore.getState().updateNodeData(nodeId, {
                config: newConfig,
            } as Partial<NodeData>);
            syncNodeToServer({ config: newConfig });
        },
        [nodeId, syncNodeToServer]
    );

    const handleCustomLabelChange = useCallback(
        (value: string) => {
            setCustomLabel(value);
            if (!nodeId) return;
            useCanvasStore.getState().updateNodeData(nodeId, { customLabel: value } as Partial<NodeData>);
            syncNodeToServer({ customLabel: value || undefined });
        },
        [nodeId, syncNodeToServer]
    );

    const handleDelete = useCallback(() => {
        if (!nodeId) return;
        if (window.confirm(t('detailPanel.confirmDelete', 'Delete this node?'))) {
            deleteNodeWithSync(nodeId, flowId);
            onOpenChange(false);
        }
    }, [nodeId, onOpenChange, flowId, t]);

    if (!node || !blockDef) return null;

    const configFields: NodeConfigItem[] = blockDef.config$$ ?? node.config$$ ?? [];

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="bottom"
                className="max-h-[90vh] rounded-t-2xl px-4 pb-[calc(2rem+env(safe-area-inset-bottom))]"
            >
                {/* Drag handle */}
                <div className="flex justify-center pt-2 pb-3">
                    <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
                </div>

                {/* Header */}
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
                        <SheetTitle className="text-base font-semibold">{blockDef.label}</SheetTitle>
                        <p className="text-xs text-muted-foreground truncate">{blockDef.description}</p>
                    </div>
                </div>

                <div className="space-y-4 overflow-y-auto max-h-[60vh] pb-4">
                    {/* Custom label */}
                    <div>
                        <Label className="text-xs text-muted-foreground mb-1.5 block">
                            {t('detailPanel.customLabel', 'Custom Label')}
                        </Label>
                        <Input
                            value={customLabel}
                            onChange={e => handleCustomLabelChange(e.target.value)}
                            placeholder={blockDef.label}
                            className="h-10"
                        />
                    </div>

                    {/* Config fields */}
                    {configFields.map(field => {
                        const value = node.config?.[field.key] ?? '';

                        return (
                            <div key={field.key}>
                                <Label className="text-xs text-muted-foreground mb-1.5 block">
                                    {field.label || field.key}
                                </Label>

                                {field.type === 'boolean' || field.type === 'checkbox' ? (
                                    <Switch checked={!!value} onCheckedChange={v => handleConfigChange(field.key, v)} />
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
                                        <div key={key} className="rounded-lg bg-muted/30 p-2.5">
                                            <div className="text-xs font-medium text-muted-foreground mb-1">{key}</div>
                                            <div className="text-sm text-foreground break-all line-clamp-3">
                                                {typeof data?.value === 'string'
                                                    ? data.value
                                                    : JSON.stringify(data?.value, null, 2)}
                                            </div>
                                        </div>
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
                                        <div key={key} className="rounded-lg bg-muted/30 p-2.5">
                                            <div className="text-xs font-medium text-muted-foreground mb-1">{key}</div>
                                            <div className="text-sm text-foreground break-all line-clamp-5">
                                                {typeof data?.value === 'string'
                                                    ? data.value
                                                    : JSON.stringify(data?.value, null, 2)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Delete button */}
                    <div className="pt-4 border-t border-border">
                        <Button variant="destructive" className="w-full gap-2" onClick={handleDelete}>
                            <Trash2 className="w-4 h-4" />
                            {t('detailPanel.deleteNode', 'Delete Node')}
                        </Button>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
};
