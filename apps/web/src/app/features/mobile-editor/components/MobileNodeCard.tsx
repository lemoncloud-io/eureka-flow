import React, { useCallback } from 'react';

import { AlertCircle, ArrowDownLeft, ArrowUpRight, Check, ChevronRight, Link, Loader2, Play } from 'lucide-react';

import { EXECUTE_FUNCTIONS, runNode, useBlockRegistry, useCanvasStore } from '@flows/flows';
import { cn } from '@flows/lib/utils';

import { TYPE_DOT } from './consts';
import { BlockIcon } from '../../flows/components/BlockIcon';
import { getPortStyleKey } from '../../flows/utils';

import type { BlockDefinitionWithFrontend } from '@flows/flows';
import type { Connection, NodeData, NodeState } from '@lemoncloud/eureka-flows-api';

const STATE_STYLES: Record<
    string,
    { border: string; badge: string; badgeText: string; label: string; icon: React.ReactNode }
> = {
    IDLE: { border: '', badge: 'bg-muted', badgeText: 'text-muted-foreground', label: 'Idle', icon: null },
    READY: {
        border: 'border-l-primary',
        badge: 'bg-primary/15',
        badgeText: 'text-primary',
        label: 'Ready',
        icon: null,
    },
    RUNNING: {
        border: 'border-l-warning',
        badge: 'bg-warning/15',
        badgeText: 'text-warning',
        label: 'Running',
        icon: <Loader2 className="w-3 h-3 animate-spin" />,
    },
    COMPLETED: {
        border: 'border-l-success',
        badge: 'bg-success/15',
        badgeText: 'text-success',
        label: 'Done',
        icon: <Check className="w-3 h-3" />,
    },
    ERROR: {
        border: 'border-l-destructive',
        badge: 'bg-destructive/15',
        badgeText: 'text-destructive',
        label: 'Error',
        icon: <AlertCircle className="w-3 h-3" />,
    },
};

const STEREO_ACCENT: Record<string, string> = {
    input: 'border-l-primary',
    process: 'border-l-muted-foreground/40',
    output: 'border-l-success',
};

interface MobileNodeCardProps {
    node: NodeData;
    nodeConnections: { inputs: Connection[]; outputs: Connection[] };
    displayNames: Map<string, string>;
    onTapCard: (nodeId: string) => void;
    onTapOutputPort: (nodeId: string, portId: string, portDataType: string, nodeName: string, portName: string) => void;
    socketConnectionId?: string;
    isSelected?: boolean;
}

