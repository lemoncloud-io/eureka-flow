import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChevronDown, ChevronUp, Copy, Loader2, Pencil, RefreshCw, X } from 'lucide-react';

import {
    NODE_CONTENT_OVERHEAD,
    NODE_WIDTH_BOUNDS,
    PORT_LAYOUT,
    averageProgress,
    clampNodeHeight,
    clampWidth,
    getBlockDefinition,
    getEffectiveState,
    getNodeProductId,
    getNodeWidth,
    isAiBlock,
    isMissingAiKey,
    translateField,
    useBlockRegistry,
    useCanvasStore,
    useNodeTraceLogs,
    useProductProgressStore,
} from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { useWebCoreStore } from '@flows/web-core';

import { AiKeyWarningBanner } from './AiKeyWarningBanner';
import { BlockIcon } from './BlockIcon';
import { PortItem } from './PortItem';
import { ProcessRunButtons, StatusIcon } from './ProcessRunButtons';
import {
    AgentTraceVisualization,
    InputImageVisualizationEditable,
    InputTextVisualizationEditable,
    OutputPreview,
    VISUALIZATION_COMPONENTS,
} from './visualizations';
import { getVisiblePorts } from '../utils';

import type { ConnectionDraftInfo } from '../utils';
import type { ConfigValue } from './visualizations';
import type { NodeData, NodeState } from '@flows/flows';

export interface NodePortHandlers {
    onPortMouseDown: (
        nodeId: string,
        portId: string,
        type: 'input' | 'output',
        portType: string,
        e: React.MouseEvent
    ) => void;
    onPortMouseUp: (nodeId: string, portId: string, type: 'input' | 'output', portType: string) => void;
    onPortTouchStart?: (
        nodeId: string,
        portId: string,
        type: 'input' | 'output',
        portType: string,
        e: React.TouchEvent
    ) => void;
    onPortDoubleClick?: (nodeId: string, portId: string, type: 'input' | 'output', portType: string) => void;
}

export interface NodeConfigHandlers {
    onConfigChange: (key: string, value: ConfigValue) => void;
    onLabelChange: (label: string) => void;
    onToggleAuto: () => void;
}

export interface NodeActions {
    onDelete: () => void;
    onTrigger: (options?: { propagate?: boolean }) => Promise<void> | void;
    onDuplicate?: () => void;
    onOpenAiKeyDialog?: () => void;

    onResize?: (width: number, height: number) => void;
    /** Called during resize for real-time edge updates */
    onResizing?: (width: number | null) => void;
}

export interface NodeHighlightState {
    isSelected: boolean;
    isHighlighted?: boolean;
    /** Port IDs that were just updated via WebSocket */
    updatedPortIds?: string[];
    highlightedPortIds?: string[];
    /** Port IDs that have connections */
    connectedPortIds?: string[];
    /** Active connection being dragged - used for port compatibility feedback */
    connectionDraft?: ConnectionDraftInfo | null;
}

const getStatusStyles = (state: NodeState | undefined, isSelected: boolean, isFrontend = false): string => {
    // Frontend (input) nodes get green glow when running
    if (isFrontend && state === 'RUNNING') {
        return isSelected
            ? 'border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.35)]'
            : 'border-green-500/60 shadow-[0_0_14px_rgba(34,197,94,0.25)]';
    }

    // Selected: show colored border with glow effect
    if (isSelected) {
        switch (state) {
            case 'RUNNING':
                return 'border-status-running shadow-[0_0_20px_rgba(234,179,8,0.3)]';
            case 'COMPLETED':
                return 'border-status-completed shadow-[0_0_20px_rgba(34,197,94,0.25)]';
            case 'ERROR':
                return 'border-status-error shadow-[0_0_20px_rgba(239,68,68,0.3)] animate-pulse-error';
            case 'IDLE':
            case 'READY':
            default:
                return 'border-primary shadow-[0_0_20px_rgba(143,25,246,0.25)]';
        }
    }

    // Frontend idle nodes get tinted border
    if (isFrontend && (state === 'IDLE' || state === 'READY' || !state)) {
        return 'border-primary/50';
    }

    // Not selected: state-based styling
    switch (state) {
        case 'RUNNING':
            return 'border-status-running/50 shadow-[0_0_12px_rgba(234,179,8,0.2)]';
        case 'COMPLETED':
            return 'border-status-completed/30';
        case 'ERROR':
            return 'border-destructive/50 animate-pulse-error';
        case 'IDLE':
        case 'READY':
        default:
            return 'border-muted-foreground/20';
    }
};

