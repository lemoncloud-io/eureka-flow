import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
    Ban,
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
    Zap,
} from 'lucide-react';

import { compressImageIfNeeded, useBlockRegistry } from '@flows/flows';
import { cn } from '@flows/lib/utils';

import { S3Image } from './S3Image';

import type { NodeData, PortDefinition } from '@flows/flows';

type ConfigValue = string | number | boolean | string[] | null;

type NodeStatus = 'IDLE' | 'RUNNING' | 'COMPLETED' | 'ERROR';

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
    onTrigger: () => void;
    onToggleDisabled?: () => void;
    onDuplicate?: () => void;
    onViewLogs: () => void;
}

export interface ConnectionDraftInfo {
    sourceNodeId: string;
    sourcePortId: string;
    sourceType: string;
}

export interface NodeHighlightState {
    isSelected: boolean;
    isHighlighted?: boolean;
    highlightedPortIds?: string[];
    /** Active connection being dragged - used for port compatibility feedback */
    connectionDraft?: ConnectionDraftInfo | null;
}

const getStatusStyles = (status: NodeStatus, isSelected: boolean): string => {
    // Selected: show colored border with glow effect
    if (isSelected) {
        switch (status) {
            case 'RUNNING':
                return 'border-status-running shadow-[0_0_20px_rgba(234,179,8,0.3)]';
            case 'COMPLETED':
                return 'border-status-completed shadow-[0_0_20px_rgba(34,197,94,0.25)]';
            case 'ERROR':
                return 'border-status-error shadow-[0_0_20px_rgba(239,68,68,0.3)] animate-pulse-error';
            default:
                return 'border-primary shadow-[0_0_20px_rgba(139,92,246,0.25)]';
        }
    }
    // Not selected: status-based styling
    switch (status) {
        case 'RUNNING':
            return 'border-status-running/50 shadow-[0_0_12px_rgba(234,179,8,0.2)]';
        case 'ERROR':
            return 'border-destructive/50 animate-pulse-error';
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
        case 'any':
            return Sparkles;
        default:
            return null;
    }
};

/** Check if two port types are compatible for connection */
const arePortTypesCompatible = (sourceType: string, targetType: string): boolean => {
    if (sourceType === 'any' || targetType === 'any') return true;
    return sourceType.toLowerCase() === targetType.toLowerCase();
};

/** Get Tailwind classes for port type coloring */
const getPortTypeColor = (portType: string, hasData: boolean, portDirection: 'input' | 'output'): string => {
    // Always show color based on port type, brighter when has data
    if (portDirection === 'input') {
        return hasData
            ? 'bg-port-input border-port-input shadow-[0_0_6px_rgba(34,197,94,0.4)]'
            : 'bg-port-input/50 border-port-input/50';
    }

    switch (portType.toLowerCase()) {
        case 'image':
            return hasData
                ? 'bg-port-image border-port-image shadow-[0_0_6px_rgba(168,85,247,0.4)]'
                : 'bg-port-image/50 border-port-image/50';
        case 'text':
        case 'string':
            return hasData
                ? 'bg-port-text border-port-text shadow-[0_0_6px_rgba(139,92,246,0.4)]'
                : 'bg-port-text/50 border-port-text/50';
        case 'number':
            return hasData
                ? 'bg-port-number border-port-number shadow-[0_0_6px_rgba(34,197,94,0.4)]'
                : 'bg-port-number/50 border-port-number/50';
        default:
            return hasData
                ? 'bg-port-output border-port-output shadow-[0_0_6px_rgba(139,92,246,0.4)]'
                : 'bg-port-output/50 border-port-output/50';
    }
};

interface PortItemProps {
    port: PortDefinition;
    type: 'input' | 'output';
    nodeId: string;
    hasData: boolean;
    isHighlighted: boolean;
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
    hasData,
    isHighlighted,
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
        // Valid drop target - slow gentle glow (2s animation in styles.css)
        !isHighlighted && isValidDropTarget && 'border-success bg-success z-20 animate-port-glow cursor-copy',
        // Incompatible target - dimmed with not-allowed cursor
        !isHighlighted && isIncompatibleTarget && 'opacity-30 cursor-not-allowed',
        // Normal state
        !isHighlighted &&
            !isValidDropTarget &&
            !isIncompatibleTarget &&
            'cursor-crosshair hover:scale-125 hover:ring-2 hover:ring-white/20',
        !isHighlighted && !isValidDropTarget && getPortTypeColor(port.type, hasData, type)
    );

    const PortIcon = getPortTypeIcon(port.type);

    const portCircle = (
        <div
            className={cn('relative', type === 'input' ? '-ml-1.5 mr-1.5' : 'ml-1.5 -mr-1.5')}
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

    return (
        <div
            className={cn('flex items-center h-7 relative group', type === 'output' ? 'justify-end' : 'justify-start')}
        >
            {type === 'input' && portCircle}
            <div
                className={cn(
                    'flex items-center gap-1 transition-all',
                    isHighlighted && 'text-primary font-semibold',
                    isValidDropTarget && 'text-success font-semibold',
                    isIncompatibleTarget && 'opacity-30',
                    !isHighlighted && !isValidDropTarget && !isIncompatibleTarget && 'text-muted-foreground/80'
                )}
            >
                {PortIcon && <PortIcon className="w-2.5 h-2.5" />}
                <span className="text-[10px] uppercase tracking-wider font-medium select-none">{port.label}</span>
            </div>
            {type === 'output' && portCircle}

            {/* Tooltip showing port type */}
            <div className="absolute left-1/2 -translate-x-1/2 -top-8 bg-popover/95 backdrop-blur-sm text-popover-foreground text-[9px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none border border-border z-50 whitespace-nowrap shadow-lg transition-opacity duration-150 flex items-center gap-1">
                {PortIcon && <PortIcon className="w-2.5 h-2.5" />}
                <span className="font-semibold">{port.type}</span>
            </div>
        </div>
    );
};

