import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
    AlertTriangle,
    ArrowDown,
    ArrowDownToLine,
    ArrowUpFromLine,
    FileText,
    Package,
    Play,
    ScrollText,
    Settings,
    Trash2,
    X,
    Zap,
} from 'lucide-react';

import { useBlockRegistry } from '@flows/flows';

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
        <div className="mt-1 relative group">
            <div className="h-32 w-full bg-black/40 rounded border border-border overflow-hidden flex items-center justify-center bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')]">
                <S3Image
                    src={src}
                    alt="Data"
                    className="max-h-full max-w-full object-contain"
                    onLoad={e => setDims(`${e.currentTarget.naturalWidth}x${e.currentTarget.naturalHeight}`)}
                />
            </div>

            <div className="absolute bottom-1 right-1 flex gap-1 pointer-events-none">
                {dims && (
                    <div className="bg-black/70 text-[9px] px-1.5 py-0.5 rounded text-white backdrop-blur-md border border-border font-mono shadow-sm">
                        {dims}
                    </div>
                )}
                <div className="bg-blue-900/80 text-[9px] px-1.5 py-0.5 rounded text-blue-100 backdrop-blur-md border border-blue-700/50 font-bold shadow-sm">
                    {t('flows:detailPanel.img')}
                </div>
            </div>

            <button
                onClick={handleDownload}
                className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center bg-muted/90 hover:bg-primary text-foreground hover:text-primary-foreground rounded border border-border shadow-md opacity-0 group-hover:opacity-100 transition-all transform scale-90 group-hover:scale-100"
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
            return <span className="text-muted-foreground italic text-xs">{t('flows:detailPanel.emptyWaiting')}</span>;
        }

        if (packet.type === 'image') {
            return <ImagePreview src={packet.value} t={t} />;
        }
        return (
            <div
                className="bg-muted/50 p-2 rounded border border-border text-xs font-mono text-info break-words max-h-24 overflow-y-auto whitespace-pre-wrap"
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
                        className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs text-foreground focus:border-primary outline-none transition-colors resize-y min-h-[60px]"
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
                        className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs text-foreground focus:border-primary outline-none transition-colors"
                        value={value || ''}
                        onChange={e => handleChange(e.target.value)}
                        onKeyDown={e => e.stopPropagation()}
                        placeholder={field.placeholder}
                    />
                );
            case 'boolean':
                return (
                    <div className="flex items-center gap-2 mt-1">
                        <div
                            onClick={() => handleChange(!value)}
                            className={`w-8 h-4 rounded-full p-0.5 cursor-pointer transition-colors ${value ? 'bg-primary' : 'bg-muted'}`}
                        >
                            <div
                                className={`w-3 h-3 bg-white rounded-full shadow-sm transition-transform ${value ? 'translate-x-4' : 'translate-x-0'}`}
                            />
                        </div>
                        <span className="text-xs text-muted-foreground">
                            {value ? t('flows:detailPanel.true') : t('flows:detailPanel.false')}
                        </span>
                    </div>
                );
            case 'select':
                return (
                    <select
                        className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs text-foreground focus:border-primary outline-none"
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
                            <div className="w-full h-32 bg-background rounded border border-border flex items-center justify-center overflow-hidden relative group">
                                <S3Image src={value} alt="Preview" className="max-w-full max-h-full object-contain" />
                                <button
                                    onClick={() => handleChange('')}
                                    className="absolute top-1 right-1 bg-destructive/80 hover:bg-destructive text-destructive-foreground rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                    title={t('flows:detailPanel.removeImage')}
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        )}
                        <div className="flex gap-2 items-center">
                            <label className="flex-1 cursor-pointer bg-secondary hover:bg-secondary/80 border border-border text-secondary-foreground text-xs py-1.5 px-3 rounded text-center transition-colors">
                                <span>
                                    {value ? t('flows:detailPanel.changeFile') : t('flows:detailPanel.uploadFile')}
                                </span>
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={e => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            const reader = new FileReader();
                                            reader.onload = evt =>
                                                evt.target?.result && handleChange(evt.target.result);
                                            reader.readAsDataURL(file);
                                        }
                                    }}
                                />
                            </label>
                        </div>
                    </div>
                );
            case 'workflow-selector':
                return (
                    <div className="text-xs text-muted-foreground italic p-1 border border-dashed border-border rounded text-center">
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
        const isComponent = selectedNode.type === 'workflow-component';
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
                className="fixed top-20 right-4 bottom-4 w-80 flex flex-col bg-popover/95 backdrop-blur-md border border-border rounded-lg shadow-2xl overflow-hidden animate-in slide-in-from-right-4 duration-200 z-50"
                onMouseDown={e => e.stopPropagation()}
                onDoubleClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-4 border-b border-border bg-surface-elevated flex-shrink-0">
                    <div className="flex items-center gap-2 mb-2">
                        <Package className="w-5 h-5 text-muted-foreground" />
                        <input
                            type="text"
                            value={selectedNode.customLabel || def.label}
                            onChange={e => onLabelChange(selectedNode.id, e.target.value)}
                            className="bg-transparent font-bold text-sm text-foreground focus:bg-black/20 outline-none rounded px-1 -ml-1 flex-1 border border-transparent focus:border-primary"
                            placeholder={t('flows:detailPanel.nodeLabel')}
                        />
                        <button
                            onClick={onClose}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                            <div className="flex items-center gap-2">
                                <span
                                    className="font-mono bg-black/30 px-1 rounded border border-border"
                                    title={t('flows:detailPanel.nodeType')}
                                >
                                    {def.type}
                                </span>
                                <span className="font-mono text-muted-foreground/60 select-all" title="Node ID">
                                    #{selectedNode.id}
                                </span>
                                <span
                                    className={`px-1.5 py-0.5 rounded border font-semibold ${
                                        selectedNode.status === 'ERROR'
                                            ? 'border-destructive text-destructive bg-destructive/20'
                                            : selectedNode.status === 'RUNNING'
                                              ? 'border-yellow-500 text-yellow-500 dark:text-yellow-400 bg-yellow-500/20'
                                              : selectedNode.status === 'COMPLETED'
                                                ? 'border-green-500 text-green-500 dark:text-green-400 bg-green-500/20'
                                                : 'border-border text-muted-foreground bg-muted'
                                    }`}
                                >
                                    {selectedNode.status}
                                </span>
                            </div>

                            <button
                                onClick={() => onViewLogs(selectedNode.id)}
                                className="flex items-center gap-1 hover:text-primary transition-colors"
                                title={t('flows:detailPanel.viewExecutionLogs')}
                            >
                                <ScrollText className="w-3 h-3" /> {t('flows:detailPanel.logs')}
                            </button>
                        </div>

                        {isComponent && subFlowId && (
                            <div className="flex items-center gap-2 text-[10px] bg-indigo-100 dark:bg-indigo-900/30 px-2 py-1.5 rounded border border-indigo-300 dark:border-indigo-500/30">
                                <span className="uppercase font-bold text-indigo-700 dark:text-indigo-300 opacity-70 tracking-wider">
                                    {t('flows:detailPanel.subFlowId')}
                                </span>
                                <span className="font-mono text-indigo-900 dark:text-indigo-200 select-all">
                                    {subFlowId}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Error Display */}
                {selectedNode.status === 'ERROR' && (
                    <div className="p-3 bg-destructive/20 border-b border-destructive/50 flex-shrink-0">
                        <div className="flex items-center gap-2 mb-1 text-destructive text-xs font-bold">
                            <AlertTriangle className="w-3.5 h-3.5" /> {t('flows:detailPanel.errorDetails')}
                        </div>
                        <div
                            className="text-[10px] font-mono text-destructive bg-black/40 p-2 rounded border border-destructive/30 break-all max-h-32 overflow-y-auto"
                            onWheel={e => e.stopPropagation()}
                        >
                            {selectedNode.errorMessage || t('flows:detailPanel.unknownError')}
                        </div>
                    </div>
                )}

                <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-6" onWheel={e => e.stopPropagation()}>
                    {/* Description Section */}
                    <div>
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                            <FileText className="w-3.5 h-3.5" /> {t('flows:detailPanel.description')}
                        </h3>
                        <textarea
                            className="w-full bg-background border border-border rounded p-2 text-xs text-foreground focus:border-primary outline-none resize-none h-16 transition-colors"
                            value={selectedNode.description || ''}
                            onChange={e => onDescriptionChange(selectedNode.id, e.target.value)}
                            placeholder={t('flows:detailPanel.descriptionPlaceholder')}
                        />
                    </div>

                    {/* Configuration Section */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-2">
                                <Settings className="w-3.5 h-3.5" /> {t('flows:detailPanel.configuration')}
                            </h3>

                            <div
                                className="flex items-center gap-2 cursor-pointer group"
                                onClick={() => onToggleAuto(selectedNode.id)}
                                title={
                                    isAuto
                                        ? t('flows:detailPanel.autoRunEnabled')
                                        : t('flows:detailPanel.autoRunDisabled')
                                }
                            >
                                <span
                                    className={`text-[9px] font-semibold ${isAuto ? 'text-green-500 dark:text-green-400' : 'text-muted-foreground'}`}
                                >
                                    {t('flows:detailPanel.auto')}
                                </span>
                                <div
                                    className={`w-6 h-3 rounded-full p-0.5 transition-colors relative ${isAuto ? 'bg-green-600/80' : 'bg-muted'}`}
                                >
                                    <div
                                        className={`w-2 h-2 bg-white rounded-full shadow-sm transition-transform absolute top-0.5 ${isAuto ? 'left-[calc(100%-10px)]' : 'left-0.5'}`}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3 bg-muted/30 p-3 rounded border border-border">
                            {configSchema.length === 0 ? (
                                <div className="text-xs text-muted-foreground italic text-center">
                                    {t('flows:detailPanel.noSettings')}
                                </div>
                            ) : (
                                configSchema.map(field => (
                                    <div key={field.key}>
                                        <label className="text-[10px] text-muted-foreground font-semibold mb-1 block">
                                            {field.label}
                                        </label>
                                        {renderConfigInput(selectedNode, field, def)}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Inputs Section */}
                    <div>
                        <h3 className="text-xs font-semibold text-success uppercase tracking-wider mb-2 flex items-center gap-2">
                            <ArrowDownToLine className="w-3.5 h-3.5" /> {t('flows:detailPanel.inputs')}
                        </h3>
                        <div className="space-y-3">
                            {def.inputs.length === 0 ? (
                                <div className="text-xs text-muted-foreground italic">
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
                                            className="bg-muted/30 p-2 rounded border border-border relative"
                                        >
                                            <div className="flex justify-between items-center mb-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-bold text-foreground">
                                                        {input.label}
                                                    </span>
                                                    {incomingConn && (
                                                        <button
                                                            onClick={() => onSelectConnection(incomingConn.id)}
                                                            className="text-[9px] bg-muted hover:bg-warning hover:text-warning-foreground text-muted-foreground px-1.5 rounded transition-colors flex items-center gap-1 border border-border"
                                                            title={t('flows:detailPanel.goToConnection')}
                                                        >
                                                            <Zap className="w-2.5 h-2.5" />{' '}
                                                            {t('flows:detailPanel.link')}
                                                        </button>
                                                    )}
                                                </div>
                                                <span className="text-[9px] text-muted-foreground uppercase border border-border px-1 rounded">
                                                    {input.type}
                                                </span>
                                            </div>
                                            {renderDataPreview(selectedNode.inputData[input.id])}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Outputs Section */}
                    <div>
                        <h3 className="text-xs font-semibold text-purple-500 dark:text-purple-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                            <ArrowUpFromLine className="w-3.5 h-3.5" /> {t('flows:detailPanel.outputs')}
                        </h3>
                        <div className="space-y-3">
                            {def.outputs.length === 0 ? (
                                <div className="text-xs text-muted-foreground italic">
                                    {t('flows:detailPanel.noOutputs')}
                                </div>
                            ) : (
                                def.outputs.map(output => {
                                    const outgoingConns = connections.filter(
                                        c => c.sourceNodeId === selectedNode.id && c.sourcePortId === output.id
                                    );

                                    return (
                                        <div key={output.id} className="bg-muted/30 p-2 rounded border border-border">
                                            <div className="flex justify-between items-center mb-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-bold text-foreground">
                                                        {output.label}
                                                    </span>
                                                    {outgoingConns.length > 0 && (
                                                        <div className="flex gap-1">
                                                            {outgoingConns.map((c, i) => (
                                                                <button
                                                                    key={c.id}
                                                                    onClick={() => onSelectConnection(c.id)}
                                                                    className="text-[9px] bg-muted hover:bg-warning hover:text-warning-foreground text-muted-foreground px-1.5 rounded transition-colors flex items-center gap-1 border border-border"
                                                                    title={`${t('flows:detailPanel.goToConnection')} ${i + 1}`}
                                                                >
                                                                    <Zap className="w-2.5 h-2.5" />{' '}
                                                                    {outgoingConns.length > 1
                                                                        ? `#${i + 1}`
                                                                        : t('flows:detailPanel.link')}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                <span className="text-[9px] text-muted-foreground uppercase border border-border px-1 rounded">
                                                    {output.type}
                                                </span>
                                            </div>
                                            {renderDataPreview(selectedNode.outputData[output.id])}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-3 border-t border-border bg-muted/50 flex gap-2 flex-shrink-0">
                    <button
                        onClick={() => onTriggerNode(selectedNode.id)}
                        className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground text-xs py-2 rounded font-semibold transition-colors flex items-center justify-center gap-1"
                    >
                        <Play className="w-3 h-3" /> {t('flows:detailPanel.runBlock')}
                    </button>
                    <button
                        onClick={() => onDeleteNode(selectedNode.id)}
                        className="px-3 bg-destructive/40 border border-destructive hover:bg-destructive/60 text-destructive text-xs rounded transition-colors flex items-center justify-center"
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
                className="fixed top-20 right-4 bottom-4 w-72 flex flex-col bg-popover/95 backdrop-blur-md border border-border rounded-lg shadow-2xl overflow-hidden animate-in slide-in-from-right-4 duration-200 z-50"
                onMouseDown={e => e.stopPropagation()}
                onDoubleClick={e => e.stopPropagation()}
            >
                <div className="p-3 border-b border-border flex items-center justify-between bg-surface-elevated flex-shrink-0">
                    <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                        <Zap className="w-4 h-4 text-warning" /> {t('flows:detailPanel.connection')}
                    </h2>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-6">
                    <div className="flex flex-col items-center gap-2 relative">
                        {/* Source */}
                        <div
                            className="w-full bg-muted hover:bg-accent hover:border-primary cursor-pointer p-2 rounded border border-border flex flex-col items-center text-center transition-all group"
                            onClick={() => sourceNode && onSelectNode(sourceNode.id)}
                            title={t('flows:detailPanel.goToSourceNode')}
                        >
                            <div className="text-[10px] text-muted-foreground uppercase group-hover:text-primary">
                                {t('flows:detailPanel.from')}
                            </div>
                            <div className="font-bold text-xs text-primary group-hover:text-foreground">
                                {sourceDef?.label || t('flows:detailPanel.unknown')}
                            </div>
                            <div className="text-[9px] text-muted-foreground font-mono mt-0.5">{sourcePort?.label}</div>
                        </div>

                        <ArrowDown className="w-4 h-4 text-muted-foreground" />

                        {/* Payload */}
                        <div className="w-full bg-black/40 p-2 rounded border border-dashed border-border relative">
                            <div className="text-[9px] text-center text-muted-foreground mb-1 uppercase tracking-wider">
                                {t('flows:detailPanel.payload')}
                            </div>
                            {renderDataPreview(packet)}
                        </div>

                        <ArrowDown className="w-4 h-4 text-muted-foreground" />

                        {/* Target */}
                        <div
                            className="w-full bg-muted hover:bg-accent hover:border-green-500 cursor-pointer p-2 rounded border border-border flex flex-col items-center text-center transition-all group"
                            onClick={() => targetNode && onSelectNode(targetNode.id)}
                            title={t('flows:detailPanel.goToTargetNode')}
                        >
                            <div className="text-[10px] text-muted-foreground uppercase group-hover:text-green-500 dark:group-hover:text-green-400">
                                {t('flows:detailPanel.to')}
                            </div>
                            <div className="font-bold text-xs text-green-500 dark:text-green-400 group-hover:text-foreground">
                                {targetDef?.label || t('flows:detailPanel.unknown')}
                            </div>
                            <div className="text-[9px] text-muted-foreground font-mono mt-0.5">{targetPort?.label}</div>
                        </div>
                    </div>
                </div>

                <div className="p-3 border-t border-border bg-muted/50 flex-shrink-0">
                    <button
                        onClick={() => onDeleteConnection(selectedConnection.id)}
                        className="w-full bg-destructive/40 border border-destructive hover:bg-destructive/60 text-destructive text-xs py-2 rounded font-semibold transition-colors flex items-center justify-center gap-2"
                    >
                        <Trash2 className="w-3.5 h-3.5" /> {t('flows:detailPanel.deleteConnection')}
                    </button>
                </div>
            </div>
        );
    }

    return null;
};
