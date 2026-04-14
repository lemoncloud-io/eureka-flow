import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
    Ban,
    Braces,
    Check,
    Copy,
    Expand,
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
    NODE_CONTENT_OVERHEAD,
    NODE_WIDTH_BOUNDS,
    PORT_LAYOUT,
    clampHeight,
    clampNodeHeight,
    clampWidth,
    compressImageIfNeeded,
    getBlockDefinition,
    getEffectiveState,
    getNodeHeight,
    getNodeWidth,
    useBlockRegistry,
} from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { JsonViewer, MarkdownViewer, isMarkdownContent } from '@flows/ui-kit';

import { ContentPreviewModal } from './ContentPreviewModal';
import { S3Image } from './S3Image';
import { TooltipContentRenderer } from './TooltipContentRenderer';
import { arePortTypesCompatible, getVisiblePorts, tryParseJson } from '../utils';

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
    onPortTouchStart?: (
        nodeId: string,
        portId: string,
        type: 'input' | 'output',
        portType: string,
        e: React.TouchEvent
    ) => void;
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
    /** Port was just updated via WebSocket */
    isUpdated?: boolean;
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
    onTouchStart?: (
        nodeId: string,
        portId: string,
        type: 'input' | 'output',
        portType: string,
        e: React.TouchEvent
    ) => void;
}