const PreviewVisualization: React.FC<{ node: NodeData }> = ({ node }) => {
    const { t } = useTranslation(['nodes']);
    const lastInput = node.inputData['in'];
    const [dims, setDims] = useState<string | null>(null);

    if (!lastInput) {
        return (
            <div className="mt-3 text-[10px] text-muted-foreground/60 italic text-center py-6 bg-muted/30 rounded-lg border border-dashed border-border">
                {t('visualization.waitingForData')}
            </div>
        );
    }

    return (
        <div className="mt-3 rounded-lg border border-border overflow-hidden bg-black/20 relative">
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
    // Server uses 'image' key for input-image config
    const img = node.config?.imageData as string | undefined;
    const fileInputId = `inline-image-${node.id}`;

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = async evt => {
                const dataUrl = evt.target?.result as string;
                if (dataUrl) {
                    const { dataUrl: compressed } = await compressImageIfNeeded(dataUrl);
                    onConfigChange('imageData', compressed);
                }
            };
            reader.readAsDataURL(file);
        }
    };

    return (
        <div
            className="mt-3"
            onMouseDown={e => e.stopPropagation()}
            onDoubleClick={e => e.stopPropagation()}
            onWheel={e => e.stopPropagation()}
        >
            <input type="file" accept="image/*" className="hidden" id={fileInputId} onChange={handleImageUpload} />
            {img ? (
                <div className="relative group rounded-lg border border-border overflow-hidden bg-black/20 h-24">
                    <label
                        htmlFor={fileInputId}
                        className="block h-full cursor-pointer"
                        title={t('visualization.clickToUpload')}
                    >
                        <S3Image src={img} className="h-full w-full object-cover" alt="Input" />
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
    // Server uses 'value' key for input-text config
    const text = (node.config?.text as string) || '';

    const lines = text ? text.split('\n') : [];
    const textDisplay = text ? { firstLine: lines[0], extraLines: lines.length - 1 } : null;

    if (isEditing) {
        return (
            <div
                className="mt-3"
                onMouseDown={e => e.stopPropagation()}
                onDoubleClick={e => e.stopPropagation()}
                onWheel={e => e.stopPropagation()}
            >
                <textarea
                    autoFocus
                    className="w-full p-2.5 bg-background/80 border border-primary/50 rounded-lg text-xs resize-none font-mono focus:outline-none focus:border-primary text-foreground"
                    value={text}
                    onChange={e => onConfigChange('text', e.target.value)}
                    onBlur={() => setIsEditing(false)}
                    onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            setIsEditing(false);
                        }
                        if (e.key === 'Escape') {
                            setIsEditing(false);
                        }
                        e.stopPropagation();
                    }}
                    rows={3}
                    placeholder={t('visualization.enterText')}
                />
            </div>
        );
    }

    return (
        <div
            className="mt-3 p-2.5 bg-muted/30 rounded-lg border border-border hover:border-primary/40 cursor-text transition-all group"
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
                className="text-xs text-foreground/70 font-mono flex items-center gap-1 group-hover:text-foreground/90 transition-colors"
                title={text}
            >
                {textDisplay ? (
                    <>
                        <span className="truncate">"{textDisplay.firstLine}"</span>
                        {textDisplay.extraLines > 0 && (
                            <span className="text-muted-foreground/50 text-[9px] shrink-0 bg-muted/50 px-1 rounded">
                                +{textDisplay.extraLines}
                            </span>
                        )}
                    </>
                ) : (
                    <span className="text-muted-foreground/50 italic">{t('visualization.clickToAddText')}</span>
                )}
            </div>
        </div>
    );
};

