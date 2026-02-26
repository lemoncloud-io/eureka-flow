import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
    Ban,
    Braces,
    Check,
    Copy,
    Hash,
    Image,
    Loader2,
    MoreVertical,
    Pencil,
    Play,
    RefreshCw,
    ScrollText,
    Sparkles,
    Type,
    X,
} from 'lucide-react';

import {
    DEFAULT_TEXTAREA_HEIGHT,
    PORT_LAYOUT,
    clampHeight,
    compressImageIfNeeded,
    getBlockDefinition,
    getEffectiveState,
    getNodeHeight,
    useBlockRegistry,
} from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { JsonViewer, MarkdownViewer, isMarkdownContent } from '@flows/ui-kit';

import { S3Image } from './S3Image';
import { TooltipImage } from './TooltipImage';
import { arePortTypesCompatible, getVisiblePorts } from '../utils';

import type { ConnectionDraftInfo } from '../utils';
import type { BlockDefinitionWithFrontend, DataPacket, NodeData, NodeState, PortDefinition } from '@flows/flows';

type ConfigValue = string | number | boolean | string[] | null;

export interface NodePortHandlers {
    onPortMouseDown: (
        nodeId: string,
        portId: string,
        type: 'input' | 'output',
        portType: string,
        e: React.MouseEvent
    ) => void;
    onPortMouseUp: (nodeId: string, portId: string, type: 'input' | 'output', portType: string) => void;
}

export interface NodeConfigHandlers {
    onConfigChange: (key: string, value: ConfigValue) => void;
    onLabelChange: (label: string) => void;
    onToggleAuto: () => void;
}

export interface NodeActions {
    onDelete: () => void;
    onTrigger: () => Promise<void> | void;
    onToggleDisabled?: () => void;
    onDuplicate?: () => void;
    onViewLogs: () => void;
}

export interface NodeHighlightState {
    isSelected: boolean;
    isHighlighted?: boolean;
    highlightedPortIds?: string[];
    /** Port IDs that have connections */
    connectedPortIds?: string[];
    /** Active connection being dragged - used for port compatibility feedback */
    connectionDraft?: ConnectionDraftInfo | null;
}

const getStatusStyles = (state: NodeState | undefined, isSelected: boolean): string => {
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
                return 'border-primary shadow-[0_0_20px_rgba(139,92,246,0.25)]';
        }
    }
    // Not selected: state-based styling
    switch (state) {
        case 'RUNNING':
            return 'border-status-running/50 shadow-[0_0_12px_rgba(234,179,8,0.2)]';
        case 'ERROR':
            return 'border-destructive/50 animate-pulse-error';
        case 'IDLE':
        case 'READY':
        case 'COMPLETED':
        default:
            return 'border-muted-foreground/20';
    }
};

/** Get icon component for port type */
const getPortTypeIcon = (portType: string): React.ElementType | null => {
    switch (portType.toLowerCase()) {
        case 'text':
        case 'string':
            return Type;
        case 'image':
            return Image;
        case 'number':
            return Hash;
        case 'json':
            return Braces;
        case 'any':
            return Sparkles;
        default:
            return null;
    }
};

/**
 * Port type style configuration - single source of truth for all port styling
 * IMPORTANT: Use complete static class names for Tailwind's static analyzer.
 * Dynamic interpolation like `bg-${color}` will NOT be detected at build time.
 */
const PORT_TYPE_STYLES = {
    text: {
        connected: 'bg-port-text border-port-text',
        disconnected: 'bg-background border-port-text',
        drop: 'border-port-text bg-port-text animate-port-glow-text',
        text: 'text-port-text',
    },
    image: {
        connected: 'bg-port-image border-port-image',
        disconnected: 'bg-background border-port-image',
        drop: 'border-port-image bg-port-image animate-port-glow-image',
        text: 'text-port-image',
    },
    number: {
        connected: 'bg-port-number border-port-number',
        disconnected: 'bg-background border-port-number',
        drop: 'border-port-number bg-port-number animate-port-glow-number',
        text: 'text-port-number',
    },
    json: {
        connected: 'bg-port-json border-port-json',
        disconnected: 'bg-background border-port-json',
        drop: 'border-port-json bg-port-json animate-port-glow-json',
        text: 'text-port-json',
    },
    any: {
        connected: 'bg-port-any border-port-any',
        disconnected: 'bg-background border-port-any',
        drop: 'border-port-any bg-port-any animate-port-glow-any',
        text: 'text-port-any',
    },
} as const;

