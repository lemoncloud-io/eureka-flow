import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDownRight, ChevronDown, Plus, Workflow } from 'lucide-react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';

import { useBlockRegistry, useCanvasConnections, useCanvasNodes } from '@flows/flows';
import { cn } from '@flows/lib/utils';

import { useMobileNodeOrder } from '../hooks';
import { useMobileReorder } from '../hooks/useMobileReorder';
import { buildNodeDisplayNames, deleteNodeWithSync } from '../utils';
import { DragHandle } from './DragHandle';
import { MobileNodeCard } from './MobileNodeCard';
import { SwipeToDelete } from './SwipeToDelete';

import type { Connection } from '@lemoncloud/eureka-flows-api';

const EMPTY_CONNECTIONS = { inputs: [] as Connection[], outputs: [] as Connection[] };

interface MobileNodeListProps {
    onTapCard: (nodeId: string) => void;
    onTapOutputPort: (nodeId: string, portId: string, portDataType: string, nodeName: string, portName: string) => void;
    socketConnectionId?: string;
    selectedNodeId?: string | null;
    isReadOnly?: boolean;
    flowId: string | null;
    collapsedNodes?: Set<string>;
    onToggleCollapse?: (nodeId: string) => void;
}

interface SortableNodeItemProps {
    nodeId: string;
    isReadOnly?: boolean;
    flowId: string | null;
    children: React.ReactNode;
}

const SortableNodeItem = ({ nodeId, isReadOnly, flowId, children }: SortableNodeItemProps) => {
    const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
        id: nodeId,
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                'relative',
                isDragging && 'opacity-60 scale-[1.02] shadow-lg ring-2 ring-primary/30 z-50 rounded-lg'
            )}
        >
            <div className="flex items-stretch">
                {!isReadOnly && <DragHandle ref={setActivatorNodeRef} listeners={listeners} attributes={attributes} />}
                <div className="flex-1 min-w-0">
                    {isReadOnly ? (
                        children
                    ) : (
                        <SwipeToDelete onDelete={() => deleteNodeWithSync(nodeId, flowId)}>{children}</SwipeToDelete>
                    )}
                </div>
            </div>
        </div>
    );
};

export const MobileNodeList = ({
    onTapCard,
    onTapOutputPort,
    socketConnectionId,
    selectedNodeId,
    isReadOnly,
    flowId,
    collapsedNodes,
    onToggleCollapse,
}: MobileNodeListProps) => {
    const { t } = useTranslation(['flows']);
    const nodes = useCanvasNodes();
    const connections = useCanvasConnections();
    const blockRegistry = useBlockRegistry();
    const { orderedNodeIds } = useMobileNodeOrder(nodes, connections);

    const { sensors, handleDragEnd } = useMobileReorder({ orderedNodeIds, isReadOnly });

    const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);
    const displayNames = useMemo(() => buildNodeDisplayNames(nodes, blockRegistry), [nodes, blockRegistry]);

    const connectionPairs = useMemo(() => {
        const pairs = new Set<string>();
        for (const c of connections) {
            pairs.add(`${c.sourceNodeId}|${c.targetNodeId}`);
            pairs.add(`${c.targetNodeId}|${c.sourceNodeId}`);
        }
        return pairs;
    }, [connections]);

    const nodeConnectionsMap = useMemo(() => {
        const map = new Map<string, { inputs: Connection[]; outputs: Connection[] }>();
        for (const c of connections) {
            if (!map.has(c.targetNodeId)) map.set(c.targetNodeId, { inputs: [], outputs: [] });
            if (!map.has(c.sourceNodeId)) map.set(c.sourceNodeId, { inputs: [], outputs: [] });
            map.get(c.targetNodeId)!.inputs.push(c);
            map.get(c.sourceNodeId)!.outputs.push(c);
        }
        return map;
    }, [connections]);

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={orderedNodeIds} strategy={verticalListSortingStrategy}>
                <LayoutGroup>
                    <div className="flex flex-col gap-2 px-3 pb-24">
                        <AnimatePresence mode="popLayout">
                            {orderedNodeIds.map((nodeId, idx) => {
                                const node = nodeMap.get(nodeId);
                                if (!node) return null;

                                const prevId = idx > 0 ? orderedNodeIds[idx - 1] : null;
                                const showConnector = prevId ? connectionPairs.has(`${prevId}|${nodeId}`) : false;

                                return (
                                    <motion.div
                                        key={nodeId}
                                        layout
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0, x: -100 }}
                                        transition={{ duration: 0.2, ease: 'easeOut' }}
                                    >
                                        {idx > 0 && showConnector && (
                                            <div className="flex justify-center -my-0.5">
                                                <ChevronDown className="w-4 h-4 text-primary/30" />
                                            </div>
                                        )}
                                        <SortableNodeItem nodeId={nodeId} isReadOnly={isReadOnly} flowId={flowId}>
                                            <MobileNodeCard
                                                node={node}
                                                nodeConnections={nodeConnectionsMap.get(nodeId) ?? EMPTY_CONNECTIONS}
                                                displayNames={displayNames}
                                                onTapCard={onTapCard}
                                                onTapOutputPort={onTapOutputPort}
                                                socketConnectionId={socketConnectionId}
                                                isSelected={nodeId === selectedNodeId}
                                                flowId={flowId}
                                                isCollapsed={collapsedNodes?.has(nodeId)}
                                                onToggleCollapse={onToggleCollapse}
                                            />
                                        </SortableNodeItem>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>

                        {nodes.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                                <div className="relative w-20 h-20 mb-5">
                                    <div className="absolute inset-0 rounded-2xl bg-primary/5 border border-primary/10" />
                                    <Workflow className="absolute inset-0 m-auto w-10 h-10 text-primary/30" />
                                    <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                                        <Plus className="w-3.5 h-3.5 text-primary/50" />
                                    </div>
                                </div>

                                <p className="text-sm font-medium text-foreground/70 mb-1">
                                    {t('mobile.emptyState.title', 'Start building your flow')}
                                </p>
                                <p className="text-xs text-muted-foreground/60 mb-6 text-center px-8">
                                    {t(
                                        'mobile.emptyState.description',
                                        'Add blocks to create an AI workflow. Connect them to pass data between steps.'
                                    )}
                                </p>

                                <div className="flex items-center gap-1.5 text-xs text-primary/60 animate-bounce">
                                    <span>{t('mobile.emptyState.tapHint', 'Tap')}</span>
                                    <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                                        <Plus className="w-3 h-3" />
                                    </span>
                                    <span>{t('mobile.emptyState.toAddBlock', 'to add a block')}</span>
                                    <ArrowDownRight className="w-4 h-4 ml-1" />
                                </div>
                            </div>
                        )}
                    </div>
                </LayoutGroup>
            </SortableContext>
            <DragOverlay dropAnimation={null} />
        </DndContext>
    );
};
