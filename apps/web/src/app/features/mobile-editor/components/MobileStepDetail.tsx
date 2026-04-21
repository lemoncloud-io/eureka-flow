import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
    AlertCircle,
    ArrowLeft,
    ArrowRight,
    ChevronDown,
    ChevronRight,
    Loader2,
    Play,
    Trash2,
    Zap,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { useBlockRegistry, useCanvasConnections, useCanvasStore } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { Input, Label, Switch } from '@flows/ui-kit';

import { BlockIcon } from '../../flows/components/BlockIcon';
import { RunHistoryPanel } from '../../flows/components/RunHistoryPanel';
import { getPortStyleKey } from '../../flows/utils';
import { useNodeConfig } from '../hooks/useNodeConfig';
import { deleteNodeWithSync, executeNodeWithToast } from '../utils';
import { ConfigFieldList } from './ConfigFieldList';
import { STATE_STYLES, STEREO_ICON_BG, TYPE_DOT } from './consts';
import { DataPreview } from './DataPreview';
import { MobileImageUpload } from './MobileImageUpload';
import { MobileTextInput } from './MobileTextInput';

import type { FlowRole } from '@flows/flows';
import type { NodeState } from '@lemoncloud/eureka-flows-api';

interface MobileStepDetailProps {
    nodeId: string | null;
    flowId: string | null;
    socketConnectionId?: string;
    role?: FlowRole;
    onClose: () => void;
    onOpenOutputConnection?: (
        nodeId: string,
        portId: string,
        portDataType: string,
        nodeName: string,
        portName: string
    ) => void;
    onOpenInputConnection?: (
        nodeId: string,
        portId: string,
        portDataType: string,
        nodeName: string,
        portName: string
    ) => void;
}