type PortStyleKey = keyof typeof PORT_TYPE_STYLES;

/** Normalize port type string to a valid style key */
const getPortStyleKey = (portType: string): PortStyleKey => {
    const normalized = portType.toLowerCase();
    if (normalized === 'string') return 'text';
    if (normalized in PORT_TYPE_STYLES) return normalized as PortStyleKey;
    return 'any';
};

/** Get Tailwind classes for port type coloring - filled when connected, outline when disconnected */
const getPortTypeColor = (portType: string, isConnected: boolean): string => {
    const style = PORT_TYPE_STYLES[getPortStyleKey(portType)];
    return isConnected ? style.connected : style.disconnected;
};

/** Get Tailwind classes for valid drop target highlighting - matches source port's dataType color */
const getDropTargetColor = (sourceType: string): string => {
    return PORT_TYPE_STYLES[getPortStyleKey(sourceType)].drop;
};

interface PortItemProps {
    port: PortDefinition;
    type: 'input' | 'output';
    nodeId: string;
    isHighlighted: boolean;
    isConnected: boolean;
    /** Port data value if available */
    portData?: DataPacket | null;
    /** Connection being dragged - for compatibility feedback */
    connectionDraft?: ConnectionDraftInfo | null;
    onMouseDown: (
        nodeId: string,
        portId: string,
        type: 'input' | 'output',
        portType: string,
        e: React.MouseEvent
    ) => void;
    onMouseUp: (nodeId: string, portId: string, type: 'input' | 'output', portType: string) => void;
}

