import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
    AlertTriangle,
    ArrowDown,
    ArrowDownToLine,
    ArrowUpFromLine,
    ChevronDown,
    ChevronRight,
    FileText,
    Play,
    ScrollText,
    Settings,
    Trash2,
    X,
    Zap,
} from 'lucide-react';

import { compressImageIfNeeded, useBlockRegistry } from '@flows/flows';

import { S3Image } from './S3Image';

import type { BlockDefinition, ConfigField, Connection, DataPacket, NodeData } from '@flows/flows';

interface DetailPanelProps {
    selectedNode: NodeData | null;
    selectedConnection: Connection | null;
    nodes: NodeData[];
    connections: Connection[];
    onConfigChange: (nodeId: string, key: string, value: unknown) => void;
    onDescriptionChange: (nodeId: string, description: string) => void;
    onLabelChange: (nodeId: string, label: string) => void;
    onToggleAuto: (nodeId: string) => void;
    onViewLogs: (nodeId: string) => void;
    onDeleteNode: (nodeId: string) => void;
    onDeleteConnection: (connectionId: string) => void;
    onTriggerNode: (nodeId: string) => void;
    onSelectNode: (nodeId: string) => void;
    onSelectConnection: (connectionId: string) => void;
    onClose: () => void;
}

type ConfigControlType = 'text' | 'number' | 'boolean' | 'select' | 'file' | 'workflow-selector';

