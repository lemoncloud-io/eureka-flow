import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Ban, Copy, MoreVertical, Pencil, Play, RefreshCw, ScrollText, X, Zap } from 'lucide-react';

import { compressImageIfNeeded, useBlockRegistry } from '@flows/flows';
import { cn } from '@flows/lib/utils';

import { S3Image } from './S3Image';

import type { NodeData, PortDefinition } from '@flows/flows';

type ConfigValue = string | number | boolean | string[] | null;

type NodeStatus = 'IDLE' | 'RUNNING' | 'COMPLETED' | 'ERROR';

interface StatusVisual {
    border: string;
    header: string;
    icon: React.ReactNode;
    textColor: string;
}

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

export interface NodeHighlightState {
    isSelected: boolean;
    isHighlighted?: boolean;
    highlightedPortIds?: string[];
}

const createStatusVisuals = (isSelected: boolean): Record<NodeStatus, StatusVisual> => ({
    RUNNING: {
        border: isSelected ? 'border-status-running/60 shadow-node-selected' : 'border-status-running/40 shadow-node',
        header: 'bg-node-header',
        icon: (
            <div className="absolute inset-0 border-[1.5px] border-status-running border-t-transparent rounded-full animate-spin"></div>
        ),
        textColor: 'text-foreground',
    },
    COMPLETED: {
        border: isSelected
            ? 'border-status-completed/60 shadow-node-selected'
            : 'border-status-completed/40 shadow-node',
        header: 'bg-node-header',
        icon: <div className="text-status-completed font-bold text-[10px]">✓</div>,
        textColor: 'text-foreground',
    },
    ERROR: {
        border: isSelected ? 'border-status-error/60 shadow-node-selected' : 'border-status-error/40 shadow-node',
        header: 'bg-node-header',
        icon: <div className="text-status-error font-bold text-[10px]">!</div>,
        textColor: 'text-foreground',
    },
    IDLE: {
        border: isSelected
            ? 'border-primary/50 shadow-node-selected'
            : 'border-node-border/30 hover:border-muted-foreground/40 shadow-node',
        header: 'bg-node-header',
        icon: null,
        textColor: 'text-foreground',
    },
});

const HIGHLIGHTED_VISUAL: StatusVisual = {
    border: 'border-accent/50 shadow-node-selected',
    header: 'bg-node-header',
    icon: null,
    textColor: 'text-accent',
};

const DISABLED_VISUAL: StatusVisual = {
    border: 'border-muted-foreground/15 opacity-50 shadow-none',
    header: 'bg-muted/30',
    icon: <Ban className="w-3 h-3 text-muted-foreground" />,
    textColor: 'text-muted-foreground',
};

interface PortItemProps {
    port: PortDefinition;
    type: 'input' | 'output';
    nodeId: string;
    hasData: boolean;
    isHighlighted: boolean;
    onMouseDown: (
        nodeId: string,
        portId: string,
        type: 'input' | 'output',
        portType: string,
        e: React.MouseEvent
    ) => void;
    onMouseUp: (nodeId: string, portId: string, type: 'input' | 'output', portType: string) => void;
}

