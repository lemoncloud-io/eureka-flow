import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AlertCircle, ArrowLeft, ArrowRight, Loader2, Play, Plus, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { isAiBlock, isMissingAiKey, useBlockRegistry, useCanvasConnections } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { Input, Label, Switch } from '@flows/ui-kit';
import { useWebCoreStore } from '@flows/web-core';

import { AiKeyWarningBanner } from '../../flows/components/AiKeyWarningBanner';
import { BlockIcon } from '../../flows/components/BlockIcon';
import { getPortStyleKey } from '../../flows/utils';
import { useNodeConfig } from '../hooks/useNodeConfig';
import { deleteNodeWithSync, executeNodeWithToast } from '../utils';
import { ConfigFieldList } from './ConfigFieldList';
import { STEREO_FALLBACK_LABEL, STEREO_I18N_KEY, STEREO_ICON_BG, TYPE_DOT } from './consts';
import { MobileConnectionCard } from './MobileConnectionCard';
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
    onOpenAiKeyDialog?: () => void;
}

export const MobileStepDetail = ({
    nodeId,
    flowId,
    socketConnectionId,
    role = 'owner',
    onClose,
    onOpenOutputConnection,
    onOpenInputConnection,
    onOpenAiKeyDialog,
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
    const hasGeminiKey = useWebCoreStore(s => s.hasGeminiKey);
    const hasOpenaiKey = useWebCoreStore(s => s.hasOpenaiKey);

    const isOpen = nodeId !== null;
    const [confirmingDelete, setConfirmingDelete] = useState(false);

    if (!node || !blockDef) return null;

    const state = (node.state ?? 'IDLE') as NodeState;
    const stereo = blockDef.stereo ?? 'process';
    const isInputImage = blockDef.type === 'input-image';
    const isInputText = blockDef.type === 'input-text';
    const isAuto = !!(node as typeof node & { auto?: boolean }).auto;

    const stereoLabel = t(STEREO_I18N_KEY[stereo] ?? '', STEREO_FALLBACK_LABEL[stereo] ?? stereo);
    const handleDelete = () => {
        if (!canEdit || !nodeId) return;
        if (!confirmingDelete) {
            setConfirmingDelete(true);
            return;
        }
        deleteNodeWithSync(nodeId, flowId);
        onClose();
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
                    {/* ── Header: breadcrumb style ── */}
                    <header
                        className={cn(
                            'flex items-center gap-2 px-2 h-[71px] shrink-0',
                            'border-b border-border/40',
                            'pt-[env(safe-area-inset-top)]'
                        )}
                    >
                        <button
                            onClick={onClose}
                            className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-accent/50 transition-colors shrink-0"
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                        <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-sm font-semibold text-muted-foreground shrink-0">{stereoLabel}</span>
                            <span className="text-sm font-semibold text-foreground truncate">
                                {blockDef.label || node.type}
                            </span>
                        </div>
                    </header>

                    {/* ── Scrollable body ── */}
                    <div className="flex-1 overflow-y-auto overscroll-contain">
                        <div className="px-4 py-4 space-y-5">
                            {/* Node identity: icon + name input */}
                            <div className="flex items-center gap-3">
                                <div
                                    className={cn(
                                        'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                                        STEREO_ICON_BG[stereo] ?? 'bg-muted/50'
                                    )}
                                >
                                    <BlockIcon icon={blockDef.icon} size={18} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <Label className="text-xs text-muted-foreground mb-1 block">
                                        {t('mobile.nodeName', '노드 명')}
                                    </Label>
                                    <Input
                                        value={customLabel}
                                        onChange={e => handleCustomLabelChange(e.target.value)}
                                        placeholder={blockDef.label}
                                        className="h-9 text-sm"
                                        disabled={!canEdit}
                                    />
                                </div>
                            </div>

                            {/* Error message */}
                            {state === 'ERROR' && 'error' in node && typeof node.error === 'string' && node.error && (
                                <div className="flex items-start gap-2 rounded-xl bg-destructive/5 border border-destructive/20 px-3 py-2.5">
                                    <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                                    <p className="text-xs text-destructive break-all">{node.error}</p>
                                </div>
                            )}

                            {/* Auto toggle — separate row */}
                            <div className="flex items-center justify-between">
                                <Label className="text-sm font-medium">{t('mobile.autoExecution', '자동 실행')}</Label>
                                <div className="flex items-center gap-1.5">
                                    <Switch checked={isAuto} onCheckedChange={handleToggleAuto} disabled={!canEdit} />
                                </div>
                            </div>

                            {/* Special UI for input blocks */}
                            {isInputImage && <MobileImageUpload node={node} onConfigChange={handleConfigChange} />}
                            {isInputText && <MobileTextInput node={node} onConfigChange={handleConfigChange} />}

                            {/* AI Key Warning */}
                            {isAiBlock(blockDef.type) &&
                                isMissingAiKey(
                                    node.config?.model as string | undefined,
                                    hasGeminiKey,
                                    hasOpenaiKey
                                ) && <AiKeyWarningBanner onRegisterKey={onOpenAiKeyDialog} />}

                            {/* Config fields */}
                            <div className="space-y-4">
                                <ConfigFieldList
                                    fields={configFields}
                                    config={(node.config ?? {}) as Record<string, unknown>}
                                    onConfigChange={handleConfigChange}
                                    blockType={blockDef.type}
                                />
                            </div>

                            {/* ── Connections ── */}
                            <ConnectionsSection
                                nodeId={nodeId}
                                node={node}
                                blockDef={blockDef}
                                allConnections={allConnections}
                                blockRegistry={blockRegistry}
                                canEdit={canEdit}
                                onOpenOutputConnection={onOpenOutputConnection}
                                onOpenInputConnection={onOpenInputConnection}
                                t={t}
                            />

                            {/* Delete — 2-stage confirm */}
                            {canEdit && (
                                <div className="pt-4 border-t border-border/30">
                                    <button
                                        onClick={handleDelete}
                                        className={cn(
                                            'w-full flex items-center justify-center gap-1.5 py-3 rounded-xl text-xs font-medium transition-all',
                                            confirmingDelete
                                                ? 'bg-destructive text-destructive-foreground'
                                                : 'text-destructive/60 hover:text-destructive'
                                        )}
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        {confirmingDelete
                                            ? t('mobile.confirmDelete', '정말 삭제하시겠습니까?')
                                            : t('detailPanel.deleteNode', 'Delete Node')}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── Bottom Run bar ── */}
                    {canRun && stereo !== 'output' && blockDef.isRunnable !== false && (
                        <div
                            className={cn(
                                'shrink-0 border-t border-border/40',
                                'pb-[env(safe-area-inset-bottom)]',
                                'bg-glass-bg backdrop-blur-2xl'
                            )}
                        >
                            <div className="px-4 py-3">
                                {stereo === 'process' ? (
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleRun({ propagate: false })}
                                            disabled={isRunning}
                                            className={cn(
                                                'flex-1 flex items-center justify-center gap-1.5 h-[51px] rounded-xl',
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
                                            <span>{t('mobile.runThisOnly', '이전만 실행')}</span>
                                        </button>
                                        <button
                                            onClick={() => handleRun({ propagate: true })}
                                            disabled={isRunning}
                                            className={cn(
                                                'flex-1 flex items-center justify-center gap-1.5 h-[51px] rounded-xl',
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
                                            <span>{t('mobile.runAndPropagate', '이후로 실행')}</span>
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => handleRun()}
                                        disabled={isRunning}
                                        className={cn(
                                            'w-full flex items-center justify-center gap-2 h-[51px] rounded-xl',
                                            'text-sm font-semibold transition-all',
                                            'active:scale-[0.98] disabled:opacity-40',
                                            isRunning
                                                ? 'bg-warning/10 text-warning border border-warning/25'
                                                : 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                                        )}
                                    >
                                        {isRunning ? (
                                            <Loader2 className="w-[18px] h-[18px] animate-spin" />
                                        ) : (
                                            <Play className="w-[18px] h-[18px] fill-current" />
                                        )}
                                        <span>
                                            {isRunning
                                                ? t('mobile.running', 'Running...')
                                                : t('mobile.runBlock', '블록 실행')}
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

/** Single port row — shared between input and output ports */
const PortButton = ({
    portKey,
    port,
    direction,
    connectedNames,
    canEdit,
    onConnect,
    t,
}: {
    portKey: string;
    port: { id: string; label?: string; type?: string };
    direction: 'input' | 'output';
    connectedNames: string | null;
    canEdit: boolean;
    onConnect?: () => void;
    t: (key: string, defaultValue?: string) => string;
}) => {
    const styleKey = getPortStyleKey(port.type ?? 'any');
    const isConnected = connectedNames !== null;
    const Icon = direction === 'input' ? ArrowLeft : ArrowRight;
    const arrow = direction === 'input' ? '←' : '→';

    return (
        <button
            key={portKey}
            type="button"
            onClick={canEdit ? onConnect : undefined}
            className={cn(
                'w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs text-left transition-all',
                isConnected ? 'bg-success/5' : 'border border-dashed border-primary/20 bg-primary/[0.02]',
                canEdit &&
                    (isConnected
                        ? 'hover:bg-success/10 active:scale-[0.98]'
                        : 'hover:border-primary/40 active:scale-[0.98]')
            )}
        >
            <Icon className={cn('w-3 h-3 shrink-0', isConnected ? 'text-success/50' : 'text-primary/30')} />
            <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', TYPE_DOT[styleKey])} />
            <span className="font-medium">{port.label || port.id}</span>
            {isConnected ? (
                <span className="text-success/60 truncate flex-1">
                    {arrow} {connectedNames}
                </span>
            ) : canEdit ? (
                <span className="text-primary/40 flex-1 flex items-center gap-1">
                    <Plus className="w-3 h-3" />
                    {t('mobile.connection.addConnection', '추가 연결')}
                    <span className="text-primary/30 ml-1">{t('mobile.connection.tapToConnect', '탭하여 연결')}</span>
                </span>
            ) : null}
        </button>
    );
};

/** Connections section — extracted for readability */
const ConnectionsSection = ({
    nodeId,
    node,
    blockDef,
    allConnections,
    blockRegistry,
    canEdit,
    onOpenOutputConnection,
    onOpenInputConnection,
    t,
}: {
    nodeId: string | null;
    node: { customLabel?: string; type: string };
    blockDef: {
        inputs?: Array<{ id: string; label?: string; type?: string }>;
        outputs?: Array<{ id: string; label?: string; type?: string }>;
        label?: string;
    };
    allConnections: Array<{
        id: string;
        sourceNodeId: string;
        sourcePortId: string;
        targetNodeId: string;
        targetPortId: string;
    }>;
    blockRegistry: Record<string, { label?: string; icon?: string }>;
    canEdit: boolean;
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
    t: (key: string, defaultValue?: string) => string;
}) => {
    if (!blockDef || !nodeId) return null;

    const inputPorts = blockDef.inputs ?? [];
    const outputPorts = blockDef.outputs ?? [];

    if (inputPorts.length === 0 && outputPorts.length === 0) return null;

    // Pre-split connections by direction
    const inConns = allConnections.filter(c => c.targetNodeId === nodeId);
    const outConns = allConnections.filter(c => c.sourceNodeId === nodeId);

    const displayName = node.customLabel || blockDef.label || node.type;

    return (
        <div className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground py-1">
                {t('mobile.connectedBlocks', '연결된 블록')}
            </div>

            {/* Input ports */}
            {inputPorts.length > 0 && (
                <div className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider pt-1">
                    {t('mobile.input', '입력')}
                </div>
            )}
            {inputPorts.map(port => {
                const conn = inConns.find(c => c.targetPortId === port.id);
                if (conn) {
                    return (
                        <MobileConnectionCard
                            key={`in-${port.id}`}
                            nodeId={conn.sourceNodeId}
                            canEdit={canEdit}
                            onDisconnect={() =>
                                onOpenInputConnection?.(
                                    nodeId,
                                    port.id,
                                    port.type ?? 'any',
                                    displayName,
                                    port.label || port.id
                                )
                            }
                            onTap={() =>
                                onOpenInputConnection?.(
                                    nodeId,
                                    port.id,
                                    port.type ?? 'any',
                                    displayName,
                                    port.label || port.id
                                )
                            }
                        />
                    );
                }
                return (
                    <PortButton
                        key={`in-${port.id}`}
                        portKey={`in-${port.id}`}
                        port={port}
                        direction="input"
                        connectedNames={null}
                        canEdit={canEdit}
                        onConnect={() =>
                            onOpenInputConnection?.(
                                nodeId,
                                port.id,
                                port.type ?? 'any',
                                displayName,
                                port.label || port.id
                            )
                        }
                        t={t}
                    />
                );
            })}

            {/* Output ports */}
            {outputPorts.length > 0 && (
                <div className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider pt-2">
                    {t('mobile.output', '출력')}
                </div>
            )}
            {outputPorts.map(port => {
                const conns = outConns.filter(c => c.sourcePortId === port.id);
                if (conns.length > 0) {
                    return conns.map(conn => (
                        <MobileConnectionCard
                            key={`out-${port.id}-${conn.targetNodeId}`}
                            nodeId={conn.targetNodeId}
                            canEdit={canEdit}
                            onDisconnect={() =>
                                onOpenOutputConnection?.(
                                    nodeId,
                                    port.id,
                                    port.type ?? 'any',
                                    displayName,
                                    port.label || port.id
                                )
                            }
                            onTap={() =>
                                onOpenOutputConnection?.(
                                    nodeId,
                                    port.id,
                                    port.type ?? 'any',
                                    displayName,
                                    port.label || port.id
                                )
                            }
                        />
                    ));
                }
                return (
                    <PortButton
                        key={`out-${port.id}`}
                        portKey={`out-${port.id}`}
                        port={port}
                        direction="output"
                        connectedNames={null}
                        canEdit={canEdit}
                        onConnect={() =>
                            onOpenOutputConnection?.(
                                nodeId,
                                port.id,
                                port.type ?? 'any',
                                displayName,
                                port.label || port.id
                            )
                        }
                        t={t}
                    />
                );
            })}
        </div>
    );
};
