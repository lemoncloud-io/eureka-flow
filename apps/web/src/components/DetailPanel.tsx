import React, { useState } from 'react';

import { BLOCK_REGISTRY } from '../constants';

import type { BlockDefinition, ConfigControlType, ConfigField, Connection, DataPacket, NodeData } from '../types';

interface DetailPanelProps {
    selectedNode: NodeData | null;
    selectedConnection: Connection | null;
    nodes: NodeData[];
    connections: Connection[]; // New prop for lookup
    onConfigChange: (nodeId: string, key: string, value: any) => void;
    onDescriptionChange: (nodeId: string, description: string) => void;
    onLabelChange: (nodeId: string, label: string) => void; // New
    onToggleAuto: (nodeId: string) => void; // New
    onViewLogs: (nodeId: string) => void; // New
    onDeleteNode: (nodeId: string) => void;
    onDeleteConnection: (connectionId: string) => void;
    onTriggerNode: (nodeId: string) => void;
    onSelectNode: (nodeId: string) => void; // New prop for navigation
    onSelectConnection: (connectionId: string) => void; // New prop for navigation
    onClose: () => void;
}

// Small helper component for Image Preview in Detail Panel
const ImagePreview = ({ src }: { src: string }) => {
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
            <div className="h-32 w-full bg-black/40 rounded border border-gray-700 overflow-hidden flex items-center justify-center bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')]">
                <img
                    src={src}
                    alt="Data"
                    className="max-h-full max-w-full object-contain"
                    onLoad={e => setDims(`${e.currentTarget.naturalWidth}x${e.currentTarget.naturalHeight}`)}
                />
            </div>

            {/* Overlay Info */}
            <div className="absolute bottom-1 right-1 flex gap-1 pointer-events-none">
                {dims && (
                    <div className="bg-black/70 text-[9px] px-1.5 py-0.5 rounded text-white backdrop-blur-md border border-gray-600/50 font-mono shadow-sm">
                        {dims}
                    </div>
                )}
                <div className="bg-blue-900/80 text-[9px] px-1.5 py-0.5 rounded text-blue-100 backdrop-blur-md border border-blue-700/50 font-bold shadow-sm">
                    IMG
                </div>
            </div>

            {/* Download Button */}
            <button
                onClick={handleDownload}
                className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center bg-gray-800/90 hover:bg-blue-600 text-white rounded border border-gray-600 shadow-md opacity-0 group-hover:opacity-100 transition-all transform scale-90 group-hover:scale-100"
                title="Download Image"
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
    if (!selectedNode && !selectedConnection) return null;

    // --- Render Helpers ---

    const renderDataPreview = (packet?: DataPacket) => {
        if (!packet) return <span className="text-gray-600 italic text-xs">Empty / Waiting...</span>;

        if (packet.type === 'image') {
            return <ImagePreview src={packet.value} />;
        }
        return (
            <div className="bg-black/30 p-2 rounded border border-gray-700 text-xs font-mono text-blue-200 break-all max-h-24 overflow-y-auto">
                {typeof packet.value === 'object' ? JSON.stringify(packet.value) : String(packet.value)}
            </div>
        );
    };

    const renderConfigInput = (node: NodeData, field: ConfigField, definition: BlockDefinition) => {
        const value = node.config[field.key] ?? definition.defaultConfig[field.key];

        const handleChange = (val: any) => onConfigChange(node.id, field.key, val);

        switch (field.type) {
            case 'text':
            case 'number':
                return (
                    <input
                        type={field.type}
                        className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:border-blue-500 outline-none transition-colors"
                        value={value || ''}
                        onChange={e => handleChange(e.target.value)}
                        placeholder={field.placeholder}
                    />
                );
            case 'boolean':
                return (
                    <div className="flex items-center gap-2 mt-1">
                        <div
                            onClick={() => handleChange(!value)}
                            className={`w-8 h-4 rounded-full p-0.5 cursor-pointer transition-colors ${value ? 'bg-blue-600' : 'bg-gray-700'}`}
                        >
                            <div
                                className={`w-3 h-3 bg-white rounded-full shadow-sm transition-transform ${value ? 'translate-x-4' : 'translate-x-0'}`}
                            />
                        </div>
                        <span className="text-xs text-gray-400">{value ? 'True' : 'False'}</span>
                    </div>
                );
            case 'select':
                return (
                    <select
                        className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:border-blue-500 outline-none"
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
                            <div className="w-full h-32 bg-gray-950 rounded border border-gray-700 flex items-center justify-center overflow-hidden relative group">
                                <img src={value} alt="Preview" className="max-w-full max-h-full object-contain" />
                                {/* Small Remove Button for File Input */}
                                <button
                                    onClick={() => handleChange('')}
                                    className="absolute top-1 right-1 bg-red-900/80 hover:bg-red-700 text-white rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="Remove Image"
                                >
                                    ✕
                                </button>
                            </div>
                        )}
                        <div className="flex gap-2 items-center">
                            <label className="flex-1 cursor-pointer bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 text-xs py-1.5 px-3 rounded text-center transition-colors">
                                <span>{value ? 'Change File' : 'Upload File'}</span>
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
                    <div className="text-xs text-gray-500 italic p-1 border border-dashed border-gray-700 rounded text-center">
                        Use node settings (gear icon) for workflow selection.
                    </div>
                );
            default:
                return null;
        }
    };

    // --- View: Node Selection ---
    if (selectedNode) {
        const def = BLOCK_REGISTRY[selectedNode.type];
        if (!def) return null;

        const isAuto = selectedNode.autoExecutionEnabled !== false;
        const isComponent = selectedNode.type === 'workflow-component';
        const subFlowId = isComponent ? selectedNode.config.selectedFlowId : null;

        // Calculate configuration schema
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
                className="absolute top-4 right-4 w-80 max-h-[calc(100vh-2rem)] flex flex-col bg-gray-900/95 backdrop-blur-md border border-gray-700 rounded-lg shadow-2xl overflow-hidden animate-in slide-in-from-right-4 duration-200 z-50"
                onMouseDown={e => e.stopPropagation()}
                onDoubleClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-4 border-b border-gray-800 bg-gradient-to-r from-gray-800 to-gray-900">
                    {/* Row 1: Label Editing */}
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-xl">📦</span>
                        <input
                            type="text"
                            value={selectedNode.customLabel || def.label}
                            onChange={e => onLabelChange(selectedNode.id, e.target.value)}
                            className="bg-transparent font-bold text-sm text-white focus:bg-black/20 outline-none rounded px-1 -ml-1 flex-1 border border-transparent focus:border-blue-500"
                            placeholder="Node Label"
                        />
                        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                            ✕
                        </button>
                    </div>

                    {/* Row 2: Metadata & Status */}
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between text-[10px] text-gray-400">
                            <div className="flex items-center gap-2">
                                <span
                                    className="font-mono bg-black/30 px-1 rounded border border-gray-700"
                                    title="Node Type"
                                >
                                    {def.type}
                                </span>
                                <span className="font-mono text-gray-500 select-all" title="Node ID">
                                    #{selectedNode.id}
                                </span>
                                <span
                                    className={`px-1.5 py-0.5 rounded border font-semibold ${
                                        selectedNode.status === 'ERROR'
                                            ? 'border-red-500 text-red-400 bg-red-900/20'
                                            : selectedNode.status === 'RUNNING'
                                              ? 'border-yellow-500 text-yellow-400 bg-yellow-900/20'
                                              : selectedNode.status === 'COMPLETED'
                                                ? 'border-green-500 text-green-400 bg-green-900/20'
                                                : 'border-gray-600 text-gray-400 bg-gray-800'
                                    }`}
                                >
                                    {selectedNode.status}
                                </span>
                            </div>

                            <button
                                onClick={() => onViewLogs(selectedNode.id)}
                                className="flex items-center gap-1 hover:text-blue-300 transition-colors"
                                title="View Execution Logs"
                            >
                                <span>📜</span> Logs
                            </button>
                        </div>

                        {/* Row 3: Sub-flow ID for Components */}
                        {isComponent && subFlowId && (
                            <div className="flex items-center gap-2 text-[10px] bg-indigo-900/30 px-2 py-1.5 rounded border border-indigo-500/30">
                                <span className="uppercase font-bold text-indigo-300 opacity-70 tracking-wider">
                                    Sub-Flow ID
                                </span>
                                <span className="font-mono text-indigo-200 select-all">{subFlowId}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Error Display */}
                {selectedNode.status === 'ERROR' && (
                    <div className="p-3 bg-red-900/20 border-b border-red-900/50">
                        <div className="flex items-center gap-2 mb-1 text-red-400 text-xs font-bold">
                            <span>⚠️</span> Error Details
                        </div>
                        <div className="text-[10px] font-mono text-red-200 bg-black/40 p-2 rounded border border-red-900/30 break-all max-h-32 overflow-y-auto">
                            {selectedNode.errorMessage || 'Unknown Error'}
                        </div>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    {/* Description Section */}
                    <div>
                        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                            <span>📝</span> Description
                        </h3>
                        <textarea
                            className="w-full bg-gray-950 border border-gray-700 rounded p-2 text-xs text-gray-300 focus:border-blue-500 outline-none resize-none h-16 transition-colors"
                            value={selectedNode.description || ''}
                            onChange={e => onDescriptionChange(selectedNode.id, e.target.value)}
                            placeholder="Add description or notes..."
                        />
                    </div>

                    {/* 1. Configuration Section */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-xs font-semibold text-blue-400 uppercase tracking-wider flex items-center gap-2">
                                <span>⚙️</span> Configuration
                            </h3>

                            {/* Auto Toggle */}
                            <div
                                className="flex items-center gap-2 cursor-pointer group"
                                onClick={() => onToggleAuto(selectedNode.id)}
                                title={isAuto ? 'Auto-run enabled' : 'Auto-run disabled'}
                            >
                                <span
                                    className={`text-[9px] font-semibold ${isAuto ? 'text-green-400' : 'text-gray-500'}`}
                                >
                                    Auto
                                </span>
                                <div
                                    className={`w-6 h-3 rounded-full p-0.5 transition-colors relative ${isAuto ? 'bg-green-600/80' : 'bg-gray-700'}`}
                                >
                                    <div
                                        className={`w-2 h-2 bg-white rounded-full shadow-sm transition-transform absolute top-0.5 ${isAuto ? 'left-[calc(100%-10px)]' : 'left-0.5'}`}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3 bg-gray-800/30 p-3 rounded border border-gray-800">
                            {configSchema.length === 0 ? (
                                <div className="text-xs text-gray-500 italic text-center">No settings available</div>
                            ) : (
                                configSchema.map(field => (
                                    <div key={field.key}>
                                        <label className="text-[10px] text-gray-400 font-semibold mb-1 block">
                                            {field.label}
                                        </label>
                                        {renderConfigInput(selectedNode, field, def)}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* 2. Inputs Section */}
                    <div>
                        <h3 className="text-xs font-semibold text-green-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                            <span>📥</span> Inputs
                        </h3>
                        <div className="space-y-3">
                            {def.inputs.length === 0 ? (
                                <div className="text-xs text-gray-600 italic">No inputs required</div>
                            ) : (
                                def.inputs.map(input => {
                                    // Find connection feeding this input
                                    const incomingConn = connections.find(
                                        c => c.targetNodeId === selectedNode.id && c.targetPortId === input.id
                                    );

                                    return (
                                        <div
                                            key={input.id}
                                            className="bg-gray-800/30 p-2 rounded border border-gray-800 relative"
                                        >
                                            <div className="flex justify-between items-center mb-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-bold text-gray-300">
                                                        {input.label}
                                                    </span>
                                                    {incomingConn && (
                                                        <button
                                                            onClick={() => onSelectConnection(incomingConn.id)}
                                                            className="text-[9px] bg-gray-700 hover:bg-yellow-600 hover:text-white text-gray-300 px-1.5 rounded transition-colors flex items-center gap-1 border border-gray-600"
                                                            title="Go to Connection"
                                                        >
                                                            ⚡ Link
                                                        </button>
                                                    )}
                                                </div>
                                                <span className="text-[9px] text-gray-500 uppercase border border-gray-700 px-1 rounded">
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

                    {/* 3. Outputs Section */}
                    <div>
                        <h3 className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                            <span>📤</span> Outputs
                        </h3>
                        <div className="space-y-3">
                            {def.outputs.length === 0 ? (
                                <div className="text-xs text-gray-600 italic">No outputs</div>
                            ) : (
                                def.outputs.map(output => {
                                    // Find connections going out from this output
                                    const outgoingConns = connections.filter(
                                        c => c.sourceNodeId === selectedNode.id && c.sourcePortId === output.id
                                    );

                                    return (
                                        <div
                                            key={output.id}
                                            className="bg-gray-800/30 p-2 rounded border border-gray-800"
                                        >
                                            <div className="flex justify-between items-center mb-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-bold text-gray-300">
                                                        {output.label}
                                                    </span>
                                                    {outgoingConns.length > 0 && (
                                                        <div className="flex gap-1">
                                                            {outgoingConns.map((c, i) => (
                                                                <button
                                                                    key={c.id}
                                                                    onClick={() => onSelectConnection(c.id)}
                                                                    className="text-[9px] bg-gray-700 hover:bg-yellow-600 hover:text-white text-gray-300 px-1.5 rounded transition-colors flex items-center gap-1 border border-gray-600"
                                                                    title={`Go to Connection ${i + 1}`}
                                                                >
                                                                    ⚡ {outgoingConns.length > 1 ? `#${i + 1}` : 'Link'}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                <span className="text-[9px] text-gray-500 uppercase border border-gray-700 px-1 rounded">
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
                <div className="p-3 border-t border-gray-800 bg-gray-800/50 flex gap-2">
                    <button
                        onClick={() => onTriggerNode(selectedNode.id)}
                        className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs py-2 rounded font-semibold transition-colors"
                    >
                        ▶ Run Block
                    </button>
                    <button
                        onClick={() => onDeleteNode(selectedNode.id)}
                        className="px-3 bg-red-900/40 border border-red-900 hover:bg-red-900/60 text-red-200 text-xs rounded transition-colors"
                        title="Delete Node"
                    >
                        🗑️
                    </button>
                </div>
            </div>
        );
    }

    // --- View: Connection Selection ---
    if (selectedConnection) {
        const sourceNode = nodes.find(n => n.id === selectedConnection.sourceNodeId);
        const targetNode = nodes.find(n => n.id === selectedConnection.targetNodeId);

        const sourceDef = sourceNode ? BLOCK_REGISTRY[sourceNode.type] : null;
        const targetDef = targetNode ? BLOCK_REGISTRY[targetNode.type] : null;

        const sourcePort = sourceDef?.outputs.find(p => p.id === selectedConnection.sourcePortId);
        const targetPort = targetDef?.inputs.find(p => p.id === selectedConnection.targetPortId);

        const packet = sourceNode?.outputData[selectedConnection.sourcePortId];

        return (
            <div
                className="absolute top-4 right-4 w-72 bg-gray-900/95 backdrop-blur-md border border-gray-700 rounded-lg shadow-2xl overflow-hidden animate-in slide-in-from-right-4 duration-200 z-50"
                onMouseDown={e => e.stopPropagation()}
                onDoubleClick={e => e.stopPropagation()}
            >
                <div className="p-3 border-b border-gray-800 flex items-center justify-between bg-gradient-to-r from-gray-800 to-gray-900">
                    <h2 className="text-sm font-bold text-white flex items-center gap-2">
                        <span className="text-yellow-400">⚡</span> Connection
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        ✕
                    </button>
                </div>

                <div className="p-4 space-y-6">
                    {/* Flow Visualizer */}
                    <div className="flex flex-col items-center gap-2 relative">
                        {/* Source */}
                        <div
                            className="w-full bg-gray-800 hover:bg-gray-700 hover:border-blue-500 cursor-pointer p-2 rounded border border-gray-700 flex flex-col items-center text-center transition-all group"
                            onClick={() => sourceNode && onSelectNode(sourceNode.id)}
                            title="Go to Source Node"
                        >
                            <div className="text-[10px] text-gray-500 uppercase group-hover:text-blue-300">From</div>
                            <div className="font-bold text-xs text-blue-300 group-hover:text-white">
                                {sourceDef?.label || 'Unknown'}
                            </div>
                            <div className="text-[9px] text-gray-400 font-mono mt-0.5">{sourcePort?.label}</div>
                        </div>

                        {/* Down Arrow */}
                        <div className="text-gray-500">↓</div>

                        {/* Value Packet */}
                        <div className="w-full bg-black/40 p-2 rounded border border-dashed border-gray-600 relative">
                            <div className="text-[9px] text-center text-gray-500 mb-1 uppercase tracking-wider">
                                Payload
                            </div>
                            {renderDataPreview(packet)}
                        </div>

                        {/* Down Arrow */}
                        <div className="text-gray-500">↓</div>

                        {/* Target */}
                        <div
                            className="w-full bg-gray-800 hover:bg-gray-700 hover:border-green-500 cursor-pointer p-2 rounded border border-gray-700 flex flex-col items-center text-center transition-all group"
                            onClick={() => targetNode && onSelectNode(targetNode.id)}
                            title="Go to Target Node"
                        >
                            <div className="text-[10px] text-gray-500 uppercase group-hover:text-green-300">To</div>
                            <div className="font-bold text-xs text-green-300 group-hover:text-white">
                                {targetDef?.label || 'Unknown'}
                            </div>
                            <div className="text-[9px] text-gray-400 font-mono mt-0.5">{targetPort?.label}</div>
                        </div>
                    </div>
                </div>

                <div className="p-3 border-t border-gray-800 bg-gray-800/50">
                    <button
                        onClick={() => onDeleteConnection(selectedConnection.id)}
                        className="w-full bg-red-900/40 border border-red-900 hover:bg-red-900/60 text-red-200 text-xs py-2 rounded font-semibold transition-colors flex items-center justify-center gap-2"
                    >
                        🗑️ Delete Connection
                    </button>
                </div>
            </div>
        );
    }

    return null;
};