export const MobileStepDetail = ({
    nodeId,
    flowId,
    socketConnectionId,
    role = 'owner',
    onClose,
    onOpenOutputConnection,
    onOpenInputConnection,
}: MobileStepDetailProps) => {
    const { t } = useTranslation(['flows']);
    const {
        node,
        blockDef,
        canEdit,
        canRun,
        customLabel,
        configFields,
        handleConfigChange,
        handleCustomLabelChange,
        handleDescriptionChange,
        handleToggleAuto,
    } = useNodeConfig(nodeId, flowId, role);

    const handleRun = useCallback(
        async (options?: { propagate?: boolean }) => {
            if (!canRun || !nodeId) return;
            await executeNodeWithToast(nodeId, { flowId, socketConnectionId, canEdit, propagate: options?.propagate });
        },
        [canRun, canEdit, nodeId, flowId, socketConnectionId]
    );
    const isRunning = (node?.state as string) === 'RUNNING';

    const allConnections = useCanvasConnections();
    const blockRegistry = useBlockRegistry();

    const [showInputData, setShowInputData] = useState(false);
    const [showOutputData, setShowOutputData] = useState(false);
    const [expandedDataKey, setExpandedDataKey] = useState<string | null>(null);

    const isOpen = nodeId !== null;

    if (!node || !blockDef) return null;

    const state = (node.state ?? 'IDLE') as NodeState;
    const stateStyle = STATE_STYLES[state] ?? STATE_STYLES.IDLE;
    const stereo = blockDef.stereo ?? 'process';
    const isInputImage = blockDef.type === 'input-image';
    const isInputText = blockDef.type === 'input-text';
    const isAuto = !!(node as typeof node & { auto?: boolean }).auto;

    const handleDelete = () => {
        if (!canEdit || !nodeId) return;
        if (window.confirm(t('detailPanel.confirmDelete', 'Delete this node?'))) {
            deleteNodeWithSync(nodeId, flowId);
            onClose();
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className="fixed inset-0 z-40 bg-background flex flex-col"
                    initial={{ x: '100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '100%' }}
                    transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                >
                    {/* ── Header ── */}
                    <header
                        className={cn(
                            'flex items-center gap-2 px-2 h-14 shrink-0',
                            'border-b border-border/40',
                            'pt-[env(safe-area-inset-top)]'
                        )}
                    >
                        <button
                            onClick={onClose}
                            className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-accent/50 transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <span className="text-sm font-semibold text-foreground truncate">
                            {node.customLabel || blockDef.label || node.type}
                        </span>
                    </header>

                    {/* ── Scrollable body ── */}
                    <div className="flex-1 overflow-y-auto overscroll-contain">
                        <div className="px-4 py-4 space-y-5">
                            {/* Block info header */}
                            <div className="flex items-center gap-3">
                                <div
                                    className={cn(
                                        'w-12 h-12 rounded-xl flex items-center justify-center shrink-0',
                                        STEREO_ICON_BG[stereo] ?? 'bg-muted/50'
                                    )}
                                >
                                    <BlockIcon icon={blockDef.icon} size={22} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-base font-semibold truncate">{blockDef.label}</span>
                                        {state !== 'IDLE' && (
                                            <span
                                                className={cn(
                                                    'flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0',
                                                    stateStyle.bg,
                                                    stateStyle.text
                                                )}
                                            >
                                                {stateStyle.icon}
                                                <span>
                                                    {t(
                                                        `mobile.state.${stateStyle.label.toLowerCase()}`,
                                                        stateStyle.label
                                                    )}
                                                </span>
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className="text-[10px] font-mono text-muted-foreground/50">
                                            {blockDef.type}
                                        </span>
                                        {blockDef.isFrontend && (
                                            <span className="text-[9px] px-1 py-0.5 rounded bg-primary/10 text-primary font-medium">
                                                {t('sidebar.frontend')}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Error message */}
                            {state === 'ERROR' && 'error' in node && typeof node.error === 'string' && node.error && (
                                <div className="flex items-start gap-2 rounded-xl bg-destructive/5 border border-destructive/20 px-3 py-2.5">
                                    <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                                    <p className="text-xs text-destructive break-all">{node.error}</p>
                                </div>
                            )}

                            {/* Label + Auto toggle */}
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

                            {/* Special UI for input blocks */}
                            {isInputImage && <MobileImageUpload node={node} onConfigChange={handleConfigChange} />}
                            {isInputText && <MobileTextInput node={node} onConfigChange={handleConfigChange} />}

                            {/* Config fields */}
                            <div className="space-y-4">
                                <ConfigFieldList
                                    fields={configFields}
                                    config={(node.config ?? {}) as Record<string, unknown>}
                                    onConfigChange={handleConfigChange}
                                    blockType={blockDef.type}
                                />
                            </div>

                            {/* Description */}
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

                            {/* ── Connections / Ports ── */}
                            {blockDef &&
                                nodeId &&
                                (() => {
                                    const inputPorts = blockDef.inputs ?? [];
                                    const outputPorts = blockDef.outputs ?? [];
                                    const nodeConns = allConnections.filter(
                                        c => c.sourceNodeId === nodeId || c.targetNodeId === nodeId
                                    );
                                    if (inputPorts.length === 0 && outputPorts.length === 0) return null;

                                    const displayName = node.customLabel || blockDef.label || node.type;

                                    return (
                                        <div className="space-y-2">
                                            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider py-1">
                                                {t('mobile.connections', 'Connections')}
                                            </div>

                                            {/* Input ports — tappable to connect sources */}
                                            {inputPorts.length > 0 && (
                                                <div className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider pt-1">
                                                    {t('mobile.inputs', 'Inputs')}
                                                </div>
                                            )}
                                            {inputPorts.map(port => {
                                                const conn = nodeConns.find(
                                                    c => c.targetNodeId === nodeId && c.targetPortId === port.id
                                                );
                                                const styleKey = getPortStyleKey(port.type ?? 'any');
                                                const isConnected = !!conn;

                                                if (isConnected) {
                                                    const sourceNode = useCanvasStore
                                                        .getState()
                                                        .nodes.find(n => n.id === conn.sourceNodeId);
                                                    const sourceDef = sourceNode
                                                        ? blockRegistry[sourceNode.type]
                                                        : undefined;
                                                    const sourceName =
                                                        sourceNode?.customLabel ||
                                                        sourceDef?.label ||
                                                        conn.sourceNodeId;
                                                    return (
                                                        <button
                                                            key={`in-${port.id}`}
                                                            type="button"
                                                            onClick={
                                                                canEdit
                                                                    ? () =>
                                                                          onOpenInputConnection?.(
                                                                              nodeId,
                                                                              port.id,
                                                                              port.type ?? 'any',
                                                                              displayName,
                                                                              port.label || port.id
                                                                          )
                                                                    : undefined
                                                            }
                                                            className={cn(
                                                                'w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-success/5 text-xs text-left transition-all',
                                                                canEdit && 'hover:bg-success/10 active:scale-[0.98]'
                                                            )}
                                                        >
                                                            <ArrowLeft className="w-3 h-3 text-success/50 shrink-0" />
                                                            <span
                                                                className={cn(
                                                                    'w-1.5 h-1.5 rounded-full shrink-0',
                                                                    TYPE_DOT[styleKey]
                                                                )}
                                                            />
                                                            <span className="font-medium">{port.label || port.id}</span>
                                                            <span className="text-success/60 truncate flex-1">
                                                                ← {sourceName}
                                                            </span>
                                                        </button>
                                                    );
                                                }

                                                return (
                                                    <button
                                                        key={`in-${port.id}`}
                                                        type="button"
                                                        onClick={
                                                            canEdit
                                                                ? () =>
                                                                      onOpenInputConnection?.(
                                                                          nodeId,
                                                                          port.id,
                                                                          port.type ?? 'any',
                                                                          displayName,
                                                                          port.label || port.id
                                                                      )
                                                                : undefined
                                                        }
                                                        className={cn(
                                                            'w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs text-left',
                                                            'border border-dashed border-primary/20 bg-primary/[0.02]',
                                                            'transition-all',
                                                            canEdit && 'hover:border-primary/40 active:scale-[0.98]'
                                                        )}
                                                    >
                                                        <ArrowLeft className="w-3 h-3 text-primary/30 shrink-0" />
                                                        <span
                                                            className={cn(
                                                                'w-1.5 h-1.5 rounded-full shrink-0',
                                                                TYPE_DOT[styleKey]
                                                            )}
                                                        />
                                                        <span className="font-medium">{port.label || port.id}</span>
                                                        {canEdit && (
                                                            <span className="text-primary/40 flex-1 italic">
                                                                {t('mobile.connection.tapToConnect', 'tap to connect')}
                                                            </span>
                                                        )}
                                                    </button>
                                                );
                                            })}

                                            {/* Output ports — tappable to open connection sheet */}
                                            {outputPorts.length > 0 && (
                                                <div className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider pt-2">
                                                    {t('mobile.outputs', 'Outputs')}
                                                </div>
                                            )}
                                            {outputPorts.map(port => {
                                                const conns = nodeConns.filter(
                                                    c => c.sourceNodeId === nodeId && c.sourcePortId === port.id
                                                );
                                                const styleKey = getPortStyleKey(port.type ?? 'any');
                                                const isConnected = conns.length > 0;

                                                return (
                                                    <button
                                                        key={`out-${port.id}`}
                                                        type="button"
                                                        onClick={
                                                            canEdit
                                                                ? () =>
                                                                      onOpenOutputConnection?.(
                                                                          nodeId,
                                                                          port.id,
                                                                          port.type ?? 'any',
                                                                          displayName,
                                                                          port.label || port.id
                                                                      )
                                                                : undefined
                                                        }
                                                        className={cn(
                                                            'w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs text-left',
                                                            'transition-all',
                                                            canEdit && 'active:scale-[0.98]',
                                                            isConnected
                                                                ? 'bg-success/5'
                                                                : 'border border-dashed border-primary/20 bg-primary/[0.02]',
                                                            canEdit &&
                                                                (isConnected
                                                                    ? 'hover:bg-success/10'
                                                                    : 'hover:border-primary/40')
                                                        )}
                                                    >
                                                        <ArrowRight
                                                            className={cn(
                                                                'w-3 h-3 shrink-0',
                                                                isConnected ? 'text-success/50' : 'text-primary/30'
                                                            )}
                                                        />
                                                        <span
                                                            className={cn(
                                                                'w-1.5 h-1.5 rounded-full shrink-0',
                                                                TYPE_DOT[styleKey]
                                                            )}
                                                        />
                                                        <span className="font-medium">{port.label || port.id}</span>
                                                        {isConnected ? (
                                                            <span className="text-success/60 truncate flex-1">
                                                                →{' '}
                                                                {conns
                                                                    .map(c => {
                                                                        const targetNode = useCanvasStore
                                                                            .getState()
                                                                            .nodes.find(n => n.id === c.targetNodeId);
                                                                        const targetDef = targetNode
                                                                            ? blockRegistry[targetNode.type]
                                                                            : undefined;
                                                                        return (
                                                                            targetNode?.customLabel ||
                                                                            targetDef?.label ||
                                                                            c.targetNodeId
                                                                        );
                                                                    })
                                                                    .join(', ')}
                                                            </span>
                                                        ) : canEdit ? (
                                                            <span className="text-primary/40 flex-1 italic">
                                                                {t('mobile.connection.tapToConnect', 'tap to connect')}
                                                            </span>
                                                        ) : null}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    );
                                })()}

                            {/* Input Data */}
                            {node.inputData && Object.keys(node.inputData).length > 0 && (
                                <CollapsibleDataSection
                                    title={t('mobile.inputs')}
                                    isOpen={showInputData}
                                    onToggle={() => setShowInputData(!showInputData)}
                                >
                                    <div className="space-y-2 pl-2">
                                        {Object.entries(node.inputData).map(([key, data]) => (
                                            <button
                                                key={key}
                                                onClick={() =>
                                                    setExpandedDataKey(
                                                        expandedDataKey === `in-${key}` ? null : `in-${key}`
                                                    )
                                                }
                                                className="w-full text-left rounded-lg bg-muted/30 p-2.5"
                                            >
                                                <div className="text-xs font-medium text-muted-foreground mb-1">
                                                    {key}
                                                </div>
                                                <DataPreview data={data} expanded={expandedDataKey === `in-${key}`} />
                                            </button>
                                        ))}
                                    </div>
                                </CollapsibleDataSection>
                            )}

                            {/* Output Data */}
                            {node.outputData && Object.keys(node.outputData).length > 0 && (
                                <CollapsibleDataSection
                                    title={t('mobile.outputs')}
                                    isOpen={showOutputData}
                                    onToggle={() => setShowOutputData(!showOutputData)}
                                >
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
                                                <div className="text-xs font-medium text-muted-foreground mb-1">
                                                    {key}
                                                </div>
                                                <DataPreview data={data} expanded={expandedDataKey === `out-${key}`} />
                                            </button>
                                        ))}
                                    </div>
                                </CollapsibleDataSection>
                            )}

                            {/* Run History */}
                            {node && <RunHistoryPanel nodeId={node.id} maxHeight="240px" />}

                            {/* Delete */}
                            {canEdit && (
                                <div className="pt-4 border-t border-border/30 flex justify-center">
                                    <button
                                        onClick={handleDelete}
                                        className="flex items-center gap-1.5 px-3 py-2 text-xs text-destructive/60 hover:text-destructive transition-colors"
                                    >
                                        <Trash2 className="w-3 h-3" />
                                        {t('detailPanel.deleteNode', 'Delete Node')}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── Bottom Run bar — output nodes are view-only, no execution ── */}
                    {canRun && stereo !== 'output' && blockDef.isRunnable !== false && (
                        <div
                            className={cn(
                                'shrink-0 border-t border-border/40',
                                'pb-[env(safe-area-inset-bottom)]',
                                'bg-background/95 backdrop-blur-md'
                            )}
                        >
                            <div className="px-4 py-2.5">
                                {stereo === 'process' ? (
                                    /* Process nodes: two buttons — Run This Only + Run & Propagate */
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleRun({ propagate: false })}
                                            disabled={isRunning}
                                            className={cn(
                                                'flex-1 flex items-center justify-center gap-1.5 h-11 rounded-xl',
                                                'text-xs font-semibold transition-all',
                                                'active:scale-[0.98] disabled:opacity-40',
                                                isRunning
                                                    ? 'bg-muted/30 text-muted-foreground border border-muted'
                                                    : 'bg-primary/10 text-primary border border-primary/20 hover:bg-primary/15'
                                            )}
                                        >
                                            {isRunning ? (
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            ) : (
                                                <Play className="w-3.5 h-3.5 fill-current" />
                                            )}
                                            <span>
                                                {t('actions.runThisOnly', {
                                                    ns: 'nodes',
                                                    defaultValue: 'Run This Only',
                                                })}
                                            </span>
                                        </button>
                                        <button
                                            onClick={() => handleRun({ propagate: true })}
                                            disabled={isRunning}
                                            className={cn(
                                                'flex-1 flex items-center justify-center gap-1.5 h-11 rounded-xl',
                                                'text-xs font-semibold transition-all',
                                                'active:scale-[0.98] disabled:opacity-40',
                                                isRunning
                                                    ? 'bg-muted/30 text-muted-foreground border border-muted'
                                                    : 'bg-success/10 text-success border border-success/20 hover:bg-success/15'
                                            )}
                                        >
                                            {isRunning ? (
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            ) : (
                                                <Play className="w-3.5 h-3.5 fill-current" />
                                            )}
                                            <span>
                                                {t('actions.runAndPropagate', {
                                                    ns: 'nodes',
                                                    defaultValue: 'Run & Propagate',
                                                })}
                                            </span>
                                        </button>
                                    </div>
                                ) : (
                                    /* Input nodes: single Run button */
                                    <button
                                        onClick={() => handleRun()}
                                        disabled={isRunning}
                                        className={cn(
                                            'w-full flex items-center justify-center gap-2 h-11 rounded-xl',
                                            'text-sm font-semibold transition-all',
                                            'active:scale-[0.98] disabled:opacity-40',
                                            isRunning
                                                ? 'bg-warning/10 text-warning border border-warning/25'
                                                : 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                                        )}
                                    >
                                        {isRunning ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Play className="w-4 h-4 fill-current" />
                                        )}
                                        <span>
                                            {isRunning ? t('mobile.running', 'Running...') : t('mobile.runStep', 'Run')}
                                        </span>
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    );
};

/** Collapsible section for Input/Output data */
const CollapsibleDataSection = ({
    title,
    isOpen,
    onToggle,
    children,
}: {
    title: string;
    isOpen: boolean;
    onToggle: () => void;
    children: React.ReactNode;
}) => (
    <div>
        <button
            onClick={onToggle}
            className="flex items-center gap-2 w-full py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider"
        >
            {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            {title}
        </button>
        {isOpen && children}
    </div>
);