/** Duration badge auto-hide timing (ms) */
const DURATION_BADGE_VISIBLE_MS = 1000;
const DURATION_BADGE_FADE_MS = 500;

interface NodeBlockProps {
    node: NodeData;
    highlightState: NodeHighlightState;
    portHandlers: NodePortHandlers;
    configHandlers: NodeConfigHandlers;
    actions: NodeActions;
    onMouseDown: (e: React.MouseEvent) => void;
    onTouchStart?: (e: React.TouchEvent) => void;
    isDragging?: boolean;
    isCollapsed?: boolean;
    onToggleCollapsed?: () => void;
}

const arraysEqual = (a: string[] | undefined, b: string[] | undefined): boolean => {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    return a.every((v, i) => v === b[i]);
};

/**
 * Only compares data-driven props. All handler/callback props (portHandlers, configHandlers,
 * actions, onMouseDown, onTouchStart, onToggleCollapsed) are created inline in the parent's
 * nodes.map() loop — comparing them by reference would defeat memo entirely. They capture
 * node.id (stable) and parent useCallback refs, so they're semantically equivalent when
 * node data hasn't changed.
 */
const areNodeBlockPropsEqual = (prev: NodeBlockProps, next: NodeBlockProps): boolean => {
    if (prev.node !== next.node) return false;
    if (prev.isDragging !== next.isDragging) return false;
    if (prev.isCollapsed !== next.isCollapsed) return false;

    const ph = prev.highlightState;
    const nh = next.highlightState;
    if (ph.isSelected !== nh.isSelected) return false;
    if (ph.isHighlighted !== nh.isHighlighted) return false;
    if (!arraysEqual(ph.updatedPortIds, nh.updatedPortIds)) return false;
    if (!arraysEqual(ph.highlightedPortIds, nh.highlightedPortIds)) return false;
    if (!arraysEqual(ph.connectedPortIds, nh.connectedPortIds)) return false;
    if (ph.connectionDraft !== nh.connectionDraft) {
        if (!ph.connectionDraft || !nh.connectionDraft) return false;
        if (
            ph.connectionDraft.sourceNodeId !== nh.connectionDraft.sourceNodeId ||
            ph.connectionDraft.sourcePortId !== nh.connectionDraft.sourcePortId ||
            ph.connectionDraft.sourceType !== nh.connectionDraft.sourceType
        ) {
            return false;
        }
    }

    return true;
};

