import { useMemo } from 'react';

import { ChevronDown } from 'lucide-react';

import { useCanvasConnections, useCanvasNodes } from '@flows/flows';

import { useMobileNodeOrder } from '../hooks';
import { MobileNodeCard } from './MobileNodeCard';

import type { useConnectionMode } from '../hooks';

interface MobileNodeListProps {
    connectionMode: ReturnType<typeof useConnectionMode>;
    onTapCard: (nodeId: string) => void;
    onDisconnect: (connectionId: string) => void;
    socketConnectionId?: string;
}

export const MobileNodeList = ({
    connectionMode,
    onTapCard,
    onDisconnect,
    socketConnectionId,
}: MobileNodeListProps) => {
    const nodes = useCanvasNodes();
    const connections = useCanvasConnections();
    const { orderedNodeIds } = useMobileNodeOrder();

    const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);

    // Pre-build connection pair set for O(1) adjacency checks
    const connectionPairs = useMemo(() => {
        const pairs = new Set<string>();
        for (const c of connections) {
            pairs.add(`${c.sourceNodeId}|${c.targetNodeId}`);
            pairs.add(`${c.targetNodeId}|${c.sourceNodeId}`);
        }
        return pairs;
    }, [connections]);

    // Pre-filter connections per node for card props
    const nodeConnectionsMap = useMemo(() => {
        const map = new Map<string, { inputs: typeof connections; outputs: typeof connections }>();
        for (const node of nodes) {
            map.set(node.id, {
                inputs: connections.filter(c => c.targetNodeId === node.id),
                outputs: connections.filter(c => c.sourceNodeId === node.id),
            });
        }
        return map;
    }, [nodes, connections]);

    const connectionModeProps = useMemo(
        () => ({
            isActive: connectionMode.state === 'SOURCE_SELECTED',
            isPortCompatible: connectionMode.isPortCompatible,
            sourceNodeId: connectionMode.source?.nodeId ?? null,
            sourcePortId: connectionMode.source?.portId ?? null,
            onSelectSource: connectionMode.selectSourcePort,
            onSelectTarget: connectionMode.selectTargetPort,
        }),
        [
            connectionMode.state,
            connectionMode.source,
            connectionMode.isPortCompatible,
            connectionMode.selectSourcePort,
            connectionMode.selectTargetPort,
        ]
    );

    return (
        <div className="flex flex-col gap-1 px-4 pb-24">
            {orderedNodeIds.map((nodeId, idx) => {
                const node = nodeMap.get(nodeId);
                if (!node) return null;

                const prevId = idx > 0 ? orderedNodeIds[idx - 1] : null;
                const showConnector = prevId ? connectionPairs.has(`${prevId}|${nodeId}`) : false;

                return (
                    <div key={nodeId}>
                        {idx > 0 && (
                            <div className="flex justify-center py-1">
                                {showConnector ? (
                                    <ChevronDown className="w-5 h-5 text-primary/40" />
                                ) : (
                                    <div className="w-px h-4 bg-border" />
                                )}
                            </div>
                        )}

                        <MobileNodeCard
                            node={node}
                            nodeConnections={nodeConnectionsMap.get(nodeId) ?? { inputs: [], outputs: [] }}
                            nodeMap={nodeMap}
                            connectionMode={connectionModeProps}
                            onTapCard={onTapCard}
                            onDisconnect={onDisconnect}
                            socketConnectionId={socketConnectionId}
                        />
                    </div>
                );
            })}

            {nodes.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                    <p className="text-sm">No nodes yet</p>
                    <p className="text-xs mt-1">Tap + to add a block</p>
                </div>
            )}
        </div>
    );
};
