import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { Eye, MoreVertical, Pencil, Play, ScrollText, Settings, X, Zap } from 'lucide-react';

import { listFlows, useBlockRegistry } from '@flows/flows';

import type { ConfigField, FlowMeta, NodeData, PortDefinition } from '@flows/flows';

// --- Sub-Components ---

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
    return (
        <div
            className={`flex items-center ${type === 'output' ? 'justify-end' : 'justify-start'} h-6 relative group`}
            onMouseUp={e => {
                e.stopPropagation();
                onMouseUp(nodeId, port.id, type, port.type);
            }}
        >
            {type === 'input' && (
                <div
                    className={`w-3 h-3 rounded-full border mr-2 cursor-crosshair transition-all duration-200
                        ${isHighlighted ? 'scale-150 border-yellow-400 bg-yellow-400 ring-2 ring-yellow-400/50' : 'border-muted-foreground hover:scale-125'}
                        ${hasData && !isHighlighted ? 'bg-port-input shadow-[0_0_8px_rgba(34,197,94,0.6)] border-green-300' : ''}
                        ${!hasData && !isHighlighted ? 'bg-port-empty hover:border-foreground' : ''}
                    `}
                    onMouseDown={e => {
                        e.stopPropagation();
                        onMouseDown(nodeId, port.id, type, port.type, e);
                    }}
                />
            )}
            <span
                className={`text-[10px] uppercase tracking-wider font-semibold select-none transition-colors ${isHighlighted ? 'text-yellow-400' : 'text-muted-foreground'}`}
            >
                {port.label}
            </span>
            {type === 'output' && (
                <div
                    className={`w-3 h-3 rounded-full border ml-2 cursor-crosshair transition-all duration-200
                        ${isHighlighted ? 'scale-150 border-yellow-400 bg-yellow-400 ring-2 ring-yellow-400/50' : 'border-muted-foreground hover:scale-125'}
                        ${hasData && !isHighlighted ? 'bg-port-output shadow-[0_0_8px_rgba(59,130,246,0.6)] border-blue-300' : ''}
                        ${!hasData && !isHighlighted ? 'bg-port-empty hover:border-foreground' : ''}
                    `}
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

// 2. Config Field Renderer
interface ConfigControlProps {
    field: ConfigField;
    value: any;
    nodeId: string;
    onChange: (key: string, value: any) => void;
    onViewComponent?: (flowId: string) => void;
}

const ConfigControl: React.FC<ConfigControlProps> = ({ field, value, nodeId, onChange, onViewComponent }) => {
    const { t } = useTranslation('nodes');
    const [flows, setFlows] = useState<FlowMeta[]>([]);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = evt => evt.target?.result && onChange(field.key, evt.target.result);
            reader.readAsDataURL(file);
        }
    };

    useEffect(() => {
        if (field.type === 'workflow-selector') {
            listFlows().then(setFlows);
        }
    }, [field.type]);

    switch (field.type) {
        case 'text':
        case 'number':
            return (
                <div className="mt-3">
                    <label className="text-xs text-muted-foreground block mb-1 font-semibold">{field.label}</label>
                    <input
                        type={field.type}
                        className="w-full bg-background border border-border rounded p-2 text-sm text-foreground focus:border-primary outline-none"
                        value={value || (field.type === 'number' ? 0 : '')}
                        onChange={e =>
                            onChange(field.key, field.type === 'number' ? parseFloat(e.target.value) : e.target.value)
                        }
                        placeholder={field.placeholder}
                    />
                </div>
            );
        case 'boolean':
            return (
                <div className="mt-3 flex items-center gap-2">
                    <input
                        type="checkbox"
                        className="w-4 h-4 bg-background border border-border rounded text-primary focus:ring-0 cursor-pointer"
                        checked={!!value}
                        onChange={e => onChange(field.key, e.target.checked)}
                    />
                    <label
                        className="text-xs text-muted-foreground cursor-pointer select-none"
                        onClick={() => onChange(field.key, !value)}
                    >
                        {field.label}
                    </label>
                </div>
            );
        case 'select':
            return (
                <div className="mt-3">
                    <label className="text-xs text-muted-foreground block mb-1 font-semibold">{field.label}</label>
                    <select
                        className="w-full bg-background border border-border rounded p-2 text-sm text-foreground focus:border-primary outline-none"
                        value={value}
                        onChange={e => onChange(field.key, e.target.value)}
                    >
                        {field.options?.map(opt => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>
            );
        case 'file':
            return (
                <div className="mt-3 flex flex-col items-center">
                    <label className="text-xs text-muted-foreground w-full mb-1 font-semibold">{field.label}</label>
                    {value ? (
                        <img
                            src={value}
                            className="w-full h-32 object-contain rounded mb-2 border border-border bg-black/50"
                            alt="Preview"
                        />
                    ) : (
                        <div className="w-full h-32 bg-muted/50 border border-dashed border-border rounded mb-2 flex items-center justify-center text-muted-foreground text-xs">
                            {t('visualization.noImageSelected')}
                        </div>
                    )}
                    <div className="flex gap-2 w-full">
                        <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            id={`file-${nodeId}-${field.key}`}
                            onChange={handleImageUpload}
                        />
                        <button
                            onClick={() => document.getElementById(`file-${nodeId}-${field.key}`)?.click()}
                            className="flex-1 bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs py-2 rounded transition-colors"
                        >
                            {t('visualization.chooseFile')}
                        </button>
                        {value && (
                            <button
                                onClick={() => onChange(field.key, '')}
                                className="px-3 bg-destructive/20 hover:bg-destructive/40 text-destructive text-xs py-2 rounded transition-colors flex items-center justify-center"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                </div>
            );
        case 'workflow-selector':
            return (
                <div className="mt-3 space-y-2">
                    <div>
                        <label className="text-xs text-muted-foreground block mb-1 font-semibold">{field.label}</label>
                        <select
                            className="w-full bg-background border border-border rounded p-2 text-sm text-foreground focus:border-primary outline-none"
                            value={value || ''}
                            onChange={e => onChange(field.key, e.target.value)}
                            onFocus={() => listFlows().then(setFlows)}
                        >
                            <option value="">{t('visualization.selectWorkflow')}</option>
                            {flows.map(f => (
                                <option key={f.id} value={f.id}>
                                    {f.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    {value && (
                        <button
                            onClick={() => onViewComponent && onViewComponent(value)}
                            className="w-full bg-indigo-100 dark:bg-indigo-900/50 border border-indigo-300 dark:border-indigo-700 hover:bg-indigo-200 dark:hover:bg-indigo-800 text-indigo-900 dark:text-indigo-100 text-xs py-2 rounded transition-colors flex items-center justify-center gap-1"
                        >
                            <Eye className="w-3 h-3" /> {t('visualization.openWorkflowDesign')}
                        </button>
                    )}
                </div>
            );
        default:
            return null;
    }
};

// 3. Visualization Components

const PreviewVisualization: React.FC<{ node: NodeData }> = ({ node }) => {
    const { t } = useTranslation('nodes');
    const lastInput = node.inputData['in'];
    const [dims, setDims] = useState<string | null>(null);

    if (!lastInput) {
        return (
            <div className="mt-2 text-xs text-muted-foreground italic text-center py-4 bg-muted/30 rounded border border-dashed border-border">
                {t('visualization.waitingForData')}
            </div>
        );
    }

    return (
        <div className="mt-2 p-1 bg-background rounded border border-border flex justify-center items-center min-h-[40px] relative">
            {lastInput.type === 'image' ? (
                <>
                    <img
                        src={lastInput.value}
                        className="max-w-full max-h-32 rounded"
                        alt="Preview"
                        onLoad={e => setDims(`${e.currentTarget.naturalWidth}x${e.currentTarget.naturalHeight}`)}
                    />
                    {dims && (
                        <div className="absolute bottom-1 right-1 bg-black/70 text-[9px] text-white px-1.5 py-0.5 rounded backdrop-blur-sm border border-border shadow-sm pointer-events-none">
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

const InputImageVisualization: React.FC<{ node: NodeData }> = ({ node }) => {
    const { t } = useTranslation('nodes');
    const img = node.config.imageData;
    const [dims, setDims] = useState<string | null>(null);

    return (
        <div className="mt-2 rounded border border-border overflow-hidden bg-black/30 flex justify-center items-center h-20 relative">
            {img ? (
                <>
                    <img
                        src={img}
                        className="h-full w-full object-cover"
                        alt="Input"
                        onLoad={e => setDims(`${e.currentTarget.naturalWidth}x${e.currentTarget.naturalHeight}`)}
                    />
                    {dims && (
                        <div className="absolute bottom-1 right-1 bg-black/70 text-[9px] text-white px-1.5 py-0.5 rounded backdrop-blur-sm border border-border shadow-sm pointer-events-none">
                            {dims}
                        </div>
                    )}
                </>
            ) : (
                <span className="text-[9px] text-muted-foreground">{t('visualization.noImage')}</span>
            )}
        </div>
    );
};

const DebugLogVisualization: React.FC<{ node: NodeData }> = ({ node }) => {
    const { t } = useTranslation('nodes');
    const lastInput = node.inputData['in']?.value;
    return (
        <div className="mt-2 p-2 bg-black/50 rounded border border-border text-success font-mono text-[10px] break-all max-h-24 overflow-y-auto">
            {lastInput !== undefined ? (
                typeof lastInput === 'object' ? (
                    JSON.stringify(lastInput, null, 2)
                ) : (
                    String(lastInput)
                )
            ) : (
                <span className="text-muted-foreground">{t('visualization.waitingForData')}</span>
            )}
        </div>
    );
};

const InputTextVisualization: React.FC<{ node: NodeData }> = ({ node }) => {
    const { t } = useTranslation('nodes');
    const text = node.config.text;
    return (
        <div className="mt-2 p-2 bg-background rounded border border-border group relative">
            <div className="text-[9px] text-muted-foreground mb-0.5 uppercase tracking-wider font-semibold">
                {t('visualization.value')}
            </div>
            <div className="text-xs text-foreground/80 italic truncate font-mono" title={text}>
                {text ? `"${text}"` : <span className="text-muted-foreground">{t('visualization.empty')}</span>}
            </div>
        </div>
    );
};

const VISUALIZATION_COMPONENTS: Record<string, React.FC<{ node: NodeData }>> = {
    'debug-log': DebugLogVisualization,
    preview: PreviewVisualization,
    'input-text': InputTextVisualization,
    'input-image': InputImageVisualization,
};

// --- Main Component ---

interface NodeBlockProps {
    node: NodeData;
    isSelected: boolean;
    isHighlighted?: boolean;
    highlightedPortIds?: string[];
    onMouseDown: (e: React.MouseEvent) => void;
    onPortMouseDown: (
        nodeId: string,
        portId: string,
        type: 'input' | 'output',
        portType: string,
        e: React.MouseEvent
    ) => void;
    onPortMouseUp: (nodeId: string, portId: string, type: 'input' | 'output', portType: string) => void;
    onConfigChange: (key: string, value: any) => void;
    onLabelChange: (label: string) => void;
    onDelete: () => void;
    onTrigger: () => void;
    onToggleAuto: () => void;
    onViewComponent?: (flowId: string) => void;
    onViewLogs: () => void;
}

export const NodeBlock: React.FC<NodeBlockProps> = ({
    node,
    isSelected,
    isHighlighted,
    highlightedPortIds = [],
    onMouseDown,
    onPortMouseDown,
    onPortMouseUp,
    onConfigChange,
    onLabelChange,
    onDelete,
    onTrigger,
    onToggleAuto,
    onViewComponent,
    onViewLogs,
}) => {
    const { t } = useTranslation('nodes');
    const blockRegistry = useBlockRegistry();
    const definition = blockRegistry[node.type];
    const isAuto = node.autoExecutionEnabled !== false;

    const [showConfig, setShowConfig] = useState(false);
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

    const configSchema = useMemo(() => {
        if (!definition) return [];
        if (definition.configSchema) return definition.configSchema;
        return Object.entries(definition.defaultConfig).map(([key, value]): ConfigField => {
            let type: any = 'text';
            if (typeof value === 'number') type = 'number';
            if (typeof value === 'boolean') type = 'boolean';
            return {
                key,
                type,
                label: key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()),
            };
        });
    }, [definition]);

    const STATUS_VISUALS = {
        RUNNING: {
            border: isSelected
                ? 'border-yellow-400 ring-1 ring-primary shadow-[0_0_20px_rgba(234,179,8,0.6)]'
                : 'border-yellow-500 shadow-[0_0_20px_rgba(234,179,8,0.4)]',
            header: 'bg-gradient-to-r from-yellow-900/80 to-node-header',
            icon: (
                <div className="absolute inset-0 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
            ),
            textColor: 'text-yellow-100',
        },
        COMPLETED: {
            border: isSelected
                ? 'border-green-400 ring-2 ring-primary ring-offset-1 ring-offset-background shadow-[0_0_25px_rgba(34,197,94,0.5)]'
                : 'border-green-600 shadow-[0_0_15px_rgba(34,197,94,0.3)]',
            header: 'bg-gradient-to-r from-green-900/80 to-node-header',
            icon: <div className="text-green-400 font-bold text-[10px]">✓</div>,
            textColor: 'text-green-100',
        },
        ERROR: {
            border: isSelected
                ? 'border-red-400 ring-1 ring-primary shadow-[0_0_20px_rgba(239,68,68,0.5)]'
                : 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]',
            header: 'bg-gradient-to-r from-red-900/80 to-node-header',
            icon: <div className="text-red-400 font-bold text-[10px]">!</div>,
            textColor: 'text-red-100',
        },
        IDLE: {
            border: isSelected
                ? 'border-primary ring-1 ring-primary/50 shadow-[0_0_15px_rgba(59,130,246,0.5)]'
                : 'border-node-border hover:border-muted-foreground',
            header: 'bg-node-header',
            icon: null,
            textColor: 'text-foreground',
        },
    };

    const getVisuals = () => {
        if (isHighlighted) {
            return {
                border: 'border-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.5)]',
                header: 'bg-gradient-to-r from-card to-node-header',
                icon: null,
                textColor: 'text-yellow-200',
            };
        }
        return STATUS_VISUALS[node.status] || STATUS_VISUALS.IDLE;
    };

    const visuals = getVisuals();

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

    const ConfigModal = () =>
        createPortal(
            <div
                className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
                onMouseDown={e => e.stopPropagation()}
                onKeyDown={e => e.stopPropagation()}
            >
                <div className="bg-popover border border-border rounded-lg shadow-2xl w-[400px] max-w-[90vw] max-h-[80vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
                    <div className="flex items-center justify-between p-4 border-b border-border bg-muted/50">
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded bg-muted flex items-center justify-center border border-border">
                                <Settings className="w-3 h-3 text-muted-foreground" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-foreground">{definition.label}</h3>
                                <p className="text-[10px] text-muted-foreground">{t('config.noConfigurable')}</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setShowConfig(false)}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="p-4 overflow-y-auto flex-1">
                        <div className="mb-4 pb-4 border-b border-border">
                            <label className="text-xs text-muted-foreground block mb-1 font-semibold">
                                {t('config.doubleClickRename')}
                            </label>
                            <input
                                type="text"
                                className="w-full bg-background border border-border rounded p-2 text-sm text-foreground focus:border-primary outline-none"
                                value={tempLabel}
                                onChange={e => setTempLabel(e.target.value)}
                                onBlur={() => onLabelChange(tempLabel)}
                                placeholder={t('config.doubleClickRename')}
                            />
                        </div>

                        {configSchema.length === 0 ? (
                            <div className="text-center text-muted-foreground py-8 text-xs italic">
                                {t('config.noConfigurable')}
                            </div>
                        ) : (
                            configSchema.map(field => (
                                <ConfigControl
                                    key={field.key}
                                    field={field}
                                    value={node.config[field.key] ?? definition.defaultConfig[field.key]}
                                    nodeId={node.id}
                                    onChange={onConfigChange}
                                    onViewComponent={onViewComponent}
                                />
                            ))
                        )}
                    </div>

                    <div className="p-4 border-t border-border bg-muted/30 flex justify-end">
                        <button
                            onClick={() => setShowConfig(false)}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs px-4 py-2 rounded transition-colors font-semibold"
                        >
                            {t('actions.run')}
                        </button>
                    </div>
                </div>
            </div>,
            document.body
        );

    return (
        <>
            <div
                className={`absolute w-60 bg-node-bg/95 backdrop-blur-sm rounded-lg border-2 transition-all duration-300 ${visuals.border}`}
                style={{ left: node.position.x, top: node.position.y }}
                onMouseDown={onMouseDown}
                onDoubleClick={e => {
                    e.stopPropagation();
                    setShowConfig(true);
                }}
            >
                {/* Header */}
                <div
                    className={`${visuals.header} p-2 rounded-t-md flex justify-between items-center border-b border-border/50 cursor-move h-10 box-border transition-colors duration-300`}
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
                                placeholder="Label..."
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
                                <span className={`font-bold text-sm truncate ${visuals.textColor}`}>
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
                            className={`w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 transition-colors ${isAuto ? 'text-yellow-400' : 'text-muted-foreground'}`}
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
                                />
                                <div className="absolute right-0 top-7 w-32 bg-popover border border-border rounded shadow-xl z-50 flex flex-col py-1 animate-in fade-in zoom-in-95 duration-100">
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
                                    <button
                                        onClick={e => {
                                            e.stopPropagation();
                                            setShowMenu(false);
                                            setShowConfig(true);
                                        }}
                                        className="text-left px-3 py-2 text-xs text-foreground hover:bg-accent flex items-center gap-2"
                                    >
                                        <Settings className="w-3 h-3" /> {t('contextMenu.viewConfig')}
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
                        title={node.description || definition.description}
                    >
                        {node.description || definition.description}
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
                                className={`mt-2 w-full text-xs py-1.5 rounded transition-colors flex items-center justify-center gap-1 font-semibold ${
                                    !isAuto && definition.inputs.every(p => node.inputData[p.id])
                                        ? 'bg-amber-600 dark:bg-amber-700 hover:bg-amber-500 dark:hover:bg-amber-600 text-amber-100 border border-amber-500'
                                        : 'bg-primary hover:bg-primary/90 text-primary-foreground'
                                }`}
                                onMouseDown={e => e.stopPropagation()}
                            >
                                <Play className="w-3 h-3" />{' '}
                                {node.type.startsWith('input-') ? t('actions.run') : t('actions.forceRun')}
                            </button>
                        )}

                        {VISUALIZATION_COMPONENTS[node.type] &&
                            React.createElement(VISUALIZATION_COMPONENTS[node.type], { node })}
                    </div>
                    {node.status === 'ERROR' && (
                        <div className="mt-2 text-destructive text-[10px] bg-destructive/10 p-2 rounded border border-destructive/30 flex items-start gap-1 animate-in fade-in slide-in-from-top-1">
                            <span className="font-bold">Error:</span> {node.errorMessage || t('errors.executionFailed')}
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
                            <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-md text-[9px] text-foreground px-1.5 py-0.5 rounded font-mono border border-border/50 shadow-sm pointer-events-none z-10">
                                {displayDuration}
                            </div>
                        )}
                    </>
                )}
            </div>

            {showConfig && <ConfigModal />}
        </>
    );
};
