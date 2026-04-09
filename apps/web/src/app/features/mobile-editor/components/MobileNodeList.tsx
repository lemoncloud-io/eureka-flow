import { useMemo } from 'react';

import { ChevronDown } from 'lucide-react';

import { useBlockRegistry, useCanvasConnections, useCanvasNodes } from '@flows/flows';

import { useMobileNodeOrder } from '../hooks';
import { buildNodeDisplayNames } from '../utils';
import { MobileNodeCard } from './MobileNodeCard';

interface MobileNodeListProps {
    onTapCard: (nodeId: string) => void;
    onTapOutputPort: (nodeId: string, portId: string, portDataType: string, nodeName: string, portName: string) => void;
    socketConnectionId?: string;
}

export const MobileNodeList = ({ onTapCard, onTapOutputPort, socketConnectionId }: MobileNodeListProps) => {
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

                return (
                    <div key={nodeId}>
                        {idx > 0 && showConnector && (
                            <div className="flex justify-center -my-0.5">
                                <ChevronDown className="w-4 h-4 text-primary/30" />
                            </div>
                        )}

                        <MobileNodeCard
                            node={node}
                            nodeConnections={nodeConnectionsMap.get(nodeId) ?? { inputs: [], outputs: [] }}
                            displayNames={displayNames}
                            onTapCard={onTapCard}
                            onTapOutputPort={onTapOutputPort}
                            socketConnectionId={socketConnectionId}
                        />
                    </div>
                );
            })}

            {nodes.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                    <p className="text-sm">No nodes yet</p>
                    <p className="text-xs mt-1 opacity-60">Tap + to add a block</p>
                </div>
            )}
        </div>
    );
};
