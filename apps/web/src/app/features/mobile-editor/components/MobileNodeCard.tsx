import React, { useCallback } from 'react';

import { AlertCircle, Check, Loader2, Play } from 'lucide-react';

import { EXECUTE_FUNCTIONS, runNode, useBlockRegistry, useCanvasStore } from '@flows/flows';
import { cn } from '@flows/lib/utils';

import { MobilePortChip } from './MobilePortChip';
import { BlockIcon } from '../../flows/components/BlockIcon';

import type { BlockDefinitionWithFrontend } from '@flows/flows';
import type { Connection, NodeData, NodeState } from '@lemoncloud/eureka-flows-api';

const STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode }> = {
    IDLE: { color: 'bg-muted-foreground/40', icon: null },
    READY: { color: 'bg-primary', icon: null },
    RUNNING: { color: 'bg-warning animate-pulse', icon: <Loader2 className="w-3.5 h-3.5 animate-spin text-warning" /> },
    COMPLETED: { color: 'bg-success', icon: <Check className="w-3.5 h-3.5 text-success" /> },
    ERROR: { color: 'bg-destructive', icon: <AlertCircle className="w-3.5 h-3.5 text-destructive" /> },
};

interface MobileNodeCardProps {
    node: NodeData;
    nodeConnections: { inputs: Connection[]; outputs: Connection[] };
    nodeMap: Map<string, NodeData>;
    connectionMode: {
        isActive: boolean;
        isPortCompatible: (nodeId: string, portDataType: string) => boolean;
        sourceNodeId: string | null;
        sourcePortId: string | null;
        onSelectSource: (nodeId: string, portId: string, portDataType: string, nodeName: string) => void;
        onSelectTarget: (nodeId: string, portId: string) => void;
    };
    onTapCard: (nodeId: string) => void;
    onDisconnect: (connectionId: string) => void;
    socketConnectionId?: string;
}

