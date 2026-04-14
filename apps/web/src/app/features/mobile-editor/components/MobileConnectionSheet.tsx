import { useMemo } from 'react';

import { ArrowRight, Check, CircleDot, Link2, Link2Off, PlugZap, Unlink, X } from 'lucide-react';

import { useBlockRegistry, useCanvasConnections, useCanvasNodes } from '@flows/flows';
import { cn } from '@flows/lib/utils';
import { Sheet, SheetContent, SheetTitle } from '@flows/ui-kit';

import { TYPE_DOT } from './consts';
import { BlockIcon } from '../../flows/components/BlockIcon';
import { getPortStyleKey } from '../../flows/utils';

import type { CompatibleTarget } from '../hooks/useConnectionMode';
import type { FlowRole } from '@flows/flows';

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
    role?: FlowRole;
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
    role = 'owner',
}: MobileConnectionSheetProps) => {
    const readOnly = role !== 'owner';
    const connections = useCanvasConnections();
    const nodes = useCanvasNodes();
    const blockRegistry = useBlockRegistry();
    const sourceStyleKey = getPortStyleKey(sourcePortDataType);

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
    const hasConnections = existingWithNames.length > 0;
    const hasAvailable = availableTargets.length > 0;

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="bottom"
                className="max-h-[85vh] rounded-t-2xl px-0 pb-[calc(1.5rem+env(safe-area-inset-bottom))] [&>button:first-child]:hidden"
            >
                {/* Drag handle */}
                <div className="flex justify-center pt-2 pb-2">
                    <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
                </div>

                {/* Header — source info with visual pipe */}
                <div className="px-4 pb-3">
                    <div className="flex items-center justify-between mb-2">
                        <SheetTitle className="text-sm font-semibold flex items-center gap-2">
                            <PlugZap className="w-4 h-4 text-primary" />
                            Connect output
                        </SheetTitle>
                        <button
                            type="button"
                            aria-label="Close"
                            onClick={() => onOpenChange(false)}
                            className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-lg flex items-center justify-center hover:bg-accent/50 transition-colors"
                        >
                            <X className="w-4 h-4 text-muted-foreground" />
                        </button>
                    </div>

                    {/* Source pill */}
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-border/40">
                        <CircleDot className="w-3.5 h-3.5 text-primary/60 shrink-0" />
                        <span className="text-xs font-medium text-foreground truncate">{sourceNodeName}</span>
                        <ArrowRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                        <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                            <span className={cn('w-2 h-2 rounded-full', TYPE_DOT[sourceStyleKey])} />
                            {sourcePortName}
                        </span>
                    </div>
                </div>

                <div className="border-t border-border/40" />

                <div className="overflow-y-auto max-h-[60vh]">
                    {/* Connected — prominent disconnect */}
                    {hasConnections && (
                        <div className="px-4 pt-3 pb-1">
                            <div className="flex items-center gap-1.5 mb-2">
                                <Link2 className="w-3 h-3 text-success" />
                                <span className="text-[10px] font-semibold text-success uppercase tracking-wider">
                                    Connected ({existingWithNames.length})
                                </span>
                            </div>
                            <div className="space-y-1.5">
                                {existingWithNames.map(conn => (
                                    <div
                                        key={conn.connectionId}
                                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-success/5 border border-success/15"
                                    >
                                        <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
                                            <BlockIcon icon={conn.targetIcon} size={15} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[13px] font-medium truncate">
                                                {conn.targetNodeName}
                                            </div>
                                            <div className="text-[10px] text-muted-foreground">
                                                {conn.targetPortName}
                                            </div>
                                        </div>
                                        <Check className="w-3.5 h-3.5 text-success/60 shrink-0" />
                                        {!readOnly && (
                                            <button
                                                onClick={() => onDisconnect(conn.connectionId)}
                                                className={cn(
                                                    'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium shrink-0',
                                                    'bg-destructive/8 text-destructive/70 border border-destructive/15',
                                                    'hover:bg-destructive/15 hover:text-destructive active:scale-95 transition-all'
                                                )}
                                            >
                                                <Unlink className="w-3 h-3" />
                                                <span>Disconnect</span>
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Available targets — owner only */}
                    {!readOnly && hasAvailable && (
                        <div className="px-4 pt-3 pb-2">
                            <div className="flex items-center gap-1.5 mb-2">
                                <Link2Off className="w-3 h-3 text-muted-foreground/60" />
                                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                    Available ({availableTargets.length})
                                </span>
                            </div>
                            <div className="space-y-1.5">
                                {availableTargets.map(target => {
                                    const targetStyleKey = getPortStyleKey(target.portDataType);
                                    return (
                                        <button
                                            key={`${target.nodeId}-${target.portId}`}
                                            onClick={() => onConnect(target.nodeId, target.portId)}
                                            className={cn(
                                                'w-full flex items-center gap-2.5 px-3 py-2 min-h-[44px] rounded-xl',
                                                'border border-border/40 bg-card',
                                                'hover:border-primary/30 hover:bg-primary/5',
                                                'active:scale-[0.97] transition-all duration-150',
                                                'text-left'
                                            )}
                                        >
                                            <div className="w-8 h-8 rounded-lg bg-muted/40 flex items-center justify-center shrink-0">
                                                <BlockIcon icon={target.nodeIcon} size={15} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-[13px] font-medium truncate">
                                                    {target.nodeName}
                                                </div>
                                                <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                    <span
                                                        className={cn(
                                                            'w-1.5 h-1.5 rounded-full',
                                                            TYPE_DOT[targetStyleKey]
                                                        )}
                                                    />
                                                    {target.portName}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 text-[11px] text-primary/50 font-medium shrink-0">
                                                <span>Connect</span>
                                                <ArrowRight className="w-3.5 h-3.5" />
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Empty state */}
                    {!hasAvailable && !hasConnections && (
                        <div className="px-4 py-10 text-center">
                            <Link2Off className="w-8 h-8 text-muted-foreground/20 mx-auto mb-3" />
                            <div className="text-sm text-muted-foreground">No compatible input ports found.</div>
                            <div className="text-xs text-muted-foreground/50 mt-1">
                                Add more nodes with matching input types.
                            </div>
                        </div>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
};
