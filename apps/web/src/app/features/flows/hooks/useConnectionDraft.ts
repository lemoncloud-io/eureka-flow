import { useCallback, useState } from 'react';

import { isValidConnection } from '../utils';

import type { Connection, NodeData } from '@lemoncloud/eureka-flows-api';

export interface ConnectionDraft {
    sourceNodeId: string;
    sourcePortId: string;
    sourceType: string;
    mouseX: number;
    mouseY: number;
}

interface UseConnectionDraftOptions {
    readOnly?: boolean;
    nodes: NodeData[];
    setNodes: React.Dispatch<React.SetStateAction<NodeData[]>>;
    setConnections: React.Dispatch<React.SetStateAction<Connection[]>>;
    onSaveCheckpoint?: () => void;
    generateId: () => string;
}

interface UseConnectionDraftReturn {
    connectionDraft: ConnectionDraft | null;
    startConnection: (nodeId: string, portId: string, portType: string, worldX: number, worldY: number) => void;
    updateConnectionPosition: (worldX: number, worldY: number) => void;
    finishConnection: (targetNodeId: string, targetPortId: string, targetType: string) => void;
    cancelConnection: () => void;
    isDrawingConnection: boolean;
}

export const useConnectionDraft = (options: UseConnectionDraftOptions): UseConnectionDraftReturn => {
    const { readOnly = false, nodes, setNodes, setConnections, onSaveCheckpoint, generateId } = options;

    const [connectionDraft, setConnectionDraft] = useState<ConnectionDraft | null>(null);

    const startConnection = useCallback(
        (nodeId: string, portId: string, portType: string, worldX: number, worldY: number) => {
            if (readOnly) return;

            setConnectionDraft({
                sourceNodeId: nodeId,
                sourcePortId: portId,
                sourceType: portType,
                mouseX: worldX,
                mouseY: worldY,
            });
        },
        [readOnly]
    );

    const updateConnectionPosition = useCallback(
        (worldX: number, worldY: number) => {
            if (!connectionDraft) return;

            setConnectionDraft(prev => (prev ? { ...prev, mouseX: worldX, mouseY: worldY } : null));
        },
        [connectionDraft]
    );

    const finishConnection = useCallback(
        (targetNodeId: string, targetPortId: string, targetType: string) => {
            if (readOnly || !connectionDraft) return;

            const sourceNode = nodes.find(n => n.id === connectionDraft.sourceNodeId);
            const targetNode = nodes.find(n => n.id === targetNodeId);

            if (
                sourceNode &&
                targetNode &&
                isValidConnection(sourceNode, 0, targetNode, 0, connectionDraft.sourceType, targetType)
            ) {
                onSaveCheckpoint?.();

                setConnections(prev => {
                    // Remove existing connection to the same target port
                    const filtered = prev.filter(
                        c => !(c.targetNodeId === targetNodeId && c.targetPortId === targetPortId)
                    );

                    const newConn: Connection = {
                        id: generateId(),
                        sourceNodeId: connectionDraft.sourceNodeId,
                        sourcePortId: connectionDraft.sourcePortId,
                        targetNodeId,
                        targetPortId,
                    };

                    return [...filtered, newConn];
                });

                // Propagate data if source has output
                if (sourceNode.outputData[connectionDraft.sourcePortId]) {
                    setNodes(prev =>
                        prev.map(n =>
                            n.id === targetNodeId
                                ? {
                                      ...n,
                                      inputData: {
                                          ...n.inputData,
                                          [targetPortId]: sourceNode.outputData[connectionDraft.sourcePortId],
                                      },
                                  }
                                : n
                        )
                    );
                }
            }

            setConnectionDraft(null);
        },
        [readOnly, connectionDraft, nodes, setConnections, setNodes, onSaveCheckpoint, generateId]
    );

    const cancelConnection = useCallback(() => {
        setConnectionDraft(null);
    }, []);

    return {
        connectionDraft,
        startConnection,
        updateConnectionPosition,
        finishConnection,
        cancelConnection,
        isDrawingConnection: connectionDraft !== null,
    };
};