const PortItem: React.FC<PortItemProps> = ({
    port,
    type,
    nodeId,
    isHighlighted,
    isConnected,
    isUpdated,
    portData,
    connectionDraft,
    onMouseDown,
    onMouseUp,
    onTouchStart,
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
        // Updated state (port data just received) - subtle cyan ring
        !isHighlighted && isUpdated && 'scale-110 ring-2 ring-cyan-400 z-20',
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
            data-port-node-id={nodeId}
            data-port-id={port.id}
            data-port-type={type}
            data-port-data-type={port.type}
            onMouseDown={e => {
                e.stopPropagation();
                onMouseDown(nodeId, port.id, type, port.type, e);
            }}
            onMouseUp={e => {
                e.stopPropagation();
                onMouseUp(nodeId, port.id, type, port.type);
            }}
            onTouchStart={e => {
                e.stopPropagation();
                onTouchStart?.(nodeId, port.id, type, port.type, e);
            }}
            onTouchEnd={e => {
                // For output ports, let the event bubble to canvas for connection drop handling
                // Touch events fire touchend on the element where touch STARTED, not where it ended
                if (type === 'output') {
                    // Don't stop propagation - let canvas handle the connection drop
                    return;
                }
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

    // Tooltip positioning: input ports show tooltip to LEFT, output ports show tooltip to RIGHT
    // This prevents tooltip from visually covering the port, making drag operations easier
    const hasRichContent =
        portData &&
        (portData.type === 'json' ||
            portData.type === 'markdown' ||
            (portData.value !== null && typeof portData.value === 'object') ||
            isMarkdownContent(portData.value));

    // Horizontal positioning based on port type
    const horizontalPosition = isInputPort
        ? 'right-full mr-2' // Input ports: tooltip to the left
        : 'left-full ml-2'; // Output ports: tooltip to the right

    // Width constraints based on content type
    const widthConstraint =
        !portData || portData.type === 'image'
            ? 'whitespace-nowrap'
            : hasRichContent
              ? 'min-w-[150px] max-w-[400px]'
              : 'min-w-[100px] max-w-[400px]';

    return (
        <div className="relative group flex items-center justify-center w-3 h-6">
            {portCircle}

            {/* Tooltip showing port label and data on hover - positioned away from port */}
            <div
                className={cn(
                    'absolute top-1/2 -translate-y-1/2 bg-popover/95 backdrop-blur-sm text-popover-foreground text-[9px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none border border-border z-50 shadow-lg transition-opacity duration-150',
                    horizontalPosition,
                    widthConstraint
                )}
            >
                <div className="flex items-center gap-1">
                    {PortIcon && <PortIcon className="w-2.5 h-2.5 shrink-0" />}
                    <span className="font-semibold uppercase tracking-wider">{port.label}</span>
                </div>
                {portData && (
                    <div className="mt-1 pt-1 border-t border-border/50">
                        <TooltipContentRenderer
                            content={portData.value}
                            type={portData.type}
                            maxHeight={80}
                            collapsed={1}
                            textLimit={100}
                            markdownClassName="text-[10px] [&_h1]:text-xs [&_h2]:text-[11px] [&_h3]:text-[10px] [&_p]:text-[10px] [&_code]:text-[9px]"
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

interface VisualizationProps {
    node: NodeData;
    definition: BlockDefinitionWithFrontend;
    /** Custom content height from node resize */
    contentHeight?: number;
}

/** Get first input data from node using definition's port ID or fallback to first available */
const getFirstInputData = (node: NodeData, definition: BlockDefinitionWithFrontend) => {
    const inputPortId = definition.inputs?.[0]?.id;
    return inputPortId ? node.inputData?.[inputPortId] : Object.values(node.inputData ?? {})[0];
};

const PreviewVisualization: React.FC<VisualizationProps> = ({ node, definition, contentHeight }) => {
    const { t } = useTranslation(['nodes']);
    const [dims, setDims] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const lastInput = getFirstInputData(node, definition);
    const maxH = contentHeight ?? 120;

    if (!lastInput) {
        return (
            <div
                className="text-[10px] text-muted-foreground/60 italic text-center py-6 bg-muted/30 rounded-lg border border-dashed border-border flex items-center justify-center"
                style={{ minHeight: contentHeight ? `${contentHeight}px` : undefined }}
            >
                {t('visualization.waitingForData')}
            </div>
        );
    }

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsModalOpen(true);
    };

    // Render inline preview based on content type
    const renderInlinePreview = () => {
        // Image type
        if (lastInput.type === 'image') {
            return (
                <>
                    <div className="flex justify-center items-center p-2 min-h-[80px]">
                        <S3Image
                            src={String(lastInput.value)}
                            className="max-w-full rounded object-contain"
                            style={{ maxHeight: `${maxH}px` }}
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
            );
        }

        // JSON type (only actual objects, not null/strings)
        if (lastInput.type === 'json' || (lastInput.value !== null && typeof lastInput.value === 'object')) {
            return (
                <div className="p-2" onWheel={e => e.stopPropagation()}>
                    <JsonViewer data={lastInput.value} maxHeight={maxH} collapsed={2} />
                </div>
            );
        }

        // Try to parse JSON string
        const parsedJson = tryParseJson(lastInput.value);
        if (parsedJson) {
            return (
                <div className="p-2" onWheel={e => e.stopPropagation()}>
                    <JsonViewer data={parsedJson} maxHeight={maxH} collapsed={2} />
                </div>
            );
        }

        // Markdown type (explicit type OR auto-detected from content)
        const strValue = String(lastInput.value ?? '');
        if (lastInput.type === 'markdown' || isMarkdownContent(strValue)) {
            return (
                <div className="p-2" onWheel={e => e.stopPropagation()}>
                    <MarkdownViewer content={strValue} maxHeight={maxH} />
                </div>
            );
        }

        // Plain text (default)
        const lines = strValue.split('\n').slice(0, 3);
        const truncatedText = lines.join('\n');
        const isTruncated = strValue.split('\n').length > 3 || strValue.length > 150;

        return (
            <div className="text-xs p-3 text-foreground/80 break-words font-mono whitespace-pre-wrap">
                {truncatedText.slice(0, 150)}
                {isTruncated && <span className="text-muted-foreground">...</span>}
            </div>
        );
    };

    return (
        <>
            <div
                className="rounded-lg border border-border/30 overflow-hidden bg-muted/10 relative cursor-pointer group hover:border-primary/50 transition-colors"
                onClick={handleClick}
                role="button"
                tabIndex={0}
                onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setIsModalOpen(true);
                    }
                }}
            >
                {renderInlinePreview()}
                {/* Expand indicator on hover */}
                <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="bg-black/70 text-white/90 p-1 rounded backdrop-blur-sm">
                        <Expand className="w-3 h-3" />
                    </div>
                </div>
            </div>
            <ContentPreviewModal
                open={isModalOpen}
                onOpenChange={setIsModalOpen}
                content={{ value: lastInput.value, type: lastInput.type }}
            />
        </>
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

const DebugLogVisualization: React.FC<VisualizationProps> = ({ node, definition, contentHeight }) => {
    const { t } = useTranslation(['nodes']);
    const lastInput = getFirstInputData(node, definition)?.value;

    // Use custom height or default 112px (max-h-28)
    const maxH = contentHeight ?? 112;

    // Check if content is JSON (object or parseable string)
    const jsonData =
        typeof lastInput === 'object' && lastInput !== null
            ? lastInput
            : typeof lastInput === 'string'
              ? tryParseJson(lastInput)
              : null;

    return (
        <div
            className="p-2 bg-muted/10 rounded-lg border border-border/30 overflow-y-auto"
            style={{ maxHeight: `${maxH}px`, minHeight: contentHeight ? `${contentHeight}px` : undefined }}
            onWheel={e => e.stopPropagation()}
        >
            {lastInput !== undefined ? (
                jsonData ? (
                    <JsonViewer data={jsonData} maxHeight={maxH - 16} collapsed={2} />
                ) : (
                    <div className="text-xs text-foreground/80 break-words whitespace-pre-wrap">
                        {String(lastInput)}
                    </div>
                )
            ) : (
                <span className="text-muted-foreground/50 italic text-[10px]">{t('visualization.waitingForData')}</span>
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

const OutputPreview: React.FC<VisualizationProps> = ({ node, definition, contentHeight }) => {
    const { t } = useTranslation(['nodes']);
    const packet = getFirstOutputData(node, definition);

    // Use custom height or default 180px
    const maxH = contentHeight ?? 180;

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
            <div
                className="text-[10px] text-muted-foreground/60 italic text-center py-4 bg-muted/30 rounded-lg border border-dashed border-border flex items-center justify-center"
                style={{ minHeight: contentHeight ? `${contentHeight}px` : undefined }}
            >
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
                        className="max-w-full rounded object-contain"
                        style={{ maxHeight: `${maxH}px` }}
                        alt="Output"
                    />
                </div>
            </div>
        );
    }

    // JSON type or object value
    if (packet.type === 'json' || (packet.value !== null && typeof packet.value === 'object')) {
        return (
            <div className="p-2 bg-muted/10 rounded-lg border border-border/30" onWheel={e => e.stopPropagation()}>
                <JsonViewer data={packet.value} maxHeight={maxH} collapsed={2} />
            </div>
        );
    }

    // Try to parse JSON string
    const parsedJson = tryParseJson(packet.value);
    if (parsedJson) {
        return (
            <div className="p-2 bg-muted/10 rounded-lg border border-border/30" onWheel={e => e.stopPropagation()}>
                <JsonViewer data={parsedJson} maxHeight={maxH} collapsed={2} />
            </div>
        );
    }

    if (packet.type === 'markdown' || isMarkdownContent(packet.value)) {
        return (
            <div className="p-2 bg-muted/10 rounded-lg border border-border/30" onWheel={e => e.stopPropagation()}>
                <MarkdownViewer content={String(packet.value)} maxHeight={maxH} />
            </div>
        );
    }

    // Text/number/any
    const strValue = String(packet.value);
    return (
        <div
            className="p-2.5 bg-muted/10 rounded-lg border border-border/30 overflow-auto"
            style={{ maxHeight: `${maxH}px` }}
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
    onTouchStart?: (e: React.TouchEvent) => void;
    isDragging?: boolean;
}

export const NodeBlock: React.FC<NodeBlockProps> = ({
    node,
    highlightState,
    portHandlers,
    configHandlers,
    actions,
    onMouseDown,
    onTouchStart,
    isDragging = false,
}) => {
    const { t } = useTranslation(['nodes', 'flows']);
    const blockRegistry = useBlockRegistry();

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
    const { onPortMouseDown, onPortMouseUp, onPortTouchStart } = portHandlers;
    const { onConfigChange, onLabelChange } = configHandlers;
    const { onDelete, onTrigger, onToggleDisabled, onDuplicate, onViewLogs, onResize, onResizing } = actions;

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

    /*
     * [추가] 퍼센테이지 진행률 상태
     *
     * 원본에는 하단에 얇은 줄(1.5px) 형태의 진행 바만 있었고,
     * 숫자로 된 퍼센테이지 표시가 전혀 없었습니다.
     *
     * simulatedProgress: 화면에 표시할 진행률 숫자 (0~100)
     * - 백엔드가 실제 progress 값을 보내주면 그 값을 그대로 사용
     * - 백엔드 값이 없으면 프론트에서 자동으로 애니메이션 (가짜 진행)
     */
    const [simulatedProgress, setSimulatedProgress] = useState(0);

    useEffect(() => {
        // RUNNING 상태가 아니면 진행률을 0으로 초기화하고 종료
        if (nodeState !== 'RUNNING') {
            setSimulatedProgress(0);
            return;
        }

        // 실행 시작 시 0에서 출발
        setSimulatedProgress(0);

        // 200ms마다 진행률을 조금씩 올림
        const interval = window.setInterval(() => {
            setSimulatedProgress(prev => {
                const realProgress = node.executionStats?.progress;

                // 백엔드에서 실제 progress 값이 오면 즉시 그 값으로 교체
                if (realProgress != null && realProgress > 0) return realProgress;

                // 백엔드 값이 없으면: 현재값 + (90 - 현재값) × 4%
                // → 처음엔 빠르게, 갈수록 느리게 올라가며 최대 89.9%에서 멈춤
                // → 100%는 절대 자동으로 도달하지 않음 (완료는 오직 서버 COMPLETED 상태로만)
                const next = prev + (90 - prev) * 0.04;
                return Math.min(next, 89.9);
            });
        }, 200);

        // 컴포넌트 언마운트 또는 상태 변경 시 인터벌 정리
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nodeState]);

    // 백엔드에서 실제 progress 값이 바뀔 때마다 즉시 동기화
    useEffect(() => {
        const realProgress = node.executionStats?.progress;
        if (nodeState === 'RUNNING' && realProgress != null && realProgress > 0) {
            setSimulatedProgress(realProgress);
        }
    }, [nodeState, node.executionStats?.progress]);

    // 소수점 제거 후 화면에 표시할 최종 퍼센테이지 값 (예: 47.3 → 47)
    const displayProgress = Math.round(simulatedProgress);

    const duration = nodeState === 'RUNNING' ? elapsedTime : node.executionStats?.duration;
    const displayDuration =
        duration != null ? (duration > 1000 ? `${(duration / 1000).toFixed(2)}s` : `${duration}ms`) : null;

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

    const statusIconEl = isDisabled ? (
        <Ban className="w-4 h-4 text-muted-foreground" />
    ) : nodeState === 'RUNNING' ? (
        <div
            className="w-4 h-4 rounded-full border-2 border-status-running border-t-transparent animate-spin"
            style={{ animationDuration: '1.2s', animationTimingFunction: 'linear' }}
        />
    ) : nodeState === 'COMPLETED' ? (
        <Check className="w-4 h-4 text-status-completed" />
    ) : nodeState === 'ERROR' ? (
        <div className="w-4 h-4 rounded-full bg-destructive/20 flex items-center justify-center">
            <span className="text-destructive font-bold text-[10px]">!</span>
        </div>
    ) : null;

    return (
        <div
            ref={nodeRef}
            className={cn(
                'absolute bg-node-bg rounded-xl border-[1.5px]',
                !isDragging && !isResizing && 'transition-all duration-200',
                isDisabled && 'opacity-50',
                !isSelected && !isHighlighted && nodeState === 'IDLE' && 'shadow-node',
                // Normal highlight/selection states
                isHighlighted
                    ? 'border-accent/60'
                    : definition.isFrontend && !isSelected && nodeState === 'IDLE'
                      ? 'border-primary/50'
                      : getStatusStyles(nodeState, isSelected)
            )}
            style={{
                left: node.position.x,
                top: node.position.y,
                width: `${currentWidth}px`,
            }}
            onMouseDown={onMouseDown}
            onTouchStart={onTouchStart}
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
                        <div className="w-4 h-4 flex items-center justify-center shrink-0">{statusIconEl}</div>
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
                    {/* Hidden when isRunnable is explicitly false */}
                    {definition?.isRunnable !== false && (definition?.execute || !definition?.isFrontend) && (
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
                        onMouseDown={e => e.stopPropagation()}
                        onTouchStart={e => e.stopPropagation()}
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
                        isUpdated={updatedPortIds.includes(p.id)}
                        portData={node.inputData?.[p.id]}
                        connectionDraft={connectionDraft}
                        onMouseDown={onPortMouseDown}
                        onMouseUp={onPortMouseUp}
                        onTouchStart={onPortTouchStart}
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
                        isUpdated={updatedPortIds.includes(p.id)}
                        portData={node.outputData?.[p.id]}
                        connectionDraft={connectionDraft}
                        onMouseDown={onPortMouseDown}
                        onMouseUp={onPortMouseUp}
                        onTouchStart={onPortTouchStart}
                    />
                ))}
            </div>

            {/* Body - min height based on visible port count or custom height */}
            <div
                className="px-3 py-3"
                style={{
                    minHeight: `${Math.max(
                        Math.max(visibleInputPorts.length, visibleOutputPorts.length) * PORT_LAYOUT.PORT_SPACING,
                        currentHeight ?? 0
                    )}px`,
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
                        React.createElement(VISUALIZATION_COMPONENTS[definition.type], {
                            node,
                            definition,
                            contentHeight: contentAreaHeight,
                        })}

                    {/* Output Preview for process nodes */}
                    <OutputPreview node={node} definition={definition} contentHeight={contentAreaHeight} />
                </div>

                {/* State status text */}
                {(nodeState === 'RUNNING' || nodeState === 'COMPLETED') && (
                    <div
                        className={cn(
                            'mt-2 text-center text-[11px] font-medium py-1.5 rounded-lg border',
                            nodeState === 'RUNNING' &&
                                'text-status-running bg-status-running/10 border-status-running/20',
                            nodeState === 'COMPLETED' &&
                                'text-status-completed bg-status-completed/10 border-status-completed/20'
                        )}
                    >
                        {nodeState === 'RUNNING' && '실행중'}
                        {nodeState === 'COMPLETED' && '완료'}
                    </div>
                )}

                {/* Error Message */}
                {nodeState === 'ERROR' && (
                    <div className="mt-2 text-destructive text-[10px] bg-destructive/10 p-2 rounded-lg border border-destructive/20 flex items-start gap-1.5">
                        <span className="font-semibold shrink-0">오류 발생</span>
                        <span className="opacity-80">{node.errorMessage || t('errors.executionFailed')}</span>
                    </div>
                )}
            </div>

            {/*
             * [변경] Progress Bar (진행률 바)
             *
             * 원본: 블록 맨 아래에 1.5px짜리 얇은 줄만 표시 (숫자 없음)
             * 변경:
             *   1. 퍼센테이지 텍스트 행 추가 (좌: "47%" 또는 "Running...", 우: "47/100")
             *   2. 바 모양을 둥글게 변경 (rounded-full)
             *   3. 배경 영역 추가로 진행률이 더 잘 보이게 개선
             *
             * displayProgress가 0이면 "Running..." 텍스트를 보여주고,
             * 1 이상이면 숫자 퍼센테이지를 보여줍니다.
             */}
            {nodeState === 'RUNNING' && (
                <div className="absolute bottom-0 left-0 w-full bg-muted/30 border-t border-border/20 overflow-hidden">
                    {/* 퍼센테이지 텍스트: 좌측에 "47%", 우측에 "47/100" */}
                    <div className="flex items-center justify-between px-2 pt-1 pb-0.5">
                        <span className="text-[9px] font-mono text-status-running/80 leading-none">
                            {displayProgress > 0 ? `${displayProgress}%` : 'Running...'}
                        </span>
                        {/* progress가 0보다 클 때만 우측 "47/100" 표시 */}
                        {displayProgress > 0 && (
                            <span className="text-[9px] font-mono text-muted-foreground/60 leading-none">
                                {displayProgress}
                                <span className="opacity-60">/100</span>
                            </span>
                        )}
                    </div>
                    {/* 진행률 바: 최소 3% 너비를 보장해 시작 시 바가 보이도록 함 */}
                    <div className="h-1 bg-muted/50 mx-2 mb-1.5 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-status-running rounded-full transition-all duration-200 ease-out"
                            style={{ width: `${Math.max(displayProgress, 3)}%` }}
                        />
                        {/* 빛 반사 shimmer 애니메이션 (원본에서 유지) */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                    </div>
                </div>
            )}

            {/*
             * [변경] Duration Badge (경과 시간 배지)
             *
             * 원본: 항상 우측 하단에 표시 (RUNNING 중에도 표시)
             * 변경: RUNNING 중에는 숨김 → Progress Bar 영역과 겹치지 않도록
             *        실행 완료(COMPLETED/ERROR) 후에만 표시됨
             */}
            {displayDuration && nodeState !== 'RUNNING' && (
                <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-sm text-[9px] text-white/90 px-1.5 py-0.5 rounded font-mono pointer-events-none">
                    {displayDuration}
                </div>
            )}

            {/* Resize Handle - Bottom Right Corner */}
            {onResize && (
                <div
                    className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize group z-10"
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
};
