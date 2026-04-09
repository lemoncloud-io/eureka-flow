import { useMemo } from 'react';

import { ArrowRight, Check, Link2, Unlink } from 'lucide-react';

import { useBlockRegistry, useCanvasConnections, useCanvasNodes } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { Sheet, SheetContent, SheetTitle } from '@flows/ui-kit';

import { TYPE_DOT } from './consts';
import { BlockIcon } from '../../flows/components/BlockIcon';
import { getPortStyleKey } from '../../flows/utils';

import type { CompatibleTarget } from '../hooks/useConnectionMode';


interface MobileConnectionSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    sourceNodeName: string;
    sourcePortName: string;
    sourcePortDataType: string;
    sourceNodeId: string;
    sourcePortId: string;
    compatibleTargets: CompatibleTarget[];
    onConnect: (targetNodeId: string, targetPortId: string) => void;
    onDisconnect: (connectionId: string) => void;
}

export const MobileConnectionSheet = ({
    open,
    onOpenChange,
    sourceNodeName,
    sourcePortName,
    sourcePortDataType,
    sourceNodeId,
    sourcePortId,
    compatibleTargets,
    onConnect,
    onDisconnect,
}: MobileConnectionSheetProps) => {
    const connections = useCanvasConnections();
    const nodes = useCanvasNodes();
    const blockRegistry = useBlockRegistry();
    const sourceStyleKey = getPortStyleKey(sourcePortDataType);

    // Existing connections FROM this port — with names resolved from nodes directly (not from compatibleTargets which excludes cycle-causing nodes)
    const existingWithNames = useMemo(() => {
        const filtered = connections.filter(c => c.sourceNodeId === sourceNodeId && c.sourcePortId === sourcePortId);
        return filtered.map(conn => {
            const targetNode = nodes.find(n => n.id === conn.targetNodeId);
            const targetDef = targetNode ? blockRegistry[targetNode.type] : undefined;
            return {
                connectionId: conn.id,
                targetNodeId: conn.targetNodeId,
                targetPortId: conn.targetPortId,
                targetNodeName: targetNode?.customLabel || targetDef?.label || conn.targetNodeId,
                targetPortName: conn.targetPortId,
                targetIcon: targetDef?.icon,
            };
        });
    }, [connections, sourceNodeId, sourcePortId, nodes, blockRegistry]);

    const availableTargets = compatibleTargets.filter(t => !t.alreadyConnected);

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="bottom" className="max-h-[80vh] rounded-t-2xl px-0 pb-8">
                {/* Drag handle */}
                <div className="flex justify-center pt-2 pb-3">
                    <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
                </div>

                {/* Header — source info */}
                <div className="px-4 pb-4 border-b border-border/60">
                    <SheetTitle className="text-sm font-semibold mb-2 flex items-center gap-2">
                        <Link2 className="w-4 h-4 text-primary" />
                        Connect output
                    </SheetTitle>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">{sourceNodeName}</span>
                        <ArrowRight className="w-3 h-3 opacity-40" />
                        <span className="flex items-center gap-1.5">
                            <span className={cn('w-2 h-2 rounded-full shrink-0', TYPE_DOT[sourceStyleKey])} />
                            {sourcePortName}
                        </span>
                    </div>
                </div>

                <div className="overflow-y-auto max-h-[55vh]">
                    {/* Existing connections */}
                    {existingWithNames.length > 0 && (
                        <div className="px-4 pt-3 pb-2">
                            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                                Connected
                            </div>
                            <div className="space-y-1">
                                {existingWithNames.map(conn => (
                                    <div
                                        key={conn.connectionId}
                                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-success/5 border border-success/20"
                                    >
                                        <div className="w-7 h-7 rounded-md bg-muted/40 flex items-center justify-center shrink-0">
                                            <BlockIcon icon={conn.targetIcon} size={14} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium truncate">{conn.targetNodeName}</div>
                                            <div className="text-[10px] text-muted-foreground">
                                                {conn.targetPortName}
                                            </div>
                                        </div>
                                        <Check className="w-4 h-4 text-success shrink-0" />
                                        <button
                                            onClick={() => onDisconnect(conn.connectionId)}
                                            className="w-8 h-8 rounded-md flex items-center justify-center text-destructive/60 hover:bg-destructive/10 hover:text-destructive transition-colors shrink-0"
                                        >
                                            <Unlink className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Available targets */}
                    <div className="px-4 pt-3">
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                            {availableTargets.length > 0
                                ? `Available (${availableTargets.length})`
                                : 'No compatible ports'}
                        </div>
                        <div className="space-y-1">
                            {availableTargets.map(target => {
                                const targetStyleKey = getPortStyleKey(target.portDataType);
                                return (
                                    <button
                                        key={`${target.nodeId}-${target.portId}`}
                                        onClick={() => onConnect(target.nodeId, target.portId)}
                                        className={cn(
                                            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg',
                                            'border border-border/40 bg-card',
                                            'hover:border-primary/40 hover:bg-primary/5',
                                            'active:scale-[0.98] transition-all duration-150',
                                            'text-left'
                                        )}
                                    >
                                        <div className="w-7 h-7 rounded-md bg-muted/40 flex items-center justify-center shrink-0">
                                            <BlockIcon icon={target.nodeIcon} size={14} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium truncate">{target.nodeName}</div>
                                            <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                <span
                                                    className={cn('w-1.5 h-1.5 rounded-full', TYPE_DOT[targetStyleKey])}
                                                />
                                                {target.portName}
                                            </div>
                                        </div>
                                        <ArrowRight className="w-4 h-4 text-muted-foreground/30 shrink-0" />
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {availableTargets.length === 0 && existingWithNames.length === 0 && (
                        <div className="px-4 py-8 text-center text-muted-foreground text-sm">
                            No compatible input ports found.
                            <br />
                            <span className="text-xs opacity-60">Add more nodes with matching input types.</span>
                        </div>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
};