const ImagePreview = ({ src, t }: { src: string; t: (key: string) => string }) => {
    const [dims, setDims] = useState<string | null>(null);

    const handleDownload = (e: React.MouseEvent) => {
        e.stopPropagation();
        const link = document.createElement('a');
        link.href = src;
        link.download = `image-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="mt-1.5 relative group">
            <div className="h-28 w-full bg-black/30 rounded-lg border border-border overflow-hidden flex items-center justify-center">
                <S3Image
                    src={src}
                    alt="Data"
                    className="max-h-full max-w-full object-contain"
                    onLoad={e => setDims(`${e.currentTarget.naturalWidth}×${e.currentTarget.naturalHeight}`)}
                />
            </div>

            <div className="absolute bottom-1.5 right-1.5 flex gap-1 pointer-events-none">
                {dims && (
                    <div className="bg-black/70 text-[9px] px-1.5 py-0.5 rounded text-white/90 backdrop-blur-sm font-mono">
                        {dims}
                    </div>
                )}
                <div className="bg-port-image/80 text-[9px] px-1.5 py-0.5 rounded text-white font-semibold backdrop-blur-sm">
                    {t('flows:detailPanel.img')}
                </div>
            </div>

            <button
                onClick={handleDownload}
                className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center bg-black/60 hover:bg-primary text-white rounded-md border border-white/10 opacity-0 group-hover:opacity-100 transition-all"
                title={t('flows:detailPanel.downloadImage')}
            >
                <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
            </button>
        </div>
    );
};

interface CollapsibleSectionProps {
    title: string;
    icon: React.ReactNode;
    iconColor?: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
    title,
    icon,
    iconColor = 'text-muted-foreground',
    defaultOpen = true,
    children,
}) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className="border border-border/50 rounded-lg overflow-hidden bg-muted/20">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full px-3 py-2 flex items-center gap-2 hover:bg-muted/30 transition-colors"
            >
                <span className={iconColor}>{icon}</span>
                <span className="text-xs font-semibold text-foreground/90 uppercase tracking-wider flex-1 text-left">
                    {title}
                </span>
                {isOpen ? (
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                )}
            </button>
            {isOpen && <div className="px-3 pb-3">{children}</div>}
        </div>
    );
};

export const DetailPanel: React.FC<DetailPanelProps> = ({
    selectedNode,
    selectedConnection,
    nodes,
    connections,
    onConfigChange,
    onDescriptionChange,
    onLabelChange,
    onToggleAuto,
    onViewLogs,
    onDeleteNode,
    onDeleteConnection,
    onTriggerNode,
    onSelectNode,
    onSelectConnection,
    onClose,
}) => {
    const { t } = useTranslation(['flows', 'common']);
    const blockRegistry = useBlockRegistry();

    if (!selectedNode && !selectedConnection) return null;

    const renderDataPreview = (packet?: DataPacket) => {
        if (!packet) {
            return (
                <span className="text-muted-foreground/60 italic text-[11px]">
                    {t('flows:detailPanel.emptyWaiting')}
                </span>
            );
        }

        if (packet.type === 'image') {
            return <ImagePreview src={packet.value} t={t} />;
        }
        return (
            <div
                className="bg-black/20 p-2 rounded-md border border-border/50 text-[11px] font-mono text-foreground/80 break-words max-h-20 overflow-y-auto mt-1.5"
                onWheel={e => e.stopPropagation()}
            >
                {typeof packet.value === 'object' ? JSON.stringify(packet.value, null, 2) : String(packet.value)}
            </div>
        );
    };

    const renderConfigInput = (node: NodeData, field: ConfigField, definition: BlockDefinition) => {
        const value = node.config[field.key] ?? definition.defaultConfig[field.key];

        const handleChange = (val: unknown) => onConfigChange(node.id, field.key, val);

        switch (field.type) {
            case 'text':
                return (
                    <textarea
                        className="w-full bg-background/80 border border-border/60 rounded-md px-2.5 py-2 text-xs text-foreground focus:border-primary/60 outline-none transition-colors resize-y min-h-[56px] font-mono"
                        value={value || ''}
                        onChange={e => handleChange(e.target.value)}
                        onKeyDown={e => e.stopPropagation()}
                        placeholder={field.placeholder}
                    />
                );
            case 'number':
                return (
                    <input
                        type="number"
                        className="w-full bg-background/80 border border-border/60 rounded-md px-2.5 py-2 text-xs text-foreground focus:border-primary/60 outline-none transition-colors font-mono"
                        value={value || ''}
                        onChange={e => handleChange(e.target.value)}
                        onKeyDown={e => e.stopPropagation()}
                        placeholder={field.placeholder}
                    />
                );
            case 'boolean':
                return (
                    <div className="flex items-center gap-2.5 mt-1">
                        <button
                            onClick={() => handleChange(!value)}
                            className={`w-9 h-5 rounded-full p-0.5 transition-colors relative ${value ? 'bg-primary' : 'bg-muted'}`}
                        >
                            <div
                                className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${value ? 'translate-x-4' : 'translate-x-0'}`}
                            />
                        </button>
                        <span className={`text-xs ${value ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                            {value ? t('flows:detailPanel.true') : t('flows:detailPanel.false')}
                        </span>
                    </div>
                );
            case 'select':
                return (
                    <select
                        className="w-full bg-background/80 border border-border/60 rounded-md px-2.5 py-2 text-xs text-foreground focus:border-primary/60 outline-none transition-colors"
                        value={value}
                        onChange={e => handleChange(e.target.value)}
                    >
                        {field.options?.map(opt => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                );
            case 'file':
                return (
                    <div className="flex flex-col gap-2">
                        {value && (
                            <div className="w-full h-28 bg-black/30 rounded-lg border border-border flex items-center justify-center overflow-hidden relative group">
                                <S3Image src={value} alt="Preview" className="max-w-full max-h-full object-contain" />
                                <button
                                    onClick={() => handleChange('')}
                                    className="absolute top-1.5 right-1.5 bg-destructive/80 hover:bg-destructive text-white rounded-md p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                    title={t('flows:detailPanel.removeImage')}
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        )}
                        <label className="cursor-pointer bg-muted/50 hover:bg-muted border border-border/60 text-foreground/80 text-xs py-2 px-3 rounded-md text-center transition-colors">
                            <span>{value ? t('flows:detailPanel.changeFile') : t('flows:detailPanel.uploadFile')}</span>
                            <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={async e => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                        const reader = new FileReader();
                                        reader.onload = async evt => {
                                            if (evt.target?.result) {
                                                const { dataUrl } = await compressImageIfNeeded(
                                                    evt.target.result as string
                                                );
                                                handleChange(dataUrl);
                                            }
                                        };
                                        reader.readAsDataURL(file);
                                    }
                                }}
                            />
                        </label>
                    </div>
                );
            case 'workflow-selector':
                return (
                    <div className="text-xs text-muted-foreground/70 italic p-2 border border-dashed border-border/50 rounded-md text-center bg-muted/20">
                        {t('flows:detailPanel.useNodeSettings')}
                    </div>
                );
            default:
                return null;
        }
    };

    // --- View: Node Selection ---
    if (selectedNode) {
        const def = blockRegistry[selectedNode.type];
        if (!def) return null;

        const isAuto = selectedNode.autoExecutionEnabled !== false;
        // Use def.type since loaded nodes may have blockId as type
        const isComponent = def.type === 'workflow-component';
        const subFlowId = isComponent ? selectedNode.config.selectedFlowId : null;

        const configSchema =
            def.configSchema ||
            Object.entries(def.defaultConfig).map(([key, value]): ConfigField => {
                let type: ConfigControlType = 'text';
                if (typeof value === 'number') type = 'number';
                if (typeof value === 'boolean') type = 'boolean';
                return { key, type, label: key };
            });

        return (
            <div
                className="fixed top-20 right-4 bottom-4 w-80 flex flex-col bg-glass-bg backdrop-blur-[20px] border border-glass-border rounded-xl shadow-floating overflow-hidden animate-in slide-in-from-right-4 duration-200 z-50"
                onMouseDown={e => e.stopPropagation()}
                onDoubleClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-3 border-b border-border/50 bg-surface-elevated/50 flex-shrink-0">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                <Settings className="w-4 h-4 text-primary" />
                            </div>
                            <input
                                type="text"
                                value={selectedNode.customLabel || def.label}
                                onChange={e => onLabelChange(selectedNode.id, e.target.value)}
                                className="bg-transparent font-semibold text-sm text-foreground focus:bg-muted/30 outline-none rounded px-1.5 py-0.5 -ml-1 flex-1 min-w-0 border border-transparent focus:border-primary/40 transition-colors"
                                placeholder={t('flows:detailPanel.nodeLabel')}
                            />
                        </div>
                        <button
                            onClick={onClose}
                            className="text-muted-foreground/60 hover:text-foreground w-7 h-7 flex items-center justify-center rounded-md hover:bg-muted/50 transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <span
                            className="text-[10px] font-mono bg-muted/50 px-1.5 py-0.5 rounded border border-border/50 text-muted-foreground"
                            title={t('flows:detailPanel.nodeType')}
                        >
                            {def.type}
                        </span>
                        <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                                selectedNode.status === 'ERROR'
                                    ? 'bg-destructive/20 text-destructive border border-destructive/30'
                                    : selectedNode.status === 'RUNNING'
                                      ? 'bg-status-running/20 text-status-running border border-status-running/30'
                                      : selectedNode.status === 'COMPLETED'
                                        ? 'bg-status-completed/20 text-status-completed border border-status-completed/30'
                                        : 'bg-muted/50 text-muted-foreground border border-border/50'
                            }`}
                        >
                            {selectedNode.status}
                        </span>
                        <button
                            onClick={() => onViewLogs(selectedNode.id)}
                            className="ml-auto text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
                            title={t('flows:detailPanel.viewExecutionLogs')}
                        >
                            <ScrollText className="w-3 h-3" /> {t('flows:detailPanel.logs')}
                        </button>
                    </div>

                    {isComponent && subFlowId && (
                        <div className="mt-2 flex items-center gap-2 text-[10px] bg-primary/10 px-2 py-1.5 rounded-md border border-primary/20">
                            <span className="uppercase font-semibold text-primary/70 tracking-wider">
                                {t('flows:detailPanel.subFlowId')}
                            </span>
                            <span className="font-mono text-primary select-all">{subFlowId}</span>
                        </div>
                    )}
                </div>

                {/* Error Display */}
                {selectedNode.status === 'ERROR' && (
                    <div className="px-3 py-2 bg-destructive/10 border-b border-destructive/20 flex-shrink-0">
                        <div className="flex items-center gap-2 mb-1 text-destructive text-xs font-semibold">
                            <AlertTriangle className="w-3.5 h-3.5" /> {t('flows:detailPanel.errorDetails')}
                        </div>
                        <div
                            className="text-[10px] font-mono text-destructive/80 bg-black/20 p-2 rounded-md border border-destructive/20 break-all max-h-24 overflow-y-auto"
                            onWheel={e => e.stopPropagation()}
                        >
                            {selectedNode.errorMessage || t('flows:detailPanel.unknownError')}
                        </div>
                    </div>
                )}

                <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3" onWheel={e => e.stopPropagation()}>
                    {/* Description Section */}
                    <CollapsibleSection
                        title={t('flows:detailPanel.description')}
                        icon={<FileText className="w-3.5 h-3.5" />}
                        defaultOpen={false}
                    >
                        <textarea
                            className="w-full bg-background/60 border border-border/50 rounded-md p-2 text-xs text-foreground focus:border-primary/50 outline-none resize-none h-14 transition-colors mt-2"
                            value={selectedNode.description || ''}
                            onChange={e => onDescriptionChange(selectedNode.id, e.target.value)}
                            placeholder={t('flows:detailPanel.descriptionPlaceholder')}
                        />
                    </CollapsibleSection>

                    {/* Configuration Section */}
                    <CollapsibleSection
                        title={t('flows:detailPanel.configuration')}
                        icon={<Settings className="w-3.5 h-3.5" />}
                        iconColor="text-primary"
                    >
                        <div className="flex items-center justify-between py-2 border-b border-border/30 mb-3">
                            <span className="text-[11px] text-muted-foreground font-medium">
                                {t('flows:detailPanel.auto')}
                            </span>
                            <button
                                onClick={() => onToggleAuto(selectedNode.id)}
                                className="flex items-center gap-2"
                                title={
                                    isAuto
                                        ? t('flows:detailPanel.autoRunEnabled')
                                        : t('flows:detailPanel.autoRunDisabled')
                                }
                            >
                                <div
                                    className={`w-8 h-4 rounded-full p-0.5 transition-colors ${isAuto ? 'bg-status-completed' : 'bg-muted'}`}
                                >
                                    <div
                                        className={`w-3 h-3 bg-white rounded-full shadow-sm transition-transform ${isAuto ? 'translate-x-4' : 'translate-x-0'}`}
                                    />
                                </div>
                            </button>
                        </div>

                        <div className="space-y-3">
                            {configSchema.length === 0 ? (
                                <div className="text-xs text-muted-foreground/60 italic text-center py-2">
                                    {t('flows:detailPanel.noSettings')}
                                </div>
                            ) : (
                                configSchema.map(field => (
                                    <div key={field.key}>
                                        <label className="text-[10px] text-muted-foreground/80 font-medium mb-1.5 block uppercase tracking-wider">
                                            {field.label}
                                        </label>
                                        {renderConfigInput(selectedNode, field, def)}
                                    </div>
                                ))
                            )}
                        </div>
                    </CollapsibleSection>

                    {/* Inputs Section */}
                    <CollapsibleSection
                        title={t('flows:detailPanel.inputs')}
                        icon={<ArrowDownToLine className="w-3.5 h-3.5" />}
                        iconColor="text-status-completed"
                    >
                        <div className="space-y-2 mt-2">
                            {def.inputs.length === 0 ? (
                                <div className="text-xs text-muted-foreground/60 italic text-center py-2">
                                    {t('flows:detailPanel.noInputsRequired')}
                                </div>
                            ) : (
                                def.inputs.map(input => {
                                    const incomingConn = connections.find(
                                        c => c.targetNodeId === selectedNode.id && c.targetPortId === input.id
                                    );

                                    return (
                                        <div
                                            key={input.id}
                                            className="bg-black/10 p-2 rounded-md border border-border/30"
                                        >
                                            <div className="flex justify-between items-center mb-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[11px] font-semibold text-foreground">
                                                        {input.label}
                                                    </span>
                                                    {incomingConn && (
                                                        <button
                                                            onClick={() => onSelectConnection(incomingConn.id)}
                                                            className="text-[9px] bg-warning/20 hover:bg-warning/30 text-warning px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors"
                                                            title={t('flows:detailPanel.goToConnection')}
                                                        >
                                                            <Zap className="w-2.5 h-2.5" />
                                                            {t('flows:detailPanel.link')}
                                                        </button>
                                                    )}
                                                </div>
                                                <span className="text-[9px] text-muted-foreground/60 uppercase font-mono bg-muted/30 px-1.5 py-0.5 rounded">
                                                    {input.type}
                                                </span>
                                            </div>
                                            {renderDataPreview(selectedNode.inputData[input.id])}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </CollapsibleSection>

                    {/* Outputs Section */}
                    <CollapsibleSection
                        title={t('flows:detailPanel.outputs')}
                        icon={<ArrowUpFromLine className="w-3.5 h-3.5" />}
                        iconColor="text-primary"
                    >
                        <div className="space-y-2 mt-2">
                            {def.outputs.length === 0 ? (
                                <div className="text-xs text-muted-foreground/60 italic text-center py-2">
                                    {t('flows:detailPanel.noOutputs')}
                                </div>
                            ) : (
                                def.outputs.map(output => {
                                    const outgoingConns = connections.filter(
                                        c => c.sourceNodeId === selectedNode.id && c.sourcePortId === output.id
                                    );

                                    return (
                                        <div
                                            key={output.id}
                                            className="bg-black/10 p-2 rounded-md border border-border/30"
                                        >
                                            <div className="flex justify-between items-center mb-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[11px] font-semibold text-foreground">
                                                        {output.label}
                                                    </span>
                                                    {outgoingConns.length > 0 && (
                                                        <div className="flex gap-1">
                                                            {outgoingConns.map((c, i) => (
                                                                <button
                                                                    key={c.id}
                                                                    onClick={() => onSelectConnection(c.id)}
                                                                    className="text-[9px] bg-warning/20 hover:bg-warning/30 text-warning px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors"
                                                                    title={`${t('flows:detailPanel.goToConnection')} ${i + 1}`}
                                                                >
                                                                    <Zap className="w-2.5 h-2.5" />
                                                                    {outgoingConns.length > 1
                                                                        ? `#${i + 1}`
                                                                        : t('flows:detailPanel.link')}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                <span className="text-[9px] text-muted-foreground/60 uppercase font-mono bg-muted/30 px-1.5 py-0.5 rounded">
                                                    {output.type}
                                                </span>
                                            </div>
                                            {renderDataPreview(selectedNode.outputData[output.id])}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </CollapsibleSection>
                </div>

                {/* Footer Actions */}
                <div className="p-3 border-t border-border/50 bg-surface-elevated/30 flex gap-2 flex-shrink-0">
                    <button
                        onClick={() => onTriggerNode(selectedNode.id)}
                        className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground text-xs py-2.5 rounded-lg font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                    >
                        <Play className="w-3.5 h-3.5" /> {t('flows:detailPanel.runBlock')}
                    </button>
                    <button
                        onClick={() => onDeleteNode(selectedNode.id)}
                        className="px-3 bg-destructive/10 border border-destructive/30 hover:bg-destructive/20 text-destructive text-xs rounded-lg transition-colors flex items-center justify-center"
                        title={t('common:actions.delete')}
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
        );
    }

    // --- View: Connection Selection ---
    if (selectedConnection) {
        const sourceNode = nodes.find(n => n.id === selectedConnection.sourceNodeId);
        const targetNode = nodes.find(n => n.id === selectedConnection.targetNodeId);

        const sourceDef = sourceNode ? blockRegistry[sourceNode.type] : null;
        const targetDef = targetNode ? blockRegistry[targetNode.type] : null;

        const sourcePort = sourceDef?.outputs.find(p => p.id === selectedConnection.sourcePortId);
        const targetPort = targetDef?.inputs.find(p => p.id === selectedConnection.targetPortId);

        const packet = sourceNode?.outputData[selectedConnection.sourcePortId];

        return (
            <div
                className="fixed top-20 right-4 bottom-4 w-72 flex flex-col bg-glass-bg backdrop-blur-[20px] border border-glass-border rounded-xl shadow-floating overflow-hidden animate-in slide-in-from-right-4 duration-200 z-50"
                onMouseDown={e => e.stopPropagation()}
                onDoubleClick={e => e.stopPropagation()}
            >
                <div className="p-3 border-b border-border/50 flex items-center justify-between bg-surface-elevated/50 flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center">
                            <Zap className="w-4 h-4 text-warning" />
                        </div>
                        <h2 className="text-sm font-semibold text-foreground">{t('flows:detailPanel.connection')}</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-muted-foreground/60 hover:text-foreground w-7 h-7 flex items-center justify-center rounded-md hover:bg-muted/50 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
                    <div className="flex flex-col items-center gap-2">
                        {/* Source */}
                        <div
                            className="w-full bg-muted/30 hover:bg-primary/10 hover:border-primary/40 cursor-pointer p-3 rounded-lg border border-border/50 flex flex-col items-center text-center transition-all group"
                            onClick={() => sourceNode && onSelectNode(sourceNode.id)}
                            title={t('flows:detailPanel.goToSourceNode')}
                        >
                            <div className="text-[9px] text-muted-foreground/60 uppercase tracking-wider mb-1">
                                {t('flows:detailPanel.from')}
                            </div>
                            <div className="font-semibold text-sm text-primary group-hover:text-foreground transition-colors">
                                {sourceDef?.label || t('flows:detailPanel.unknown')}
                            </div>
                            <div className="text-[10px] text-muted-foreground/70 font-mono mt-0.5 bg-muted/50 px-2 py-0.5 rounded">
                                {sourcePort?.label}
                            </div>
                        </div>

                        <ArrowDown className="w-4 h-4 text-muted-foreground/50" />

                        {/* Payload */}
                        <div className="w-full bg-black/20 p-3 rounded-lg border border-dashed border-border/50">
                            <div className="text-[9px] text-center text-muted-foreground/60 mb-2 uppercase tracking-wider">
                                {t('flows:detailPanel.payload')}
                            </div>
                            {renderDataPreview(packet)}
                        </div>

                        <ArrowDown className="w-4 h-4 text-muted-foreground/50" />

                        {/* Target */}
                        <div
                            className="w-full bg-muted/30 hover:bg-status-completed/10 hover:border-status-completed/40 cursor-pointer p-3 rounded-lg border border-border/50 flex flex-col items-center text-center transition-all group"
                            onClick={() => targetNode && onSelectNode(targetNode.id)}
                            title={t('flows:detailPanel.goToTargetNode')}
                        >
                            <div className="text-[9px] text-muted-foreground/60 uppercase tracking-wider mb-1">
                                {t('flows:detailPanel.to')}
                            </div>
                            <div className="font-semibold text-sm text-status-completed group-hover:text-foreground transition-colors">
                                {targetDef?.label || t('flows:detailPanel.unknown')}
                            </div>
                            <div className="text-[10px] text-muted-foreground/70 font-mono mt-0.5 bg-muted/50 px-2 py-0.5 rounded">
                                {targetPort?.label}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-3 border-t border-border/50 bg-surface-elevated/30 flex-shrink-0">
                    <button
                        onClick={() => onDeleteConnection(selectedConnection.id)}
                        className="w-full bg-destructive/10 border border-destructive/30 hover:bg-destructive/20 text-destructive text-xs py-2.5 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
                    >
                        <Trash2 className="w-3.5 h-3.5" /> {t('flows:detailPanel.deleteConnection')}
                    </button>
                </div>
            </div>
        );
    }

    return null;
};