export const MobileNodeCard = React.memo(
    ({
        node,
        nodeConnections,
        nodeMap,
        connectionMode,
        onTapCard,
        onDisconnect,
        socketConnectionId,
    }: MobileNodeCardProps) => {
        const blockRegistry = useBlockRegistry();
        const blockDef: BlockDefinitionWithFrontend | undefined = blockRegistry[node.type];

        const state = (node.state ?? 'IDLE') as NodeState;
        const status = STATUS_CONFIG[state] ?? STATUS_CONFIG.IDLE;
        const displayName = node.customLabel || blockDef?.label || node.type;

        const getConnectedNodeName = useCallback(
            (conn: Connection, direction: 'input' | 'output'): string => {
                const connectedId = direction === 'input' ? conn.sourceNodeId : conn.targetNodeId;
                const connectedNode = nodeMap.get(connectedId);
                if (!connectedNode) return connectedId;
                const connDef = blockRegistry[connectedNode.type];
                return connectedNode.customLabel || connDef?.label || connectedNode.type;
            },
            [nodeMap, blockRegistry]
        );

        const inputPorts = blockDef?.inputs ?? [];
        const outputPorts = blockDef?.outputs ?? [];

        const handleRun = useCallback(
            async (e: React.MouseEvent) => {
                e.stopPropagation();
                const updateNodeData = useCanvasStore.getState().updateNodeData;
                updateNodeData(node.id, { state: 'RUNNING' } as Partial<NodeData>);

                try {
                    if (blockDef?.isFrontend && EXECUTE_FUNCTIONS[blockDef.type]) {
                        const executeFn = EXECUTE_FUNCTIONS[blockDef.type];
                        const result = await executeFn(node.inputData ?? {}, node.config ?? {});
                        updateNodeData(node.id, {
                            outputData: result,
                            state: 'COMPLETED',
                        } as Partial<NodeData>);
                        await runNode(node.id, { output: result });
                    } else {
                        await runNode(node.id, undefined, {
                            connectionId: socketConnectionId,
                        });
                    }
                } catch {
                    updateNodeData(node.id, { state: 'ERROR' } as Partial<NodeData>);
                }
            },
            [node.id, node.inputData, node.config, blockDef, socketConnectionId]
        );

        return (
            <div
                className={cn(
                    'rounded-xl border bg-card shadow-sm transition-all duration-200',
                    'active:scale-[0.98]',
                    state === 'RUNNING' && 'border-warning/50 shadow-warning/10',
                    state === 'COMPLETED' && 'border-success/30',
                    state === 'ERROR' && 'border-destructive/30'
                )}
            >
                {/* Input ports */}
                {inputPorts.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 px-3 pt-3">
                        {inputPorts.map(port => {
                            const conn = nodeConnections.inputs.find(c => c.targetPortId === port.id);
                            const connectedName = conn ? getConnectedNodeName(conn, 'input') : null;

                            return (
                                <MobilePortChip
                                    key={port.id}
                                    portId={port.id}
                                    portName={port.label || port.id}
                                    portDataType={port.type ?? 'any'}
                                    direction="input"
                                    connectedNodeName={connectedName}
                                    connectionId={conn?.id ?? null}
                                    isConnectionMode={connectionMode.isActive}
                                    isCompatible={connectionMode.isPortCompatible(node.id, port.type ?? 'any')}
                                    isSource={false}
                                    onTap={() => connectionMode.onSelectTarget(node.id, port.id)}
                                    onDisconnect={onDisconnect}
                                />
                            );
                        })}
                    </div>
                )}

                {/* Header - tappable for config */}
                <button
                    onClick={() => onTapCard(node.id)}
                    className="w-full px-3 py-3 flex items-center gap-3 text-left"
                >
                    <div
                        className={cn(
                            'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                            blockDef?.stereo === 'input' && 'bg-primary/10',
                            blockDef?.stereo === 'process' && 'bg-muted/50',
                            blockDef?.stereo === 'output' && 'bg-success/10'
                        )}
                    >
                        <BlockIcon icon={blockDef?.icon} size={18} />
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{displayName}</div>
                        {blockDef?.label && node.customLabel && (
                            <div className="text-xs text-muted-foreground truncate">{blockDef.label}</div>
                        )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        {status.icon}
                        <div className={cn('w-2.5 h-2.5 rounded-full', status.color)} />
                    </div>

                    {blockDef?.isRunnable !== false && (
                        <button
                            onClick={handleRun}
                            disabled={state === 'RUNNING'}
                            className={cn(
                                'p-2 rounded-lg transition-colors shrink-0',
                                'bg-primary/10 hover:bg-primary/20 text-primary',
                                'disabled:opacity-50 disabled:cursor-not-allowed'
                            )}
                        >
                            {state === 'RUNNING' ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Play className="w-4 h-4 fill-current" />
                            )}
                        </button>
                    )}
                </button>

                {/* Output ports */}
                {outputPorts.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 px-3 pb-3">
                        {outputPorts.map(port => {
                            const conn = nodeConnections.outputs.find(c => c.sourcePortId === port.id);
                            const connectedName = conn ? getConnectedNodeName(conn, 'output') : null;
                            const isSource =
                                connectionMode.sourceNodeId === node.id && connectionMode.sourcePortId === port.id;

                            return (
                                <MobilePortChip
                                    key={port.id}
                                    portId={port.id}
                                    portName={port.label || port.id}
                                    portDataType={port.type ?? 'any'}
                                    direction="output"
                                    connectedNodeName={connectedName}
                                    connectionId={conn?.id ?? null}
                                    isConnectionMode={connectionMode.isActive}
                                    isCompatible={false}
                                    isSource={isSource}
                                    onTap={() =>
                                        connectionMode.onSelectSource(node.id, port.id, port.type ?? 'any', displayName)
                                    }
                                    onDisconnect={onDisconnect}
                                />
                            );
                        })}
                    </div>
                )}
            </div>
        );
    }
);

MobileNodeCard.displayName = 'MobileNodeCard';
