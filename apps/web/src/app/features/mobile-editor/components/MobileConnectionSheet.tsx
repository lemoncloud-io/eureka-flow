import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ArrowLeft, Check, ChevronDown, ChevronUp, Link2, Link2Off, Plus, Unlink } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { useBlockRegistry, useCanvasConnections, useCanvasNodes } from '@flows/flows';
import { cn } from '@flows/lib/utils';

import { STEREO_FALLBACK_LABEL, STEREO_ICON_BG } from './consts';
import { BlockIcon } from '../../flows/components/BlockIcon';

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
    onAddNewAndConnect?: () => void;
    direction?: 'output' | 'input';
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
    onAddNewAndConnect,
    direction = 'output',
    role = 'owner',
}: MobileConnectionSheetProps) => {
    const { t } = useTranslation(['flows']);
    const readOnly = role !== 'owner';
    const connections = useCanvasConnections();
    const nodes = useCanvasNodes();
    const blockRegistry = useBlockRegistry();

    const isOutput = direction === 'output';

    // Track newly connected node IDs for "new" badge
    const [newConnectionIds, setNewConnectionIds] = useState<Set<string>>(new Set());
    const newTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    const markAsNew = useCallback((connectionId: string) => {
        setNewConnectionIds(prev => new Set(prev).add(connectionId));
        // Clear existing timer if any
        const existing = newTimers.current.get(connectionId);
        if (existing) clearTimeout(existing);
        // Auto-remove after 5s
        const timer = setTimeout(() => {
            setNewConnectionIds(prev => {
                const next = new Set(prev);
                next.delete(connectionId);
                return next;
            });
            newTimers.current.delete(connectionId);
        }, 5000);
        newTimers.current.set(connectionId, timer);
    }, []);

    const handleConnect = useCallback(
        (targetNodeId: string, targetPortId: string) => {
            onConnect(targetNodeId, targetPortId);
            // Mark the target node as "new" — connection ID will match after re-render
            markAsNew(targetNodeId);
        },
        [onConnect, markAsNew]
    );

    const existingWithNames = useMemo(() => {
        const filtered = isOutput
            ? connections.filter(c => c.sourceNodeId === sourceNodeId && c.sourcePortId === sourcePortId)
            : connections.filter(c => c.targetNodeId === sourceNodeId && c.targetPortId === sourcePortId);
        return filtered.map(conn => {
            const otherNodeId = isOutput ? conn.targetNodeId : conn.sourceNodeId;
            const otherNode = nodes.find(n => n.id === otherNodeId);
            const otherDef = otherNode ? blockRegistry[otherNode.type] : undefined;
            const stereo = otherDef?.stereo ?? 'process';
            return {
                connectionId: conn.id,
                targetNodeId: otherNodeId,
                targetNodeName: otherNode?.customLabel || otherDef?.label || otherNodeId,
                targetIcon: otherDef?.icon,
                breadcrumb: `${STEREO_FALLBACK_LABEL[stereo] ?? stereo} · ${otherDef?.label ?? otherNodeId}`,
                stereo,
            };
        });
    }, [connections, sourceNodeId, sourcePortId, nodes, blockRegistry, isOutput]);

    const availableTargets = compatibleTargets.filter(t => !t.alreadyConnected);
    const hasConnections = existingWithNames.length > 0;
    const hasAvailable = availableTargets.length > 0;
    const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
    const toggleCard = (id: string) => {
        setExpandedCards(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="fixed inset-0 z-40 bg-background flex flex-col"
                    initial={{ x: '100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '100%' }}
                    transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                >
                    {/* Header */}
                    <header
                        className={cn(
                            'flex items-center gap-2 px-2 h-[71px] shrink-0',
                            'border-b border-border',
                            'pt-[env(safe-area-inset-top)]'
                        )}
                    >
                        <button
                            onClick={() => onOpenChange(false)}
                            className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-accent transition-colors shrink-0"
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                        <span className="text-sm font-semibold text-foreground">
                            {t('mobile.connection.nodeConnection', '노드 연결')}
                        </span>
                    </header>

                    {/* Scrollable body */}
                    <div className="flex-1 overflow-y-auto overscroll-contain">
                        {/* Connected nodes */}
                        <div className="px-4 pt-4 pb-2">
                            <div className="flex items-center gap-1.5 mb-3">
                                <Link2 className="w-3.5 h-3.5 text-success" />
                                <span className="text-xs font-semibold text-success">
                                    {t('mobile.connection.connectedNodes', '연결된 노드')} ({existingWithNames.length})
                                </span>
                            </div>
                            {hasConnections && (
                                <div className="space-y-2">
                                    {existingWithNames.map(conn => (
                                        <div
                                            key={conn.connectionId}
                                            className="rounded-xl bg-success/[0.03] border border-success/20 overflow-hidden"
                                        >
                                            <div className="flex items-center gap-2.5 px-3 py-3">
                                                <div
                                                    className={cn(
                                                        'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                                                        STEREO_ICON_BG[conn.stereo] ?? 'bg-muted/50'
                                                    )}
                                                >
                                                    <BlockIcon icon={conn.targetIcon} size={16} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-medium truncate">
                                                        {conn.targetNodeName}
                                                    </div>
                                                    <div className="text-[11px] text-muted-foreground truncate">
                                                        {conn.breadcrumb}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <Check className="w-4 h-4 text-success" />
                                                    {newConnectionIds.has(conn.targetNodeId) && (
                                                        <span className="text-[9px] font-bold text-success bg-success/10 px-1.5 py-0.5 rounded-full">
                                                            new
                                                        </span>
                                                    )}
                                                </div>
                                                {!readOnly && (
                                                    <button
                                                        onClick={() => onDisconnect(conn.connectionId)}
                                                        className={cn(
                                                            'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium shrink-0',
                                                            'bg-primary/5 text-primary/60 border border-primary/15',
                                                            'hover:bg-primary/10 transition-colors'
                                                        )}
                                                    >
                                                        <Unlink className="w-3 h-3" />
                                                        <span>{t('mobile.connection.disconnect', '연결 해제')}</span>
                                                    </button>
                                                )}
                                            </div>
                                            {expandedCards.has(conn.connectionId) &&
                                                (() => {
                                                    const otherNode = nodes.find(n => n.id === conn.targetNodeId);
                                                    const outData = otherNode?.outputData as
                                                        | Record<string, { value?: unknown; type?: string }>
                                                        | undefined;
                                                    const firstEntry = outData ? Object.values(outData)[0] : null;
                                                    const text =
                                                        firstEntry?.value && firstEntry.type !== 'image'
                                                            ? typeof firstEntry.value === 'string'
                                                                ? firstEntry.value
                                                                : JSON.stringify(firstEntry.value)
                                                            : null;
                                                    if (!text || text === 'null') return null;
                                                    return (
                                                        <div className="mx-3 mb-2 rounded-md bg-muted/15 p-2 text-[10px] text-muted-foreground leading-relaxed line-clamp-3">
                                                            {text.slice(0, 200)}
                                                        </div>
                                                    );
                                                })()}
                                            <button
                                                onClick={() => toggleCard(conn.connectionId)}
                                                className="w-full flex justify-center py-1 hover:bg-success/5 transition-colors"
                                            >
                                                {expandedCards.has(conn.connectionId) ? (
                                                    <ChevronUp className="w-4 h-4 text-muted-foreground/30" />
                                                ) : (
                                                    <ChevronDown className="w-4 h-4 text-muted-foreground/30" />
                                                )}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Add new block & connect */}
                        {!readOnly && onAddNewAndConnect && (
                            <div className="px-4 py-2">
                                <button
                                    onClick={onAddNewAndConnect}
                                    className={cn(
                                        'w-full flex items-center justify-center gap-2 py-3 rounded-xl',
                                        'border border-dashed border-primary/30',
                                        'text-sm font-medium text-primary',
                                        'hover:bg-primary/5 hover:border-primary/50',
                                        ' transition-all'
                                    )}
                                >
                                    <Plus className="w-4 h-4" />
                                    {t('mobile.connection.addNewAndConnect', '새 블록 추가 & 연결')}
                                </button>
                            </div>
                        )}

                        {/* Available targets */}
                        {!readOnly && hasAvailable && (
                            <div className="px-4 pt-3 pb-2">
                                <div className="flex items-center gap-1.5 mb-3">
                                    <Link2Off className="w-3.5 h-3.5 text-muted-foreground" />
                                    <span className="text-xs font-semibold text-muted-foreground">
                                        {t('mobile.connection.availableNodes', '연결 가능 노드')} (
                                        {availableTargets.length})
                                    </span>
                                </div>
                                <div className="space-y-2">
                                    {availableTargets.map(target => {
                                        const targetNode = nodes.find(n => n.id === target.nodeId);
                                        const targetDef = targetNode ? blockRegistry[targetNode.type] : undefined;
                                        const stereo = targetDef?.stereo ?? 'process';
                                        const breadcrumb = `${STEREO_FALLBACK_LABEL[stereo] ?? stereo} · ${targetDef?.label ?? target.nodeId}`;

                                        return (
                                            <button
                                                key={`${target.nodeId}-${target.portId}`}
                                                onClick={() => handleConnect(target.nodeId, target.portId)}
                                                className={cn(
                                                    'w-full rounded-xl overflow-hidden',
                                                    'border border-border bg-card',
                                                    'hover:border-primary/30 hover:bg-primary/5',
                                                    'transition-colors',
                                                    'text-left'
                                                )}
                                            >
                                                <div className="flex items-center gap-2.5 px-3 py-3">
                                                    <div
                                                        className={cn(
                                                            'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                                                            STEREO_ICON_BG[stereo] ?? 'bg-muted/50'
                                                        )}
                                                    >
                                                        <BlockIcon icon={target.nodeIcon} size={16} />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-sm font-medium truncate">
                                                            {target.nodeName}
                                                        </div>
                                                        <div className="text-[11px] text-muted-foreground truncate">
                                                            {breadcrumb}
                                                        </div>
                                                    </div>
                                                    <div className="text-[11px] font-medium shrink-0">
                                                        {target.occupiedByNode ? (
                                                            <span className="text-warning">
                                                                {t('mobile.connection.replace', '교체')}
                                                            </span>
                                                        ) : (
                                                            <span className="text-primary">
                                                                {t('mobile.connection.connect', '+ 연결')}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                {(() => {
                                                    const outData = targetNode?.outputData as
                                                        | Record<string, { value?: unknown; type?: string }>
                                                        | undefined;
                                                    if (!outData) return null;
                                                    const firstEntry = Object.values(outData)[0];
                                                    if (!firstEntry?.value || firstEntry.type === 'image') return null;
                                                    const text =
                                                        typeof firstEntry.value === 'string'
                                                            ? firstEntry.value
                                                            : JSON.stringify(firstEntry.value);
                                                    if (!text || text === 'null') return null;
                                                    return (
                                                        <div className="mx-3 mb-2 rounded-md bg-muted/15 p-2 text-[10px] text-muted-foreground leading-relaxed line-clamp-2">
                                                            {text.slice(0, 150)}
                                                        </div>
                                                    );
                                                })()}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Empty state */}
                        {!hasAvailable && !hasConnections && !onAddNewAndConnect && (
                            <div className="px-4 py-10 text-center">
                                <Link2Off className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                                <div className="text-sm text-muted-foreground">
                                    {t('mobile.connection.noCompatiblePorts', '호환되는 입력 포트가 없습니다.')}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Bottom CTA */}
                    <div
                        className={cn(
                            'shrink-0 border-t border-border',
                            'pb-[env(safe-area-inset-bottom)]',
                            'bg-background/80 backdrop-blur-xl'
                        )}
                    >
                        <div className="px-4 py-3">
                            <button
                                onClick={() => onOpenChange(false)}
                                className={cn(
                                    'w-full flex items-center justify-center gap-2 h-[51px] rounded-xl',
                                    'text-sm font-semibold transition-all',
                                    '',
                                    'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                                )}
                            >
                                {t('mobile.connection.done', '완료')}
                            </button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
