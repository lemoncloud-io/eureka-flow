import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
    Braces,
    Check,
    ChevronDown,
    ChevronUp,
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
    useNodeTraceLogs,
} from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { JsonViewer, MarkdownViewer, isMarkdownContent } from '@flows/ui-kit';

import { ContentPreviewModal } from './ContentPreviewModal';
import { FilePreviewDialog } from './FilePreviewDialog';
import { S3Image } from './S3Image';
import { TooltipContentRenderer } from './TooltipContentRenderer';
import {
    INPUT_FILE_ACCEPT,
    arePortTypesCompatible,
    clearFileConfig,
    getPortStyleKey,
    getVisiblePorts,
    processUploadedFile,
    tryParseJson,
} from '../utils';

import type { ConnectionDraftInfo } from '../utils';
import type {
    BlockDefinitionWithFrontend,
    DataPacket,
    NodeData,
    NodeState,
    PortDefinition,
    TraceEntry,
    TraceStage,
} from '@flows/flows';

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
    onTrigger: (options?: { propagate?: boolean }) => Promise<void> | void;
    onDuplicate?: () => void;

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
/** Duration badge auto-hide timing (ms) */
const DURATION_BADGE_VISIBLE_MS = 1000;
const DURATION_BADGE_FADE_MS = 500;

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
    const [isFilePreviewOpen, setIsFilePreviewOpen] = useState(false);

    const img = node.config?.imageData as string | undefined;
    const fileData = node.config?.fileData as string | undefined;
    const fileName = node.config?.fileName as string | undefined;
    const fileInputId = `inline-image-${node.id}`;

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            await processUploadedFile(file, onConfigChange, async dataUrl => {
                const { dataUrl: compressed } = await compressImageIfNeeded(dataUrl);
                return compressed;
            });
        } finally {
            setIsUploading(false);
        }
        e.target.value = '';
    };

    const handleFileDelete = () => {
        clearFileConfig(onConfigChange);
    };

    const handleFileEdit = (newDataUrl: string) => {
        onConfigChange('fileData', newDataUrl);
    };

    return (
        <div
            onMouseDown={e => e.stopPropagation()}
            onDoubleClick={e => e.stopPropagation()}
            onWheel={e => e.stopPropagation()}
        >
            <input
                type="file"
                accept={INPUT_FILE_ACCEPT}
                className="hidden"
                id={fileInputId}
                onChange={handleFileUpload}
            />
            {isUploading ? (
                <div className="rounded-lg border border-dashed border-primary/60 overflow-hidden bg-black/20 h-24 flex items-center justify-center">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                        <Loader2 className="w-4 h-4 text-primary animate-spin" />
                    </div>
                </div>
            ) : img && !fileData ? (
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
            ) : fileData ? (
                <div className="relative group rounded-lg border border-border overflow-hidden bg-black/20">
                    <button
                        type="button"
                        onClick={() => setIsFilePreviewOpen(true)}
                        className="w-full flex items-center gap-2 p-3 text-left hover:bg-black/30 transition-colors"
                    >
                        <ScrollText className="w-4 h-4 text-primary shrink-0" />
                        <span className="text-[11px] text-foreground/80 truncate flex-1">{fileName || 'file'}</span>
                        <Expand className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                    <button
                        onClick={e => {
                            e.stopPropagation();
                            e.preventDefault();
                            handleFileDelete();
                        }}
                        className="absolute top-1.5 right-1.5 p-1 bg-black/60 hover:bg-black/80 text-white rounded-md border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
                        title={t('visualization.removeImage')}
                    >
                        <X className="w-3 h-3" />
                    </button>
                    <FilePreviewDialog
                        open={isFilePreviewOpen}
                        onOpenChange={setIsFilePreviewOpen}
                        fileData={fileData}
                        fileName={fileName || 'file'}
                        onDelete={handleFileDelete}
                        onEdit={handleFileEdit}
                    />
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

// ============================================================================
// Agent Trace Log Visualization (shows real-time agent execution stages)
// ============================================================================

const STAGE_STYLES = {
    run: { label: 'RUN', color: 'text-blue-400' },
    planner: { label: 'PLAN', color: 'text-violet-400' },
    step: { label: 'STEP', color: 'text-cyan-400' },
    tool: { label: 'TOOL', color: 'text-amber-400' },
    approval: { label: 'APPROVE', color: 'text-yellow-300' },
    reflector: { label: 'REFLECT', color: 'text-pink-400' },
    finalizer: { label: 'FINAL', color: 'text-emerald-400' },
    trace: { label: 'TRACE', color: 'text-muted-foreground' },
    error: { label: 'ERROR', color: 'text-red-400' },
    runtime: { label: 'RUNTIME', color: 'text-orange-400' },
} satisfies Record<TraceStage, { label: string; color: string }>;

/** Extract contextual detail from trace entry data for inline display */
const getTraceDetail = (entry: TraceEntry): string | null => {
    const d = entry.data;
    if (!d) return null;
    if (d['toolName']) return String(d['toolName']);
    if (d['skillName']) return String(d['skillName']);
    if (d['status']) return String(d['status']);
    if (d['mode']) return String(d['mode']);
    return null;
};

const AgentTraceVisualization: React.FC<{ traceLogs: TraceEntry[]; contentHeight?: number }> = ({
    traceLogs,
    contentHeight,
}) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const maxH = contentHeight ?? 160;

    // Auto-scroll to bottom on new entries
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [traceLogs.length]);

    return (
        <div
            ref={scrollRef}
            className="p-2 bg-muted/10 rounded-lg border border-border/30 overflow-y-auto font-mono text-[10px] leading-relaxed"
            style={{ maxHeight: `${maxH}px`, minHeight: contentHeight ? `${contentHeight}px` : '80px' }}
            onWheel={e => e.stopPropagation()}
        >
            {traceLogs.map((entry, i) => {
                const stage = entry.stage as TraceStage | undefined;
                const style = (stage && STAGE_STYLES[stage]) ?? STAGE_STYLES.trace;
                const detail = getTraceDetail(entry);
                return (
                    <div key={`${entry.seq}-${i}`} className="flex gap-1.5 py-0.5">
                        <span className={cn('shrink-0 font-semibold min-w-[4rem] text-right', style.color)}>
                            {style.label}
                        </span>
                        <span className="text-foreground/70 break-words whitespace-pre-wrap">
                            {entry.message ?? ''}
                            {detail && <span className="text-muted-foreground/50">{` · ${detail}`}</span>}
                        </span>
                    </div>
                );
            })}
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
    isCollapsed?: boolean;
    onToggleCollapsed?: () => void;
}

/** Renders status indicator icon for node execution state */
const StatusIcon: React.FC<{ state: NodeState }> = ({ state }) => {
    switch (state) {
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

/** Paired run buttons for process nodes: "Run This Only" + "Run & Propagate" */
const ProcessRunButtons: React.FC<{
    isRunning: boolean;
    onRun: (options: { propagate: boolean }) => void;
    t: (key: string) => string;
    variant: 'compact' | 'full';
}> = ({ isRunning, onRun, t, variant }) => {
    const [showMenu, setShowMenu] = useState(false);
    const icon = isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />;

    if (variant === 'full') {
        return (
            <div className="flex gap-1.5" onMouseDown={e => e.stopPropagation()}>
                <button
                    onClick={() => onRun({ propagate: false })}
                    disabled={isRunning}
                    className={cn(
                        'flex-1 text-[11px] py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 font-medium',
                        isRunning
                            ? 'bg-muted/30 text-muted-foreground border border-muted cursor-not-allowed'
                            : 'bg-primary/15 hover:bg-primary/25 text-primary border border-primary/20'
                    )}
                >
                    {icon}
                    {t('actions.runThisOnly')}
                </button>
                <button
                    onClick={() => onRun({ propagate: true })}
                    disabled={isRunning}
                    className={cn(
                        'flex-1 text-[11px] py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 font-medium',
                        isRunning
                            ? 'bg-muted/30 text-muted-foreground border border-muted cursor-not-allowed'
                            : 'bg-green-500/15 hover:bg-green-500/25 text-green-600 dark:text-green-400 border border-green-500/20'
                    )}
                >
                    {icon}
                    {t('actions.runAndPropagate')}
                </button>
            </div>
        );
    }

    // compact: single button [▶] that opens dropdown on click (same size as input run button)
    return (
        <div className="relative">
            <button
                onClick={e => {
                    e.stopPropagation();
                    setShowMenu(prev => !prev);
                }}
                onMouseDown={e => e.stopPropagation()}
                disabled={isRunning}
                className={cn(
                    'w-6 h-6 rounded-md flex items-center justify-center transition-all',
                    isRunning
                        ? 'bg-muted/30 text-muted-foreground cursor-not-allowed'
                        : 'bg-primary/10 hover:bg-primary/20 text-primary'
                )}
                title={t('actions.runOptions')}
            >
                {icon}
            </button>
            {showMenu && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={e => {
                            e.stopPropagation();
                            setShowMenu(false);
                        }}
                        onMouseDown={e => e.stopPropagation()}
                    />
                    <div className="absolute top-full right-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[140px]">
                        <button
                            className="w-full px-3 py-1.5 text-[11px] text-left hover:bg-muted/50 flex items-center gap-2 transition-colors"
                            onClick={e => {
                                e.stopPropagation();
                                setShowMenu(false);
                                onRun({ propagate: false });
                            }}
                            onMouseDown={e => e.stopPropagation()}
                        >
                            <Play className="w-3 h-3 text-primary" />
                            {t('actions.runThisOnly')}
                        </button>
                        <button
                            className="w-full px-3 py-1.5 text-[11px] text-left hover:bg-muted/50 flex items-center gap-2 transition-colors"
                            onClick={e => {
                                e.stopPropagation();
                                setShowMenu(false);
                                onRun({ propagate: true });
                            }}
                            onMouseDown={e => e.stopPropagation()}
                        >
                            <Play className="w-3 h-3 text-green-500" />
                            {t('actions.runAndPropagate')}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

export const NodeBlock: React.FC<NodeBlockProps> = ({
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
    const { onDelete, onTrigger, onDuplicate, onResize, onResizing } = actions;

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
                        <div className="w-4 h-4 flex items-center justify-center shrink-0">
                            <StatusIcon state={nodeState} />
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
                        ) : null)}
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
                                {/* Run options for process nodes */}
                                {isProcessNode &&
                                    definition?.isRunnable !== false &&
                                    (definition?.execute || !definition?.isFrontend) && (
                                        <>
                                            <div className="h-px bg-border/50 my-0.5" />
                                            <button
                                                onClick={e => {
                                                    e.stopPropagation();
                                                    setShowMenu(false);
                                                    handleRun({ propagate: false });
                                                }}
                                                disabled={isRunning}
                                                className="text-left px-3 py-1.5 text-xs text-foreground hover:bg-accent/50 flex items-center gap-2 transition-colors disabled:opacity-50"
                                            >
                                                <Play className="w-3 h-3 text-primary" /> {t('actions.runThisOnly')}
                                            </button>
                                            <button
                                                onClick={e => {
                                                    e.stopPropagation();
                                                    setShowMenu(false);
                                                    handleRun({ propagate: true });
                                                }}
                                                disabled={isRunning}
                                                className="text-left px-3 py-1.5 text-xs text-foreground hover:bg-accent/50 flex items-center gap-2 transition-colors disabled:opacity-50"
                                            >
                                                <Play className="w-3 h-3 text-green-500" />{' '}
                                                {t('actions.runAndPropagate')}
                                            </button>
                                        </>
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
                        className="text-muted-foreground/60 hover:text-destructive w-6 h-6 flex items-center justify-center rounded-md hover:bg-destructive/10 transition-all"
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
                </>
            )}

            {/* Body - hidden when collapsed */}
            {!isCollapsed && (
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
                                        <Play className="w-3 h-3" />
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
};