const PortItem: React.FC<PortItemProps> = ({
    port,
    type,
    nodeId,
    isHighlighted,
    isConnected,
    portData,
    connectionDraft,
    onMouseDown,
    onMouseUp,
}) => {
    // Determine if this input port is a valid drop target for the current connection draft
    const isDraggingConnection = !!connectionDraft;
    const isInputPort = type === 'input';
    const isSourceNode = connectionDraft?.sourceNodeId === nodeId;

    // Only input ports can be drop targets, and not on the same node
    const isValidDropTarget =
        isDraggingConnection &&
        isInputPort &&
        !isSourceNode &&
        arePortTypesCompatible(connectionDraft.sourceType, port.type);

    const isIncompatibleTarget = isDraggingConnection && isInputPort && !isSourceNode && !isValidDropTarget;

    const portClasses = cn(
        'w-3 h-3 rounded-full border-2 transition-all duration-200',
        // Highlighted state (selected connection) - thicker border only, no ring
        isHighlighted && 'scale-110 border-primary border-[3px] z-20',
        // Valid drop target - uses source port's dataType color with matching glow animation
        !isHighlighted && isValidDropTarget && [getDropTargetColor(connectionDraft.sourceType), 'z-20 cursor-copy'],
        // Incompatible target - dimmed with not-allowed cursor
        !isHighlighted && isIncompatibleTarget && 'opacity-30 cursor-not-allowed',
        // Normal state
        !isHighlighted &&
            !isValidDropTarget &&
            !isIncompatibleTarget &&
            'cursor-crosshair hover:scale-125 hover:ring-2 hover:ring-white/20',
        !isHighlighted && !isValidDropTarget && getPortTypeColor(port.type, isConnected)
    );

    const PortIcon = getPortTypeIcon(port.type);

    const portCircle = (
        <div
            className={cn('relative')}
            onMouseDown={e => {
                e.stopPropagation();
                onMouseDown(nodeId, port.id, type, port.type, e);
            }}
            onMouseUp={e => {
                e.stopPropagation();
                onMouseUp(nodeId, port.id, type, port.type);
            }}
        >
            {/* Extended hit area - transparent 24x24px */}
            <div
                className={cn('absolute -inset-1.5', isIncompatibleTarget ? 'cursor-not-allowed' : 'cursor-crosshair')}
            />
            {/* Visual port circle */}
            <div className={portClasses} />
        </div>
    );

    // Tooltip positioning based on content type
    const tooltipPosition = !portData
        ? '-top-7 whitespace-nowrap'
        : portData.type === 'image'
          ? 'bottom-full mb-2'
          : '-top-14 max-w-[200px]';

    return (
        <div className="relative group flex items-center justify-center w-3 h-6">
            {portCircle}

            {/* Tooltip showing port label and data on hover */}
            <div
                className={cn(
                    'absolute left-1/2 -translate-x-1/2 bg-popover/95 backdrop-blur-sm text-popover-foreground text-[9px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none border border-border z-50 shadow-lg transition-opacity duration-150',
                    tooltipPosition
                )}
            >
                <div className="flex items-center gap-1">
                    {PortIcon && <PortIcon className="w-2.5 h-2.5 shrink-0" />}
                    <span className="font-semibold uppercase tracking-wider">{port.label}</span>
                </div>
                {portData && (
                    <div className="mt-1 pt-1 border-t border-border/50">
                        {portData.type === 'image' ? (
                            <TooltipImage src={portData.value as string} altText="Port data" />
                        ) : (
                            <div className="font-mono text-[10px] text-foreground/80 break-all max-h-[60px] overflow-hidden">
                                {(() => {
                                    const strValue =
                                        typeof portData.value === 'object'
                                            ? JSON.stringify(portData.value)
                                            : String(portData.value);
                                    return strValue.length > 100 ? `${strValue.slice(0, 100)}...` : strValue;
                                })()}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

interface VisualizationProps {
    node: NodeData;
    definition: BlockDefinitionWithFrontend;
}

/** Get first input data from node using definition's port ID or fallback to first available */
const getFirstInputData = (node: NodeData, definition: BlockDefinitionWithFrontend) => {
    const inputPortId = definition.inputs?.[0]?.id;
    return inputPortId ? node.inputData?.[inputPortId] : Object.values(node.inputData ?? {})[0];
};

const PreviewVisualization: React.FC<VisualizationProps> = ({ node, definition }) => {
    const { t } = useTranslation(['nodes']);
    const [dims, setDims] = useState<string | null>(null);

    const lastInput = getFirstInputData(node, definition);

    if (!lastInput) {
        return (
            <div className="text-[10px] text-muted-foreground/60 italic text-center py-6 bg-muted/30 rounded-lg border border-dashed border-border">
                {t('visualization.waitingForData')}
            </div>
        );
    }

    return (
        <div className="rounded-lg border border-border overflow-hidden bg-black/20 relative">
            {lastInput.type === 'image' ? (
                <>
                    <div className="flex justify-center items-center p-2 min-h-[80px]">
                        <S3Image
                            src={lastInput.value as string}
                            className="max-w-full max-h-32 rounded object-contain"
                            alt="Preview"
                            onLoad={e => setDims(`${e.currentTarget.naturalWidth}×${e.currentTarget.naturalHeight}`)}
                        />
                    </div>
                    {dims && (
                        <div className="absolute bottom-1 right-1 bg-black/70 text-[9px] text-white/90 px-1.5 py-0.5 rounded backdrop-blur-sm font-mono">
                            {dims}
                        </div>
                    )}
                </>
            ) : (
                <div className="text-xs p-3 text-foreground/80 break-words text-center font-mono">
                    {String(lastInput.value).slice(0, 100)}
                    {String(lastInput.value).length > 100 && '...'}
                </div>
            )}
        </div>
    );
};

interface EditableVisualizationProps {
    node: NodeData;
    onConfigChange: (key: string, value: ConfigValue) => void;
}

const InputImageVisualizationEditable: React.FC<EditableVisualizationProps> = ({ node, onConfigChange }) => {
    const { t } = useTranslation(['nodes']);
    const [isUploading, setIsUploading] = useState(false);
    // Server uses 'image' key for input-image config
    const img = node.config?.imageData as string | undefined;
    const fileInputId = `inline-image-${node.id}`;

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setIsUploading(true);
            const reader = new FileReader();
            reader.onload = async evt => {
                const dataUrl = evt.target?.result as string;
                if (dataUrl) {
                    const { dataUrl: compressed } = await compressImageIfNeeded(dataUrl);
                    onConfigChange('imageData', compressed);
                }
                setIsUploading(false);
            };
            reader.onerror = () => setIsUploading(false);
            reader.readAsDataURL(file);
        }
    };

    return (
        <div
            onMouseDown={e => e.stopPropagation()}
            onDoubleClick={e => e.stopPropagation()}
            onWheel={e => e.stopPropagation()}
        >
            <input type="file" accept="image/*" className="hidden" id={fileInputId} onChange={handleImageUpload} />
            {isUploading ? (
                <div className="rounded-lg border border-dashed border-primary/60 overflow-hidden bg-black/20 h-24 flex items-center justify-center">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                        <Loader2 className="w-4 h-4 text-primary animate-spin" />
                    </div>
                </div>
            ) : img ? (
                <div className="relative group rounded-lg border border-border overflow-hidden bg-black/20 min-h-[96px]">
                    <label
                        htmlFor={fileInputId}
                        className="block cursor-pointer flex items-center justify-center p-2"
                        title={t('visualization.clickToUpload')}
                    >
                        <S3Image src={img} className="max-w-full max-h-32 object-contain" alt="Input" />
                    </label>
                    <button
                        onClick={e => {
                            e.stopPropagation();
                            e.preventDefault();
                            onConfigChange('imageData', '');
                        }}
                        className="absolute top-1.5 right-1.5 p-1 bg-black/60 hover:bg-black/80 text-white rounded-md border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
                        title={t('visualization.removeImage')}
                    >
                        <X className="w-3 h-3" />
                    </button>
                </div>
            ) : (
                <label
                    htmlFor={fileInputId}
                    className="block rounded-lg border border-dashed border-border overflow-hidden bg-black/20 h-24 cursor-pointer hover:border-primary/60 hover:bg-black/30 transition-all group"
                    title={t('visualization.clickToUpload')}
                >
                    <div className="h-full flex flex-col items-center justify-center gap-1">
                        <div className="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                            <Play className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                        </div>
                        <span className="text-[10px] text-muted-foreground/70">{t('visualization.clickToUpload')}</span>
                    </div>
                </label>
            )}
        </div>
    );
};

const InputTextVisualizationEditable: React.FC<EditableVisualizationProps> = ({ node, onConfigChange }) => {
    const { t } = useTranslation(['nodes']);
    const [isEditing, setIsEditing] = useState(false);
    const [localHeight, setLocalHeight] = useState<number | undefined>(undefined);
    const heightRef = useRef<number>(0);
    // Server uses 'value' key for input-text config
    const text = (node.config?.text as string) || '';
    const savedHeight = getNodeHeight(node);

    // Initialize height from saved value
    const currentHeight = localHeight ?? savedHeight ?? DEFAULT_TEXTAREA_HEIGHT;

    // Handle drag resize
    const handleResizeStart = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const startY = e.clientY;
        const startHeight = currentHeight;
        heightRef.current = currentHeight;

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const delta = moveEvent.clientY - startY;
            const newHeight = clampHeight(startHeight + delta);
            heightRef.current = newHeight;
            setLocalHeight(newHeight);
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            // Save height at node level (not in config)
            if (heightRef.current !== savedHeight) {
                onConfigChange('height', heightRef.current);
            }
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    if (isEditing) {
        return (
            <div
                className="flex flex-col"
                onMouseDown={e => e.stopPropagation()}
                onDoubleClick={e => e.stopPropagation()}
                onWheel={e => e.stopPropagation()}
            >
                <textarea
                    autoFocus
                    className="w-full p-2.5 bg-background/80 border border-primary/50 rounded-t-lg text-xs resize-none font-mono focus:outline-none focus:border-primary text-foreground"
                    style={{
                        height: `${currentHeight}px`,
                    }}
                    value={text}
                    onChange={e => onConfigChange('text', e.target.value)}
                    onBlur={e => {
                        // Don't close if clicking resize handle
                        if (e.relatedTarget?.closest('.resize-handle')) return;
                        setIsEditing(false);
                    }}
                    onKeyDown={e => {
                        // Allow Enter for newlines, Escape to exit
                        if (e.key === 'Escape') {
                            setIsEditing(false);
                        }
                        e.stopPropagation();
                    }}
                    placeholder={t('visualization.enterText')}
                />
                {/* Resize handle bar */}
                <div
                    className="resize-handle h-3 bg-primary/10 hover:bg-primary/20 border border-t-0 border-primary/50 rounded-b-lg cursor-ns-resize flex items-center justify-center transition-colors"
                    onMouseDown={handleResizeStart}
                    tabIndex={-1}
                >
                    <div className="w-8 h-1 bg-primary/30 rounded-full" />
                </div>
            </div>
        );
    }

    return (
        <div
            className="p-2.5 bg-muted/30 rounded-lg border border-border hover:border-primary/40 cursor-text transition-all group overflow-hidden"
            style={{
                minHeight: savedHeight ? `${savedHeight}px` : undefined,
            }}
            onClick={e => {
                e.stopPropagation();
                setIsEditing(true);
            }}
            onDoubleClick={e => e.stopPropagation()}
            onWheel={e => e.stopPropagation()}
            title={t('visualization.clickToEdit')}
        >
            <div className="text-[9px] text-muted-foreground/60 mb-1 uppercase tracking-wider font-medium flex items-center gap-1">
                <Pencil className="w-2.5 h-2.5" />
                {t('visualization.value')}
            </div>
            <div
                className="text-xs text-foreground/70 font-mono whitespace-pre-wrap break-all group-hover:text-foreground/90 transition-colors"
                style={{
                    maxHeight: savedHeight ? `${savedHeight - 30}px` : '60px',
                    overflow: 'hidden',
                }}
                title={text}
            >
                {text ? (
                    <span>"{text}"</span>
                ) : (
                    <span className="text-muted-foreground/50 italic">{t('visualization.clickToAddText')}</span>
                )}
            </div>
        </div>
    );
};

const DebugLogVisualization: React.FC<VisualizationProps> = ({ node, definition }) => {
    const { t } = useTranslation(['nodes']);
    const lastInput = getFirstInputData(node, definition)?.value;
    return (
        <div
            className="p-2.5 bg-black/30 rounded-lg border border-border text-foreground/80 font-mono text-[10px] break-all max-h-28 overflow-y-auto"
            onWheel={e => e.stopPropagation()}
        >
            {lastInput !== undefined ? (
                typeof lastInput === 'object' ? (
                    <pre className="whitespace-pre-wrap">{JSON.stringify(lastInput, null, 2)}</pre>
                ) : (
                    String(lastInput)
                )
            ) : (
                <span className="text-muted-foreground/50 italic">{t('visualization.waitingForData')}</span>
            )}
        </div>
    );
};

const VISUALIZATION_COMPONENTS: Record<string, React.FC<VisualizationProps>> = {
    // New type names
    'output-console': DebugLogVisualization,
    'output-preview': PreviewVisualization,
    // Legacy type names (backward compat)
    'console-log': DebugLogVisualization,
    'debug-log': DebugLogVisualization,
    'result-preview': PreviewVisualization,
    preview: PreviewVisualization,
};

// ============================================================================
// Output Preview Component (shows first output data in node body)
// ============================================================================

/** Get first output data from node */
const getFirstOutputData = (node: NodeData, definition: BlockDefinitionWithFrontend): DataPacket | undefined => {
    const outputPortId = definition.outputs?.[0]?.id;
    return outputPortId ? node.outputData?.[outputPortId] : Object.values(node.outputData ?? {})[0];
};

const OutputPreview: React.FC<VisualizationProps> = ({ node, definition }) => {
    const { t } = useTranslation(['nodes']);
    const packet = getFirstOutputData(node, definition);

    // Skip if this is an input/output visualization node (they have their own visualizations)
    if (
        definition.type?.startsWith('input-') ||
        definition.type?.startsWith('output-') ||
        VISUALIZATION_COMPONENTS[definition.type ?? '']
    ) {
        return null;
    }

    // No data yet - show waiting message
    if (!packet) {
        return (
            <div className="text-[10px] text-muted-foreground/60 italic text-center py-4 bg-muted/30 rounded-lg border border-dashed border-border">
                {t('visualization.waitingForData')}
            </div>
        );
    }

    if (packet.type === 'image') {
        return (
            <div className="rounded-lg border border-border overflow-hidden bg-black/20">
                <div className="flex justify-center items-center p-2">
                    <S3Image
                        src={packet.value as string}
                        className="max-w-full max-h-[180px] rounded object-contain"
                        alt="Output"
                    />
                </div>
            </div>
        );
    }

    if (packet.type === 'json' || typeof packet.value === 'object') {
        return (
            <div className="p-2 bg-black/20 rounded-lg border border-border" onWheel={e => e.stopPropagation()}>
                <JsonViewer data={packet.value} maxHeight={180} collapsed={2} />
            </div>
        );
    }

    if (packet.type === 'markdown' || isMarkdownContent(packet.value)) {
        return (
            <div className="p-2 bg-muted/30 rounded-lg border border-border" onWheel={e => e.stopPropagation()}>
                <MarkdownViewer content={String(packet.value)} maxHeight={180} />
            </div>
        );
    }

    // Text/number/any
    const strValue = String(packet.value);
    return (
        <div
            className="p-2.5 bg-muted/30 rounded-lg border border-border"
            style={{ maxHeight: '180px', overflow: 'hidden' }}
        >
            <div className="text-xs text-foreground/80 break-words whitespace-pre-wrap">{strValue}</div>
        </div>
    );
};

interface NodeBlockProps {
    node: NodeData;
    highlightState: NodeHighlightState;
    portHandlers: NodePortHandlers;
    configHandlers: NodeConfigHandlers;
    actions: NodeActions;
    onMouseDown: (e: React.MouseEvent) => void;
    isDragging?: boolean;
}

export const NodeBlock: React.FC<NodeBlockProps> = ({
    node,
    highlightState,
    portHandlers,
    configHandlers,
    actions,
    onMouseDown,
    isDragging = false,
}) => {
    const { t } = useTranslation(['nodes', 'flows']);
    const blockRegistry = useBlockRegistry();

    // Try direct lookup first, then fallback to config-based matching
    const definition = getBlockDefinition(node, blockRegistry);

    const {
        isSelected,
        isHighlighted,
        highlightedPortIds = [],
        connectedPortIds = [],
        connectionDraft,
    } = highlightState;
    const { onPortMouseDown, onPortMouseUp } = portHandlers;
    const { onConfigChange, onLabelChange } = configHandlers;
    const { onDelete, onTrigger, onToggleDisabled, onDuplicate, onViewLogs } = actions;

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
    const isDisabled = (node as NodeData & { disabled?: boolean }).disabled === true;

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

    const handleRun = async () => {
        if (isRunning) return;
        setIsRunning(true);
        try {
            await onTrigger();
        } finally {
            setIsRunning(false);
        }
    };

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

    const StatusIcon = () => {
        if (isDisabled) return <Ban className="w-4 h-4 text-muted-foreground" />;
        switch (nodeState) {
            case 'RUNNING':
                return <Loader2 className="w-4 h-4 text-status-running animate-spin" />;
            case 'COMPLETED':
                return <Check className="w-4 h-4 text-status-completed" />;
            case 'ERROR':
                return (
                    <div className="w-4 h-4 rounded-full bg-destructive/20 flex items-center justify-center">
                        <span className="text-destructive font-bold text-[10px]">!</span>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div
            className={cn(
                'absolute w-[260px] bg-node-bg rounded-xl border-[1.5px]',
                !isDragging && 'transition-all duration-200',
                isDisabled && 'opacity-50',
                !isSelected && !isHighlighted && nodeState === 'IDLE' && 'shadow-node',
                isHighlighted
                    ? 'border-accent/60'
                    : definition.isFrontend && !isSelected && nodeState === 'IDLE'
                      ? 'border-primary/50'
                      : getStatusStyles(nodeState, isSelected)
            )}
            style={{ left: node.position.x, top: node.position.y }}
            onMouseDown={onMouseDown}
            onDoubleClick={e => e.stopPropagation()}
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
                        <div className="w-4 h-4 flex items-center justify-center shrink-0">
                            <StatusIcon />
                        </div>
                        <div className="flex flex-col overflow-hidden min-w-0">
                            <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-[13px] text-foreground truncate leading-tight">
                                    {node.customLabel || definition.label}
                                </span>
                            </div>
                            {node.customLabel && (
                                <span className="text-[9px] text-muted-foreground/70 truncate font-mono leading-tight">
                                    {definition.label}
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {/* Compact Actions */}
                <div className="flex items-center gap-0.5 shrink-0">
                    {/* Run button: show for all executable nodes (has execute function or backend execution) */}
                    {(definition?.execute || !definition?.isFrontend) && (
                        <button
                            onClick={e => {
                                e.stopPropagation();
                                handleRun();
                            }}
                            onMouseDown={e => e.stopPropagation()}
                            disabled={isRunning}
                            className={cn(
                                'w-6 h-6 rounded-md flex items-center justify-center transition-all',
                                isRunning
                                    ? 'bg-muted/30 text-muted-foreground cursor-not-allowed'
                                    : 'bg-primary/10 hover:bg-primary/20 text-primary'
                            )}
                            title={t('actions.run')}
                        >
                            {isRunning ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <Play className="w-3.5 h-3.5" />
                            )}
                        </button>
                    )}
                    <button
                        onClick={e => {
                            e.stopPropagation();
                            setShowMenu(!showMenu);
                        }}
                        className="text-muted-foreground/60 hover:text-foreground w-6 h-6 flex items-center justify-center rounded-md hover:bg-muted/50 transition-all"
                    >
                        <MoreVertical className="w-3.5 h-3.5" />
                    </button>

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
                                className="absolute right-0 top-8 w-36 bg-popover/95 backdrop-blur-md border border-border rounded-lg shadow-xl z-50 flex flex-col py-1 animate-in fade-in zoom-in-95 duration-100"
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
                                {onToggleDisabled && (
                                    <button
                                        onClick={e => {
                                            e.stopPropagation();
                                            setShowMenu(false);
                                            onToggleDisabled();
                                        }}
                                        className="text-left px-3 py-1.5 text-xs text-foreground hover:bg-accent/50 flex items-center gap-2 transition-colors"
                                    >
                                        <Ban className="w-3 h-3" />{' '}
                                        {isDisabled ? t('contextMenu.enable') : t('contextMenu.disable')}
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
                                <div className="border-t border-border/50 my-1" />
                                <button
                                    onClick={e => {
                                        e.stopPropagation();
                                        setShowMenu(false);
                                        onViewLogs();
                                    }}
                                    className="text-left px-3 py-1.5 text-xs text-foreground hover:bg-accent/50 flex items-center gap-2 transition-colors"
                                >
                                    <ScrollText className="w-3 h-3" /> {t('contextMenu.viewLogs')}
                                </button>
                            </div>
                        </>
                    )}

                    <button
                        onClick={e => {
                            e.stopPropagation();
                            onDelete();
                        }}
                        className="text-muted-foreground/60 hover:text-destructive w-6 h-6 flex items-center justify-center rounded-md hover:bg-destructive/10 transition-all"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Ports at node edges - centered on border */}
            {/* Show only: first port + connected ports + compatible ports during drag */}
            <div className="absolute left-[-6px] top-[45px] flex flex-col gap-1">
                {visibleInputPorts.map(p => (
                    <PortItem
                        key={p.id}
                        port={p}
                        type="input"
                        nodeId={node.id}
                        isHighlighted={highlightedPortIds.includes(p.id)}
                        isConnected={connectedPortIds.includes(p.id)}
                        portData={node.inputData?.[p.id]}
                        connectionDraft={connectionDraft}
                        onMouseDown={onPortMouseDown}
                        onMouseUp={onPortMouseUp}
                    />
                ))}
            </div>
            <div className="absolute right-[-6px] top-[45px] flex flex-col gap-1">
                {visibleOutputPorts.map(p => (
                    <PortItem
                        key={p.id}
                        port={p}
                        type="output"
                        nodeId={node.id}
                        isHighlighted={highlightedPortIds.includes(p.id)}
                        isConnected={connectedPortIds.includes(p.id)}
                        portData={node.outputData?.[p.id]}
                        connectionDraft={connectionDraft}
                        onMouseDown={onPortMouseDown}
                        onMouseUp={onPortMouseUp}
                    />
                ))}
            </div>

            {/* Body - min height based on visible port count */}
            <div
                className="px-3 py-3"
                style={{
                    minHeight: `${Math.max(visibleInputPorts.length, visibleOutputPorts.length) * PORT_LAYOUT.PORT_SPACING}px`,
                }}
            >
                {/* Content Area */}
                <div>
                    {/* Force Run button for non-auto nodes (input nodes have Run button in header) */}
                    {!isAuto && !definition?.type?.startsWith('input-') && (
                        <button
                            onClick={handleRun}
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
                            {isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                            {t('actions.forceRun')}
                        </button>
                    )}

                    {definition?.type === 'input-text' && (
                        <InputTextVisualizationEditable node={node} onConfigChange={onConfigChange} />
                    )}
                    {definition?.type === 'input-image' && (
                        <InputImageVisualizationEditable node={node} onConfigChange={onConfigChange} />
                    )}
                    {definition?.type &&
                        VISUALIZATION_COMPONENTS[definition.type] &&
                        React.createElement(VISUALIZATION_COMPONENTS[definition.type], { node, definition })}

                    {/* Output Preview for process nodes */}
                    <OutputPreview node={node} definition={definition} />
                </div>

                {/* Error Message */}
                {nodeState === 'ERROR' && (
                    <div className="mt-2 text-destructive text-[10px] bg-destructive/10 p-2 rounded-lg border border-destructive/20 flex items-start gap-1.5">
                        <span className="font-semibold shrink-0">{t('flows:nodeBlock.error')}</span>
                        <span className="opacity-80">{node.errorMessage || t('errors.executionFailed')}</span>
                    </div>
                )}
            </div>

            {/* Progress Bar */}
            {nodeState === 'RUNNING' && (
                <div className="absolute bottom-0 left-0 w-full h-1.5 bg-muted/50 overflow-hidden">
                    <div
                        className="h-full bg-status-running transition-all duration-200 ease-out animate-progress-pulse"
                        style={{ width: `${node.executionStats?.progress || 5}%` }}
                    />
                    {/* Animated shimmer effect */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                </div>
            )}

            {/* Duration Badge */}
            {displayDuration && (
                <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-sm text-[9px] text-white/90 px-1.5 py-0.5 rounded font-mono pointer-events-none">
                    {displayDuration}
                </div>
            )}
        </div>
    );
};