export const NodeBlock = memo<NodeBlockProps>(
    ({
        node,
        highlightState,
        portHandlers,
        configHandlers,
        actions,
        onMouseDown,
        onTouchStart,
        isDragging = false,
        isCollapsed = false,
        onToggleCollapsed,
    }) => {
        const { t } = useTranslation(['nodes', 'flows', 'blocks']);
        const blockRegistry = useBlockRegistry();
        const tutorialHint = useCanvasStore(s => s.tutorialHint);
        const productId = getNodeProductId(node);
        const productProgress = useProductProgressStore(state => (productId ? state.entries[productId] : undefined));

        // Try direct lookup first, then fallback to config-based matching
        const definition = getBlockDefinition(node, blockRegistry);

        const {
            isSelected,
            isHighlighted,
            updatedPortIds = [],
            highlightedPortIds = [],
            connectedPortIds = [],
            connectionDraft,
        } = highlightState;
        const { onPortMouseDown, onPortMouseUp, onPortTouchStart, onPortDoubleClick } = portHandlers;
        const { onConfigChange, onLabelChange } = configHandlers;
        const { onDelete, onTrigger, onDuplicate, onOpenAiKeyDialog, onResize, onResizing } = actions;

        // AI key availability check for AI blocks
        const hasGeminiKey = useWebCoreStore(s => s.hasGeminiKey);
        const hasOpenaiKey = useWebCoreStore(s => s.hasOpenaiKey);
        const needsAiKey = useMemo(
            () =>
                !!definition &&
                isAiBlock(definition.type) &&
                isMissingAiKey(node.config?.model as string | undefined, hasGeminiKey, hasOpenaiKey),
            [definition, node.config?.model, hasGeminiKey, hasOpenaiKey]
        );

        // Memoize visible ports to avoid recalculating on every render
        const visibleInputPorts = useMemo(
            () => getVisiblePorts(definition?.inputs ?? [], connectedPortIds, connectionDraft, node.id, 'input'),
            [definition?.inputs, connectedPortIds, connectionDraft, node.id]
        );
        const visibleOutputPorts = useMemo(
            () => getVisiblePorts(definition?.outputs ?? [], connectedPortIds, connectionDraft, node.id, 'output'),
            [definition?.outputs, connectedPortIds, connectionDraft, node.id]
        );

        const isAuto = node.autoExecutionEnabled !== false;

        // Subscribe to trace logs for this node (agent blocks)
        const traceLogs = useNodeTraceLogs(node.id);

        // Get effective state (state preferred, status fallback for backward compatibility)
        const nodeState = getEffectiveState(node.state, node.status);

        // Track API call in progress (separate from node.state which reflects server state)
        const [isRunning, setIsRunning] = useState(false);

        // Reset isRunning when node state changes to completed/error (socket may update before API returns)
        useEffect(() => {
            if (nodeState === 'COMPLETED' || nodeState === 'ERROR') {
                setIsRunning(false);
            }
        }, [nodeState]);

        const handleRun = async (options?: { propagate?: boolean }) => {
            if (isRunning) return;
            setIsRunning(true);
            try {
                await onTrigger(options);
            } finally {
                setIsRunning(false);
            }
        };

        const isProcessNode = definition?.stereo === 'process';
        const iconBtnBase =
            'text-muted-foreground/60 w-6 h-6 flex items-center justify-center rounded-md transition-all';

        const [showMenu, setShowMenu] = useState(false);
        const [isEditingLabel, setIsEditingLabel] = useState(false);
        const [tempLabel, setTempLabel] = useState(node.customLabel || '');
        const labelInputRef = useRef<HTMLInputElement>(null);

        useEffect(() => {
            setTempLabel(node.customLabel || '');
        }, [node.customLabel]);

        useEffect(() => {
            if (isEditingLabel) {
                labelInputRef.current?.focus();
                labelInputRef.current?.select();
            }
        }, [isEditingLabel]);

        const [elapsedTime, setElapsedTime] = useState<number | null>(null);

        useEffect(() => {
            let interval: number;
            const startTime = node.executionStats?.startTime;
            if (nodeState === 'RUNNING' && startTime) {
                interval = window.setInterval(() => {
                    setElapsedTime(Date.now() - startTime);
                }, 100);
            } else {
                setElapsedTime(null);
            }
            return () => clearInterval(interval);
        }, [nodeState, node.executionStats?.startTime]);

        const duration = nodeState === 'RUNNING' ? elapsedTime : node.executionStats?.duration;
        const displayDuration =
            duration != null ? (duration > 1000 ? `${(duration / 1000).toFixed(2)}s` : `${duration}ms`) : null;

        // Auto-hide duration badge: visible during RUNNING, fade-out after COMPLETED/ERROR
        const [durationBadgePhase, setDurationBadgePhase] = useState<'hidden' | 'visible' | 'fading'>('hidden');

        useEffect(() => {
            if (nodeState === 'RUNNING') {
                setDurationBadgePhase('visible');
                return;
            }

            if (nodeState === 'COMPLETED' || nodeState === 'ERROR') {
                setDurationBadgePhase('visible');
                const fadeTimer = window.setTimeout(() => setDurationBadgePhase('fading'), DURATION_BADGE_VISIBLE_MS);
                const hideTimer = window.setTimeout(
                    () => setDurationBadgePhase('hidden'),
                    DURATION_BADGE_VISIBLE_MS + DURATION_BADGE_FADE_MS
                );
                return () => {
                    clearTimeout(fadeTimer);
                    clearTimeout(hideTimer);
                };
            }

            setDurationBadgePhase('hidden');
        }, [nodeState]);

        // Resize state
        const [isResizing, setIsResizing] = useState(false);
        const [localWidth, setLocalWidth] = useState<number | undefined>(undefined);
        const [localHeight, setLocalHeight] = useState<number | undefined>(undefined);
        const resizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
        const nodeRef = useRef<HTMLDivElement>(null);
        const resizeCleanupRef = useRef<(() => void) | null>(null);

        // Cleanup resize event listeners on unmount
        useEffect(() => {
            return () => {
                resizeCleanupRef.current?.();
            };
        }, []);

        // Get current dimensions (local during resize, otherwise from node)
        const currentWidth = localWidth ?? getNodeWidth(node);
        const currentHeight = localHeight ?? node.height;

        // Calculate content area height (total height minus header and padding overhead)
        const contentAreaHeight = currentHeight ? Math.max(0, currentHeight - NODE_CONTENT_OVERHEAD) : undefined;

        // Handle node resize via corner drag
        const handleResizeStart = (e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const startX = e.clientX;
            const startY = e.clientY;
            const startWidth = currentWidth;
            // Use actual rendered height if no saved height exists
            const actualHeight = nodeRef.current?.getBoundingClientRect().height ?? 120;
            const startHeight = currentHeight ?? actualHeight;
            resizeRef.current = { width: startWidth, height: startHeight };
            setIsResizing(true);
            onResizing?.(startWidth);

            const handleMouseMove = (moveEvent: MouseEvent) => {
                const deltaX = moveEvent.clientX - startX;
                const deltaY = moveEvent.clientY - startY;
                const newWidth = clampWidth(startWidth + deltaX);
                const newHeight = clampNodeHeight(startHeight + deltaY);
                resizeRef.current = { width: newWidth, height: newHeight };
                setLocalWidth(newWidth);
                setLocalHeight(newHeight);
                onResizing?.(newWidth);
            };

            const handleMouseUp = () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
                resizeCleanupRef.current = null;
                setIsResizing(false);
                onResizing?.(null); // Clear resizing state
                // Save resize to node data
                if (onResize) {
                    const finalWidth = resizeRef.current.width;
                    const finalHeight = resizeRef.current.height;
                    if (finalWidth !== getNodeWidth(node) || finalHeight !== node.height) {
                        onResize(finalWidth, finalHeight);
                    }
                }
                // Clear local state after save
                setLocalWidth(undefined);
                setLocalHeight(undefined);
            };

            // Store cleanup function for unmount safety
            resizeCleanupRef.current = () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        };

        if (!definition) return null;

        const commitLabel = () => {
            onLabelChange(tempLabel);
            setIsEditingLabel(false);
        };

        const handleLabelKeyDown = (e: React.KeyboardEvent) => {
            if (e.key === 'Enter') commitLabel();
            if (e.key === 'Escape') {
                setTempLabel(node.customLabel || '');
                setIsEditingLabel(false);
            }
            e.stopPropagation();
        };

        return (
            <div
                ref={nodeRef}
                className={cn(
                    'absolute bg-node-bg rounded-xl border-[1.5px]',
                    !isDragging && !isResizing && 'transition-all duration-200',
                    !isAuto && 'opacity-50',
                    !isSelected && !isHighlighted && nodeState === 'IDLE' && 'shadow-node',
                    // Normal highlight/selection states
                    isHighlighted ? 'border-accent/60' : getStatusStyles(nodeState, isSelected, definition.isFrontend)
                )}
                style={{
                    left: node.position.x,
                    top: node.position.y,
                    width: `${currentWidth}px`,
                    zIndex: isSelected ? 10 : 0,
                }}
                onMouseDown={onMouseDown}
                onTouchStart={onTouchStart}
                onDoubleClick={e => {
                    e.stopPropagation();
                    onToggleCollapsed?.();
                }}
            >
                {/* Header */}
                <div
                    className={cn(
                        'pl-4 pr-2 py-2 flex justify-between items-center cursor-move',
                        'border-b border-node-border/30',
                        definition.isFrontend ? 'bg-primary/5 dark:bg-primary/15' : 'bg-node-header/50',
                        'transition-colors duration-200'
                    )}
                >
                    {isEditingLabel ? (
                        <div
                            className="flex-1 mr-2"
                            onMouseDown={e => e.stopPropagation()}
                            onDoubleClick={e => e.stopPropagation()}
                        >
                            <input
                                ref={labelInputRef}
                                type="text"
                                value={tempLabel}
                                onChange={e => setTempLabel(e.target.value)}
                                onBlur={commitLabel}
                                onKeyDown={handleLabelKeyDown}
                                className="w-full bg-background/90 text-foreground text-xs px-2 py-1 rounded border border-primary/50 outline-none focus:border-primary"
                                placeholder={t('flows:detailPanel.labelPlaceholder')}
                            />
                        </div>
                    ) : (
                        <div
                            className="flex items-center gap-2 overflow-hidden flex-1 min-w-0"
                            onDoubleClick={e => {
                                e.stopPropagation();
                                setIsEditingLabel(true);
                            }}
                            title={t('config.doubleClickRename')}
                        >
                            <button
                                className="w-4 h-4 flex items-center justify-center shrink-0 cursor-pointer hover:opacity-70 transition-opacity"
                                onClick={e => {
                                    e.stopPropagation();
                                    setShowMenu(prev => !prev);
                                }}
                                onMouseDown={e => e.stopPropagation()}
                                onTouchStart={e => e.stopPropagation()}
                                title={t('contextMenu.options', 'Options')}
                            >
                                {nodeState === 'RUNNING' || nodeState === 'ERROR' ? (
                                    <StatusIcon state={nodeState} />
                                ) : (
                                    <BlockIcon
                                        icon={definition?.icon}
                                        size={16}
                                        fallback={<StatusIcon state={nodeState} />}
                                    />
                                )}
                            </button>
                            <div className="flex flex-col overflow-hidden min-w-0">
                                <div className="flex items-center gap-1.5">
                                    <span className="font-semibold text-[13px] text-foreground truncate leading-tight">
                                        {node.customLabel || translateField(t, definition, 'label')}
                                    </span>
                                </div>
                                {node.customLabel && (
                                    <span className="text-[9px] text-muted-foreground/70 truncate font-mono leading-tight">
                                        {translateField(t, definition, 'label')}
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Compact Actions */}
                    <div className="flex items-center gap-0.5 shrink-0">
                        {productProgress && !productProgress.isTerminal && (
                            <span
                                className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-primary"
                                title={`${productProgress.state} • ${productProgress.productId}`}
                            >
                                {averageProgress(productProgress.progress$)}%
                            </span>
                        )}
                        {/* Run buttons: input=single, process=split button, output=none */}
                        {definition?.stereo !== 'output' &&
                            definition?.isRunnable !== false &&
                            (definition?.execute || !definition?.isFrontend) &&
                            (isProcessNode ? (
                                <ProcessRunButtons isRunning={isRunning} onRun={handleRun} t={t} variant="compact" />
                            ) : definition?.stereo === 'input' ? (
                                <button
                                    onClick={e => {
                                        e.stopPropagation();
                                        handleRun();
                                    }}
                                    onMouseDown={e => e.stopPropagation()}
                                    disabled={isRunning}
                                    className={cn(
                                        'w-7 h-7 rounded-md border border-border/60 flex items-center justify-center transition-all',
                                        isRunning
                                            ? 'bg-muted/30 text-muted-foreground cursor-not-allowed'
                                            : 'bg-transparent hover:bg-muted/30 text-primary',
                                        tutorialHint === 'run-button' && !isRunning && 'tutorial-run-bounce'
                                    )}
                                    title={t('actions.run')}
                                >
                                    {isRunning ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                        <img src="/play.svg" alt="" className="w-3.5 h-3.5" />
                                    )}
                                </button>
                            ) : null)}
                        {showMenu && (
                            <>
                                <div
                                    className="fixed inset-0 z-40"
                                    onClick={e => {
                                        e.stopPropagation();
                                        setShowMenu(false);
                                    }}
                                    onWheel={e => e.stopPropagation()}
                                />
                                <div
                                    className="absolute left-3 top-8 w-36 bg-popover/95 backdrop-blur-md border border-border rounded-lg shadow-xl z-50 flex flex-col py-1 animate-in fade-in zoom-in-95 duration-100"
                                    onWheel={e => e.stopPropagation()}
                                >
                                    <button
                                        onClick={e => {
                                            e.stopPropagation();
                                            setShowMenu(false);
                                            setIsEditingLabel(true);
                                        }}
                                        className="text-left px-3 py-1.5 text-xs text-foreground hover:bg-accent/50 flex items-center gap-2 transition-colors"
                                    >
                                        <Pencil className="w-3 h-3" /> {t('contextMenu.rename')}
                                    </button>
                                    {onDuplicate && (
                                        <button
                                            onClick={e => {
                                                e.stopPropagation();
                                                setShowMenu(false);
                                                onDuplicate();
                                            }}
                                            className="text-left px-3 py-1.5 text-xs text-foreground hover:bg-accent/50 flex items-center gap-2 transition-colors"
                                        >
                                            <Copy className="w-3 h-3" /> {t('contextMenu.duplicate')}
                                        </button>
                                    )}
                                    {nodeState === 'ERROR' && (
                                        <button
                                            onClick={e => {
                                                e.stopPropagation();
                                                setShowMenu(false);
                                                onTrigger();
                                            }}
                                            className="text-left px-3 py-1.5 text-xs text-foreground hover:bg-accent/50 flex items-center gap-2 transition-colors"
                                        >
                                            <RefreshCw className="w-3 h-3" /> {t('contextMenu.retry')}
                                        </button>
                                    )}
                                    {onToggleCollapsed && (
                                        <button
                                            onClick={e => {
                                                e.stopPropagation();
                                                setShowMenu(false);
                                                onToggleCollapsed();
                                            }}
                                            className="text-left px-3 py-1.5 text-xs text-foreground hover:bg-accent/50 flex items-center gap-2 transition-colors"
                                        >
                                            {isCollapsed ? (
                                                <>
                                                    <ChevronDown className="w-3 h-3" /> {t('contextMenu.expand')}
                                                </>
                                            ) : (
                                                <>
                                                    <ChevronUp className="w-3 h-3" /> {t('contextMenu.collapse')}
                                                </>
                                            )}
                                        </button>
                                    )}
                                </div>
                            </>
                        )}

                        <button
                            onMouseDown={e => e.stopPropagation()}
                            onTouchStart={e => e.stopPropagation()}
                            onClick={e => {
                                e.stopPropagation();
                                onDelete();
                            }}
                            className={cn(iconBtnBase, 'hover:text-destructive hover:bg-destructive/10')}
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* Collapsed: single port dots at header center */}
                {isCollapsed && (
                    <>
                        <div
                            className="absolute left-[-6px] flex flex-col gap-0.5"
                            style={{ top: PORT_LAYOUT.COLLAPSED_PORT_CSS_TOP }}
                        >
                            {visibleInputPorts.slice(0, 1).map(p => (
                                <PortItem
                                    key={p.id}
                                    port={p}
                                    type="input"
                                    nodeId={node.id}
                                    isHighlighted={false}
                                    isConnected={connectedPortIds.includes(p.id)}
                                    isUpdated={false}
                                    portData={node.inputData?.[p.id]}
                                    connectionDraft={connectionDraft}
                                    onMouseDown={onPortMouseDown}
                                    onMouseUp={onPortMouseUp}
                                    onTouchStart={onPortTouchStart}
                                    onDoubleClick={onPortDoubleClick}
                                />
                            ))}
                        </div>
                        <div
                            className="absolute right-[-6px] flex flex-col gap-0.5"
                            style={{ top: PORT_LAYOUT.COLLAPSED_PORT_CSS_TOP }}
                        >
                            {visibleOutputPorts.slice(0, 1).map(p => (
                                <PortItem
                                    key={p.id}
                                    port={p}
                                    type="output"
                                    nodeId={node.id}
                                    isHighlighted={false}
                                    isConnected={connectedPortIds.includes(p.id)}
                                    isUpdated={false}
                                    portData={node.outputData?.[p.id]}
                                    connectionDraft={connectionDraft}
                                    onMouseDown={onPortMouseDown}
                                    onMouseUp={onPortMouseUp}
                                    onTouchStart={onPortTouchStart}
                                    onDoubleClick={onPortDoubleClick}
                                />
                            ))}
                        </div>
                    </>
                )}

                {/* Expanded: full ports at node edges */}
                {!isCollapsed && (
                    <>
                        <div className="absolute left-[-6px] top-[45px] flex flex-col gap-1">
                            {visibleInputPorts.map(p => (
                                <PortItem
                                    key={p.id}
                                    port={p}
                                    type="input"
                                    nodeId={node.id}
                                    isHighlighted={highlightedPortIds.includes(p.id)}
                                    isConnected={connectedPortIds.includes(p.id)}
                                    isUpdated={updatedPortIds.includes(p.id)}
                                    portData={node.inputData?.[p.id]}
                                    connectionDraft={connectionDraft}
                                    onMouseDown={onPortMouseDown}
                                    onMouseUp={onPortMouseUp}
                                    onTouchStart={onPortTouchStart}
                                    onDoubleClick={onPortDoubleClick}
                                />
                            ))}
                        </div>
                        <div
                            className={cn(
                                'absolute right-[-6px] top-[45px] flex flex-col gap-1',
                                tutorialHint === 'output-port' &&
                                    visibleOutputPorts.length > 0 &&
                                    !connectedPortIds.length &&
                                    'tutorial-port-pulse'
                            )}
                        >
                            {visibleOutputPorts.map(p => (
                                <PortItem
                                    key={p.id}
                                    port={p}
                                    type="output"
                                    nodeId={node.id}
                                    isHighlighted={highlightedPortIds.includes(p.id)}
                                    isConnected={connectedPortIds.includes(p.id)}
                                    isUpdated={updatedPortIds.includes(p.id)}
                                    portData={node.outputData?.[p.id]}
                                    connectionDraft={connectionDraft}
                                    onMouseDown={onPortMouseDown}
                                    onMouseUp={onPortMouseUp}
                                    onTouchStart={onPortTouchStart}
                                    onDoubleClick={onPortDoubleClick}
                                />
                            ))}
                        </div>
                    </>
                )}

                {/* Body - hidden when collapsed */}
                {!isCollapsed && (
                    <div
                        className="px-3 py-3"
                        style={{
                            minHeight: `${Math.max(
                                Math.max(visibleInputPorts.length, visibleOutputPorts.length) *
                                    PORT_LAYOUT.PORT_SPACING,
                                currentHeight ?? 0
                            )}px`,
                        }}
                    >
                        {/* Content Area */}
                        <div>
                            {/* Force Run button for non-auto nodes (input nodes have Run button in header, output nodes have no run) */}
                            {!isAuto &&
                                !definition?.type?.startsWith('input-') &&
                                definition?.stereo !== 'output' &&
                                (isProcessNode ? (
                                    <ProcessRunButtons isRunning={isRunning} onRun={handleRun} t={t} variant="full" />
                                ) : (
                                    <button
                                        onClick={() => handleRun()}
                                        disabled={isRunning}
                                        className={cn(
                                            'w-full text-[11px] py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 font-medium',
                                            isRunning
                                                ? 'bg-muted/30 text-muted-foreground border border-muted cursor-not-allowed'
                                                : definition.inputs.every(p => node.inputData?.[p.id])
                                                  ? 'bg-warning/20 hover:bg-warning/30 text-warning border border-warning/30'
                                                  : 'bg-primary/15 hover:bg-primary/25 text-primary border border-primary/20'
                                        )}
                                        onMouseDown={e => e.stopPropagation()}
                                    >
                                        {isRunning ? (
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : (
                                            <img src="/play.svg" alt="" className="w-3.5 h-3.5" />
                                        )}
                                        {t('actions.forceRun')}
                                    </button>
                                ))}

                            {definition?.type === 'input-text' && (
                                <InputTextVisualizationEditable node={node} onConfigChange={onConfigChange} />
                            )}
                            {definition?.type === 'input-image' && (
                                <InputImageVisualizationEditable node={node} onConfigChange={onConfigChange} />
                            )}
                            {definition?.type &&
                                VISUALIZATION_COMPONENTS[definition.type] &&
                                React.createElement(VISUALIZATION_COMPONENTS[definition.type], {
                                    node,
                                    definition,
                                    contentHeight: contentAreaHeight,
                                })}

                            {/* Agent Trace Logs */}
                            {traceLogs.length > 0 && (
                                <div className="mb-2">
                                    <AgentTraceVisualization traceLogs={traceLogs} contentHeight={contentAreaHeight} />
                                </div>
                            )}

                            {/* Output Preview for process nodes */}
                            <OutputPreview node={node} definition={definition} contentHeight={contentAreaHeight} />
                        </div>

                        {/* AI Key Warning */}
                        {needsAiKey && <AiKeyWarningBanner onRegisterKey={onOpenAiKeyDialog} />}

                        {/* Error Message */}
                        {nodeState === 'ERROR' && (
                            <div className="mt-2 text-destructive text-[10px] bg-destructive/10 p-2 rounded-lg border border-destructive/20 flex items-start gap-1.5">
                                <span className="font-semibold shrink-0">{t('flows:nodeBlock.error')}</span>
                                <span className="opacity-80">
                                    {node.error ?? node.errorMessage ?? t('errors.executionFailed')}
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* Progress Bar */}
                {!isCollapsed && nodeState === 'RUNNING' && (
                    <div className="absolute bottom-0 left-0 w-full h-1.5 bg-muted/50 overflow-hidden">
                        <div
                            className="h-full bg-status-running transition-all duration-200 ease-out animate-progress-pulse"
                            style={{ width: `${node.executionStats?.progress || 5}%` }}
                        />
                        {/* Animated shimmer effect */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                    </div>
                )}

                {/* Duration Badge - visible during RUNNING, fade-out after completion */}
                {!isCollapsed && displayDuration && durationBadgePhase !== 'hidden' && (
                    <div
                        className={cn(
                            'absolute bottom-2 right-2 bg-black/60 backdrop-blur-sm text-[9px] text-white/90 px-1.5 py-0.5 rounded font-mono pointer-events-none transition-opacity duration-500',
                            durationBadgePhase === 'fading' ? 'opacity-0' : 'opacity-100'
                        )}
                    >
                        {displayDuration}
                    </div>
                )}

                {/* Resize Handle - Bottom Right Corner */}
                {!isCollapsed && onResize && (
                    <div
                        className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize group"
                        onMouseDown={handleResizeStart}
                        title={t('actions.resize', {
                            min: NODE_WIDTH_BOUNDS.MIN,
                            max: NODE_WIDTH_BOUNDS.MAX,
                        })}
                    >
                        {/* Visual indicator - diagonal lines */}
                        <div className="absolute bottom-1 right-1 w-2 h-2 opacity-30 group-hover:opacity-70 transition-opacity">
                            <div className="absolute bottom-0 right-0 w-[6px] h-[1px] bg-foreground rotate-45 origin-bottom-right" />
                            <div className="absolute bottom-0 right-0 w-[4px] h-[1px] bg-foreground rotate-45 origin-bottom-right translate-x-[-2px] translate-y-[-2px]" />
                        </div>
                    </div>
                )}
            </div>
        );
    },
    areNodeBlockPropsEqual
);