const PortItem: React.FC<PortItemProps> = ({ port, type, nodeId, hasData, isHighlighted, onMouseDown, onMouseUp }) => {
    const portClasses = cn(
        'w-3.5 h-3.5 rounded-full border-2 cursor-crosshair transition-all duration-200',
        type === 'input' ? 'mr-2' : 'ml-2',
        isHighlighted && 'scale-150 border-primary bg-primary ring-2 ring-primary/40',
        !isHighlighted && 'hover:scale-125',
        hasData &&
            !isHighlighted &&
            type === 'input' &&
            'bg-success/80 border-success shadow-[0_0_6px_rgba(34,197,94,0.4)]',
        hasData &&
            !isHighlighted &&
            type === 'output' &&
            'bg-primary/80 border-primary shadow-[0_0_6px_rgba(139,92,246,0.4)]',
        !hasData && !isHighlighted && 'bg-port-empty border-muted-foreground/40 hover:border-muted-foreground'
    );

    return (
        <div
            className={cn('flex items-center h-6 relative group', type === 'output' ? 'justify-end' : 'justify-start')}
            onMouseUp={e => {
                e.stopPropagation();
                onMouseUp(nodeId, port.id, type, port.type);
            }}
        >
            {type === 'input' && (
                <div
                    className={portClasses}
                    onMouseDown={e => {
                        e.stopPropagation();
                        onMouseDown(nodeId, port.id, type, port.type, e);
                    }}
                />
            )}
            <span
                className={cn(
                    'text-[10px] uppercase tracking-wider font-semibold select-none transition-colors',
                    isHighlighted ? 'text-primary' : 'text-muted-foreground'
                )}
            >
                {port.label}
            </span>
            {type === 'output' && (
                <div
                    className={portClasses}
                    onMouseDown={e => {
                        e.stopPropagation();
                        onMouseDown(nodeId, port.id, type, port.type, e);
                    }}
                />
            )}

            <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground text-[9px] px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 pointer-events-none border border-border z-50 whitespace-nowrap shadow-lg transition-opacity duration-200 delay-100">
                {port.type}
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
            <div className="mt-2 text-xs text-background/60 italic text-center py-4 bg-foreground/60 rounded border border-border">
                {t('visualization.waitingForData')}
            </div>
        );
    }

    return (
        <div className="mt-2 p-1 bg-background rounded border border-border flex justify-center items-center min-h-[40px] relative">
            {lastInput.type === 'image' ? (
                <>
                    <S3Image
                        src={lastInput.value as string}
                        className="max-w-full max-h-32 rounded"
                        alt="Preview"
                        onLoad={e => setDims(`${e.currentTarget.naturalWidth}x${e.currentTarget.naturalHeight}`)}
                    />
                    {dims && (
                        <div className="absolute bottom-1 right-1 bg-foreground/80 text-[9px] text-background px-1.5 py-0.5 rounded backdrop-blur-sm shadow-sm pointer-events-none">
                            {dims}
                        </div>
                    )}
                </>
            ) : (
                <div className="text-xs p-2 text-foreground break-words w-full text-center">
                    {String(lastInput.value)}
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
    const img = node.config.imageData as string | undefined;
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
            className="mt-2"
            onMouseDown={e => e.stopPropagation()}
            onDoubleClick={e => e.stopPropagation()}
            onWheel={e => e.stopPropagation()}
        >
            <input type="file" accept="image/*" className="hidden" id={fileInputId} onChange={handleImageUpload} />
            <label
                htmlFor={fileInputId}
                className="block rounded border border-border overflow-hidden bg-foreground/60 h-20 cursor-pointer hover:border-primary transition-colors"
                title={t('visualization.clickToUpload')}
            >
                {img ? (
                    <S3Image src={img} className="h-full w-full object-cover" alt="Input" />
                ) : (
                    <div className="h-full flex items-center justify-center">
                        <span className="text-[9px] text-background/60 italic">{t('visualization.clickToUpload')}</span>
                    </div>
                )}
            </label>
            {img && (
                <button
                    onClick={e => {
                        e.stopPropagation();
                        e.preventDefault();
                        onConfigChange('imageData', '');
                    }}
                    className="mt-1 w-full text-[9px] py-1 bg-destructive/20 text-destructive rounded hover:bg-destructive/40 transition-colors flex items-center justify-center gap-1"
                >
                    <X className="w-3 h-3" />
                    {t('visualization.removeImage')}
                </button>
            )}
        </div>
    );
};

const InputTextVisualizationEditable: React.FC<EditableVisualizationProps> = ({ node, onConfigChange }) => {
    const { t } = useTranslation(['nodes']);
    const [isEditing, setIsEditing] = useState(false);
    const text = (node.config.text as string) || '';

    const textDisplay = useMemo(() => {
        if (!text) return null;
        const lines = text.split('\n');
        return { firstLine: lines[0], extraLines: lines.length - 1 };
    }, [text]);

    if (isEditing) {
        return (
            <div
                className="mt-2"
                onMouseDown={e => e.stopPropagation()}
                onDoubleClick={e => e.stopPropagation()}
                onWheel={e => e.stopPropagation()}
            >
                <textarea
                    autoFocus
                    className="w-full p-2 bg-background border border-primary rounded text-xs resize-none font-mono focus:outline-none"
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
            className="mt-2 p-2 bg-background rounded border border-border hover:border-primary cursor-text transition-colors"
            onClick={e => {
                e.stopPropagation();
                setIsEditing(true);
            }}
            onDoubleClick={e => e.stopPropagation()}
            onWheel={e => e.stopPropagation()}
            title={t('visualization.clickToEdit')}
        >
            <div className="text-[9px] text-muted-foreground mb-0.5 uppercase tracking-wider font-semibold">
                {t('visualization.value')}
            </div>
            <div className="text-xs text-foreground/80 font-mono flex items-center gap-1" title={text}>
                {textDisplay ? (
                    <>
                        <span className="truncate">"{textDisplay.firstLine}"</span>
                        {textDisplay.extraLines > 0 && (
                            <span className="text-muted-foreground text-[9px] shrink-0">+{textDisplay.extraLines}</span>
                        )}
                    </>
                ) : (
                    <span className="text-muted-foreground italic">{t('visualization.clickToAddText')}</span>
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
            className="mt-2 p-2 bg-foreground rounded border border-border text-background font-mono text-[10px] break-all max-h-24 overflow-y-auto"
            onWheel={e => e.stopPropagation()}
        >
            {lastInput !== undefined ? (
                typeof lastInput === 'object' ? (
                    JSON.stringify(lastInput, null, 2)
                ) : (
                    String(lastInput)
                )
            ) : (
                <span className="text-background/50 italic">{t('visualization.waitingForData')}</span>
            )}
        </div>
    );
};

const VISUALIZATION_COMPONENTS: Record<string, React.FC<{ node: NodeData }>> = {
    'debug-log': DebugLogVisualization,
    preview: PreviewVisualization,
};

interface NodeBlockProps {
    node: NodeData;
    highlightState: NodeHighlightState;
    portHandlers: NodePortHandlers;
    configHandlers: NodeConfigHandlers;
    actions: NodeActions;
    onMouseDown: (e: React.MouseEvent) => void;
}

export const NodeBlock: React.FC<NodeBlockProps> = ({
    node,
    highlightState,
    portHandlers,
    configHandlers,
    actions,
    onMouseDown,
}) => {
    const { t } = useTranslation(['nodes', 'flows']);
    const blockRegistry = useBlockRegistry();
    const definition = blockRegistry[node.type];

    const { isSelected, isHighlighted, highlightedPortIds = [] } = highlightState;
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
        if (node.status === 'RUNNING' && node.executionStats?.startTime) {
            interval = window.setInterval(() => {
                setElapsedTime(Date.now() - node.executionStats!.startTime!);
            }, 100);
        } else {
            setElapsedTime(null);
        }
        return () => clearInterval(interval);
    }, [node.status, node.executionStats?.startTime]);

    const statusVisuals = useMemo(() => createStatusVisuals(isSelected), [isSelected]);

    const visuals = useMemo((): StatusVisual => {
        if (isDisabled) return DISABLED_VISUAL;
        if (isHighlighted) return HIGHLIGHTED_VISUAL;
        return statusVisuals[node.status as NodeStatus] || statusVisuals.IDLE;
    }, [isDisabled, isHighlighted, statusVisuals, node.status]);

    const descriptionDisplay = useMemo(() => {
        const text = node.description || definition?.description || '';
        const lines = text.split('\n');
        return { full: text, firstLine: lines[0], extraLines: lines.length - 1 };
    }, [node.description, definition?.description]);

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

    return (
        <div
            className={cn(
                'absolute w-[280px] bg-node-bg rounded-xl border transition-all duration-300',
                visuals.border
            )}
            style={{ left: node.position.x, top: node.position.y }}
            onMouseDown={onMouseDown}
            onDoubleClick={e => e.stopPropagation()}
        >
            {/* Header */}
            <div
                className={cn(
                    visuals.header,
                    'px-3 py-2 rounded-t-[10px] flex justify-between items-center',
                    'border-b border-node-border/50 cursor-move h-11 box-border',
                    'transition-colors duration-300'
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
                            className="w-full bg-background/80 text-foreground text-xs px-1 py-0.5 rounded border border-primary outline-none"
                            placeholder={t('flows:detailPanel.labelPlaceholder')}
                        />
                    </div>
                ) : (
                    <div
                        className="flex items-center overflow-hidden"
                        onDoubleClick={e => {
                            e.stopPropagation();
                            setIsEditingLabel(true);
                        }}
                        title={t('config.doubleClickRename')}
                    >
                        <div className="w-3 h-3 mr-1 relative flex items-center justify-center shrink-0">
                            {visuals.icon}
                        </div>
                        <div className="flex flex-col overflow-hidden">
                            <span className={cn('font-bold text-sm truncate', visuals.textColor)}>
                                {node.customLabel || definition.label}
                            </span>
                            {node.customLabel && (
                                <span className="text-[9px] text-muted-foreground truncate -mt-0.5 font-mono opacity-80">
                                    {definition.label}
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-1 relative shrink-0">
                    <button
                        onClick={e => {
                            e.stopPropagation();
                            onToggleAuto();
                        }}
                        className={cn(
                            'w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 transition-colors',
                            isAuto ? 'text-primary' : 'text-muted-foreground'
                        )}
                        title={isAuto ? t('autoExecution.on') : t('autoExecution.off')}
                    >
                        {isAuto ? <Zap className="w-3.5 h-3.5" /> : <span className="text-xs font-mono">M</span>}
                    </button>

                    <button
                        onClick={e => {
                            e.stopPropagation();
                            setShowMenu(!showMenu);
                        }}
                        className="text-muted-foreground hover:text-foreground w-6 h-6 flex items-center justify-center rounded hover:bg-white/10"
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
                                className="absolute right-0 top-7 w-36 bg-popover border border-border rounded shadow-xl z-50 flex flex-col py-1 animate-in fade-in zoom-in-95 duration-100"
                                onWheel={e => e.stopPropagation()}
                            >
                                <button
                                    onClick={e => {
                                        e.stopPropagation();
                                        setShowMenu(false);
                                        setIsEditingLabel(true);
                                    }}
                                    className="text-left px-3 py-2 text-xs text-foreground hover:bg-accent flex items-center gap-2"
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
                                        className="text-left px-3 py-2 text-xs text-foreground hover:bg-accent flex items-center gap-2"
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
                                        className="text-left px-3 py-2 text-xs text-foreground hover:bg-accent flex items-center gap-2"
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
                                        className="text-left px-3 py-2 text-xs text-foreground hover:bg-accent flex items-center gap-2"
                                    >
                                        <RefreshCw className="w-3 h-3" /> {t('contextMenu.retry')}
                                    </button>
                                )}
                                <div className="border-t border-border my-1" />
                                <button
                                    onClick={e => {
                                        e.stopPropagation();
                                        setShowMenu(false);
                                        onViewLogs();
                                    }}
                                    className="text-left px-3 py-2 text-xs text-foreground hover:bg-accent flex items-center gap-2"
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
                        className="text-muted-foreground hover:text-destructive w-6 h-6 flex items-center justify-center rounded hover:bg-white/10"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Body */}
            <div className="p-3 pb-6">
                <p
                    className="text-[10px] text-muted-foreground mb-3 h-3 overflow-hidden text-ellipsis whitespace-nowrap cursor-help"
                    title={descriptionDisplay.full}
                >
                    {descriptionDisplay.firstLine}
                    {descriptionDisplay.extraLines > 0 && (
                        <span className="text-muted-foreground/60 ml-1">+{descriptionDisplay.extraLines} lines</span>
                    )}
                </p>
                {/* Ports */}
                <div className="flex justify-between gap-4 mb-2">
                    <div className="flex flex-col gap-1 min-w-[40%]">
                        {definition.inputs.map(p => (
                            <PortItem
                                key={p.id}
                                port={p}
                                type="input"
                                nodeId={node.id}
                                hasData={!!node.inputData[p.id]}
                                isHighlighted={highlightedPortIds.includes(p.id)}
                                onMouseDown={onPortMouseDown}
                                onMouseUp={onPortMouseUp}
                            />
                        ))}
                    </div>
                    <div className="flex flex-col gap-1 items-end min-w-[40%]">
                        {definition.outputs.map(p => (
                            <PortItem
                                key={p.id}
                                port={p}
                                type="output"
                                nodeId={node.id}
                                hasData={!!node.outputData[p.id]}
                                isHighlighted={highlightedPortIds.includes(p.id)}
                                onMouseDown={onPortMouseDown}
                                onMouseUp={onPortMouseUp}
                            />
                        ))}
                    </div>
                </div>
                <div className="border-t border-border/50 mt-1 pt-1">
                    {(node.type.startsWith('input-') || !isAuto) && (
                        <button
                            onClick={onTrigger}
                            className={cn(
                                'mt-2 w-full text-xs py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1.5 font-medium',
                                !isAuto && definition.inputs.every(p => node.inputData[p.id])
                                    ? 'bg-warning/90 hover:bg-warning text-warning-foreground'
                                    : 'bg-primary/90 hover:bg-primary text-primary-foreground'
                            )}
                            onMouseDown={e => e.stopPropagation()}
                        >
                            <Play className="w-3 h-3" />{' '}
                            {node.type.startsWith('input-') ? t('actions.run') : t('actions.forceRun')}
                        </button>
                    )}

                    {node.type === 'input-text' && (
                        <InputTextVisualizationEditable node={node} onConfigChange={onConfigChange} />
                    )}
                    {node.type === 'input-image' && (
                        <InputImageVisualizationEditable node={node} onConfigChange={onConfigChange} />
                    )}
                    {VISUALIZATION_COMPONENTS[node.type] &&
                        React.createElement(VISUALIZATION_COMPONENTS[node.type], { node })}
                </div>
                {node.status === 'ERROR' && (
                    <div className="mt-2 text-destructive text-[10px] bg-destructive/10 p-2 rounded border border-destructive/30 flex items-start gap-1 animate-in fade-in slide-in-from-top-1">
                        <span className="font-bold">{t('flows:nodeBlock.error')}</span>{' '}
                        {node.errorMessage || t('errors.executionFailed')}
                    </div>
                )}
            </div>

            {/* Footer Stats */}
            {(node.status === 'RUNNING' || node.status === 'COMPLETED' || node.status === 'ERROR') && (
                <>
                    {node.status === 'RUNNING' && (
                        <div className="absolute bottom-0 left-0 w-full h-1 bg-muted rounded-b-md overflow-hidden">
                            <div
                                className="h-full bg-primary transition-all duration-300 ease-out"
                                style={{ width: `${node.executionStats?.progress || 0}%` }}
                            />
                        </div>
                    )}

                    {displayDuration && (
                        <div className="absolute bottom-2 right-2 bg-foreground/80 backdrop-blur-md text-[9px] text-background px-1.5 py-0.5 rounded font-mono shadow-sm pointer-events-none z-10">
                            {displayDuration}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};
