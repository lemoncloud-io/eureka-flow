import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { ArrowDownRight, ChevronDown, Plus, Workflow } from 'lucide-react';

import { useBlockRegistry, useCanvasConnections, useCanvasNodes, useCanvasStore } from '@flows/flows';

import { useMobileNodeOrder } from '../hooks';
import { buildNodeDisplayNames } from '../utils';
import { MobileNodeCard } from './MobileNodeCard';
import { SwipeToDelete } from './SwipeToDelete';

interface MobileNodeListProps {
    onTapCard: (nodeId: string) => void;
    onTapOutputPort: (nodeId: string, portId: string, portDataType: string, nodeName: string, portName: string) => void;
    socketConnectionId?: string;
    selectedNodeId?: string | null;
    isReadOnly?: boolean;
}

export const MobileNodeList = ({
    onTapCard,
    onTapOutputPort,
    socketConnectionId,
    selectedNodeId,
    isReadOnly,
}: MobileNodeListProps) => {
    const { t } = useTranslation(['flows']);
    const nodes = useCanvasNodes();
    const connections = useCanvasConnections();
    const blockRegistry = useBlockRegistry();
    const { orderedNodeIds } = useMobileNodeOrder(nodes, connections);

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
        const map = new Map<string, { inputs: typeof connections; outputs: typeof connections }>();
        for (const c of connections) {
            if (!map.has(c.targetNodeId)) map.set(c.targetNodeId, { inputs: [], outputs: [] });
            if (!map.has(c.sourceNodeId)) map.set(c.sourceNodeId, { inputs: [], outputs: [] });
            map.get(c.targetNodeId)!.inputs.push(c);
            map.get(c.sourceNodeId)!.outputs.push(c);
        }
        return map;
    }, [connections]);

    return (
        <div className="flex flex-col gap-2 px-3 pb-24">
            {orderedNodeIds.map((nodeId, idx) => {
                const node = nodeMap.get(nodeId);
                if (!node) return null;

                const prevId = idx > 0 ? orderedNodeIds[idx - 1] : null;
                const showConnector = prevId ? connectionPairs.has(`${prevId}|${nodeId}`) : false;

                const card = (
                    <MobileNodeCard
                        node={node}
                        nodeConnections={nodeConnectionsMap.get(nodeId) ?? { inputs: [], outputs: [] }}
                        displayNames={displayNames}
                        onTapCard={onTapCard}
                        onTapOutputPort={onTapOutputPort}
                        socketConnectionId={socketConnectionId}
                        isSelected={nodeId === selectedNodeId}
                    />
                );

                const delay = Math.min(idx * 50, 400);

                return (
                    <div
                        key={nodeId}
                        className="animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-both"
                        style={{ animationDelay: `${delay}ms` }}
                    >
                        {idx > 0 && showConnector && (
                            <div className="flex justify-center -my-0.5">
                                <ChevronDown className="w-4 h-4 text-primary/30" />
                            </div>
                        )}

                        {isReadOnly ? (
                            card
                        ) : (
                            <SwipeToDelete onDelete={() => useCanvasStore.getState().deleteNode(nodeId)}>
                                {card}
                            </SwipeToDelete>
                        )}
                    </div>
                );
            })}

            {nodes.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    {/* Illustration */}
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
    );
};