export const MobileNodeCard = React.memo(
    ({
        node,
        nodeConnections,
        displayNames,
        onTapCard,
        onTapOutputPort,
        socketConnectionId,
        isSelected,
    }: MobileNodeCardProps) => {
        const blockRegistry = useBlockRegistry();
        const blockDef: BlockDefinitionWithFrontend | undefined = blockRegistry[node.type];

        const state = (node.state ?? 'IDLE') as NodeState;
        const stateStyle = STATE_STYLES[state] ?? STATE_STYLES.IDLE;
        const displayName = displayNames.get(node.id) ?? node.type;
        const stereo = blockDef?.stereo ?? 'process';

        const getConnectedNodeName = useCallback(
            (connectedId: string): string => displayNames.get(connectedId) ?? connectedId,
            [displayNames]
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
                        updateNodeData(node.id, { outputData: result, state: 'COMPLETED' } as Partial<NodeData>);
                        await runNode(node.id, { output: result });
                    } else {
                        await runNode(node.id, undefined, { connectionId: socketConnectionId });
                    }
                } catch {
                    updateNodeData(node.id, { state: 'ERROR' } as Partial<NodeData>);
                }
            },
            [node.id, node.inputData, node.config, blockDef, socketConnectionId]
        );

        const leftBorder = state !== 'IDLE' ? stateStyle.border : (STEREO_ACCENT[stereo] ?? '');

        const hasConnections = nodeConnections.inputs.length > 0 || nodeConnections.outputs.length > 0;
        const hasOutputPorts = outputPorts.length > 0;

        return (
            <div
                className={cn(
                    'rounded-lg border bg-card shadow-sm border-l-[3px] transition-all duration-200',
                    leftBorder,
                    state === 'RUNNING' && 'shadow-md',
                    isSelected && 'ring-2 ring-primary/30 shadow-md'
                )}
            >
                {/* Header row */}
                <div className="w-full px-3 py-2.5 flex items-center gap-2.5">
                    {/* Tappable area for config — not a button to avoid nesting */}
                    <div
                        role="button"
                        tabIndex={0}
                        onClick={() => onTapCard(node.id)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') onTapCard(node.id);
                        }}
                        className="flex-1 min-w-0 flex items-center gap-2.5 cursor-pointer active:scale-[0.98] transition-transform"
                    >
                        <div className="w-8 h-8 rounded-md bg-muted/40 flex items-center justify-center shrink-0">
                            <BlockIcon icon={blockDef?.icon} size={16} />
                        </div>

                        <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-semibold truncate leading-tight">{displayName}</div>
                            {blockDef?.label && node.customLabel && (
                                <div className="text-[10px] text-muted-foreground truncate leading-tight">
                                    {blockDef.label}
                                </div>
                            )}
                        </div>

                        {state !== 'IDLE' && (
                            <div
                                className={cn(
                                    'flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium',
                                    stateStyle.badge,
                                    stateStyle.badgeText
                                )}
                            >
                                {stateStyle.icon}
                                <span>{stateStyle.label}</span>
                            </div>
                        )}

                        <ChevronRight className="w-4 h-4 text-muted-foreground/30 shrink-0" />
                    </div>

                    {/* Run button — sibling, not nested */}
                    {blockDef?.isRunnable !== false && (
                        <button
                            onClick={handleRun}
                            disabled={state === 'RUNNING'}
                            className={cn(
                                'w-8 h-8 rounded-md flex items-center justify-center shrink-0 transition-colors',
                                'bg-primary/10 hover:bg-primary/20 text-primary active:scale-90',
                                'disabled:opacity-40'
                            )}
                        >
                            {state === 'RUNNING' ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <Play className="w-3.5 h-3.5 fill-current" />
                            )}
                        </button>
                    )}
                </div>

                {/* Connections + output ports */}
                {(hasConnections || hasOutputPorts) && (
                    <div className="px-3 pb-2.5 space-y-1.5">
                        {/* Input connections — display only */}
                        {inputPorts.map(port => {
                            const conn = nodeConnections.inputs.find(c => c.targetPortId === port.id);
                            if (!conn) return null;
                            const connName = getConnectedNodeName(conn.sourceNodeId);
                            const styleKey = getPortStyleKey(port.type ?? 'any');

                            return (
                                <div
                                    key={`in-${port.id}`}
                                    className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
                                >
                                    <ArrowDownLeft className="w-3 h-3 opacity-50 shrink-0" />
                                    <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', TYPE_DOT[styleKey])} />
                                    <span className="truncate">{connName}</span>
                                    <span className="opacity-30">→</span>
                                    <span className="font-medium text-foreground/70">{port.label || port.id}</span>
                                </div>
                            );
                        })}

                        {/* Output ports — tappable for connection */}
                        {outputPorts.map(port => {
                            const conns = nodeConnections.outputs.filter(c => c.sourcePortId === port.id);
                            const styleKey = getPortStyleKey(port.type ?? 'any');
                            const connCount = conns.length;

                            return (
                                <button
                                    key={`out-${port.id}`}
                                    onClick={() =>
                                        onTapOutputPort(
                                            node.id,
                                            port.id,
                                            port.type ?? 'any',
                                            displayName,
                                            port.label || port.id
                                        )
                                    }
                                    className={cn(
                                        'w-full flex items-center gap-1.5 text-[11px] px-2 py-1.5 -mx-0.5 rounded-md',
                                        'transition-colors hover:bg-muted/50 active:bg-muted/70',
                                        'text-left'
                                    )}
                                >
                                    <ArrowUpRight className="w-3 h-3 opacity-50 shrink-0" />
                                    <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', TYPE_DOT[styleKey])} />
                                    <span className="font-medium text-foreground/70">{port.label || port.id}</span>

                                    {connCount > 0 ? (
                                        <span className="text-muted-foreground truncate flex-1">
                                            → {conns.map(c => getConnectedNodeName(c.targetNodeId)).join(', ')}
                                        </span>
                                    ) : (
                                        <span className="text-muted-foreground/40 flex-1">not connected</span>
                                    )}

                                    <Link className="w-3 h-3 text-primary/50 shrink-0" />
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    }
);

MobileNodeCard.displayName = 'MobileNodeCard';