const DebugLogVisualization: React.FC<{ node: NodeData }> = ({ node }) => {
    const { t } = useTranslation(['nodes']);
    const lastInput = node.inputData['in']?.value;
    return (
        <div
            className="mt-3 p-2.5 bg-black/30 rounded-lg border border-border text-foreground/80 font-mono text-[10px] break-all max-h-28 overflow-y-auto"
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

const VISUALIZATION_COMPONENTS: Record<string, React.FC<{ node: NodeData }>> = {
    // Server type names
    'console-log': DebugLogVisualization,
    'result-preview': PreviewVisualization,
    // Alias for preview block type
    preview: PreviewVisualization,
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
    const definition = blockRegistry[node.type];

    const { isSelected, isHighlighted, highlightedPortIds = [], connectionDraft } = highlightState;
    const { onPortMouseDown, onPortMouseUp } = portHandlers;
    const { onConfigChange, onLabelChange, onToggleAuto } = configHandlers;
    const { onDelete, onTrigger, onToggleDisabled, onDuplicate, onViewLogs } = actions;

    const isAuto = node.autoExecutionEnabled !== false;
    const isDisabled = (node as NodeData & { disabled?: boolean }).disabled === true;

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
        if (node.status === 'RUNNING' && startTime) {
            interval = window.setInterval(() => {
                setElapsedTime(Date.now() - startTime);
            }, 100);
        } else {
            setElapsedTime(null);
        }
        return () => clearInterval(interval);
    }, [node.status, node.executionStats?.startTime]);

    const duration = node.status === 'RUNNING' ? elapsedTime : node.executionStats?.duration;
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
        switch (node.status) {
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
                'absolute w-[260px] bg-node-bg rounded-xl border-[1.5px] overflow-hidden',
                !isDragging && 'transition-all duration-200',
                isDisabled && 'opacity-50',
                !isSelected && !isHighlighted && node.status === 'IDLE' && 'shadow-node',
                isHighlighted ? 'border-accent/60' : getStatusStyles(node.status as NodeStatus, isSelected)
            )}
            style={{ left: node.position.x, top: node.position.y }}
            onMouseDown={onMouseDown}
            onDoubleClick={e => e.stopPropagation()}
        >
            {/* Header */}
            <div
                className={cn(
                    'pl-4 pr-2 py-2 flex justify-between items-center cursor-move',
                    'border-b border-node-border/30 bg-node-header/50',
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
                            <span className="font-semibold text-[13px] text-foreground truncate leading-tight">
                                {node.customLabel || definition.label}
                            </span>
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
                    <button
                        onClick={e => {
                            e.stopPropagation();
                            onToggleAuto();
                        }}
                        className={cn(
                            'w-6 h-6 flex items-center justify-center rounded-md transition-all',
                            isAuto
                                ? 'text-primary hover:bg-primary/10'
                                : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50'
                        )}
                        title={isAuto ? t('autoExecution.on') : t('autoExecution.off')}
                    >
                        {isAuto ? <Zap className="w-3.5 h-3.5" /> : <span className="text-[10px] font-mono">M</span>}
                    </button>

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
                                {node.status === 'ERROR' && (
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

            {/* Body */}
            <div className="px-3 py-3">
                {/* Ports */}
                <div className="flex justify-between gap-2">
                    <div className="flex flex-col gap-0.5 min-w-[45%]">
                        {definition.inputs.map(p => (
                            <PortItem
                                key={p.id}
                                port={p}
                                type="input"
                                nodeId={node.id}
                                hasData={!!node.inputData[p.id]}
                                isHighlighted={highlightedPortIds.includes(p.id)}
                                connectionDraft={connectionDraft}
                                onMouseDown={onPortMouseDown}
                                onMouseUp={onPortMouseUp}
                            />
                        ))}
                    </div>
                    <div className="flex flex-col gap-0.5 items-end min-w-[45%]">
                        {definition.outputs.map(p => (
                            <PortItem
                                key={p.id}
                                port={p}
                                type="output"
                                nodeId={node.id}
                                hasData={!!node.outputData[p.id]}
                                isHighlighted={highlightedPortIds.includes(p.id)}
                                connectionDraft={connectionDraft}
                                onMouseDown={onPortMouseDown}
                                onMouseUp={onPortMouseUp}
                            />
                        ))}
                    </div>
                </div>

                {/* Content Area */}
                <div className="mt-2">
                    {/* Use definition.type for block type checks (node.type may be blockId like "1000006") */}
                    {(definition?.type?.startsWith('input-') || !isAuto) && (
                        <button
                            onClick={onTrigger}
                            className={cn(
                                'w-full text-[11px] py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 font-medium',
                                !isAuto && definition.inputs.every(p => node.inputData[p.id])
                                    ? 'bg-warning/20 hover:bg-warning/30 text-warning border border-warning/30'
                                    : 'bg-primary/15 hover:bg-primary/25 text-primary border border-primary/20'
                            )}
                            onMouseDown={e => e.stopPropagation()}
                        >
                            <Play className="w-3 h-3" />
                            {definition?.type?.startsWith('input-') ? t('actions.run') : t('actions.forceRun')}
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
                        React.createElement(VISUALIZATION_COMPONENTS[definition.type], { node })}
                </div>

                {/* Error Message */}
                {node.status === 'ERROR' && (
                    <div className="mt-3 text-destructive text-[10px] bg-destructive/10 p-2 rounded-lg border border-destructive/20 flex items-start gap-1.5">
                        <span className="font-semibold shrink-0">{t('flows:nodeBlock.error')}</span>
                        <span className="opacity-80">{node.errorMessage || t('errors.executionFailed')}</span>
                    </div>
                )}
            </div>

            {/* Progress Bar */}
            {node.status === 'RUNNING' && (
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
