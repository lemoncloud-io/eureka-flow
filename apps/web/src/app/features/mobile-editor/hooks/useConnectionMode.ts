import { useCallback, useMemo, useState } from 'react';

import { toast } from 'sonner';

import { createEdge, useCanvasConnections, useCanvasNodes, useCanvasStore } from '@flows/flows';

import { arePortTypesCompatible, generateTempId, wouldCreateCycle } from '../../flows/utils';

import type { Connection } from '@lemoncloud/eureka-flows-api';

type ConnectionModeState = 'IDLE' | 'SOURCE_SELECTED';

interface SourceSelection {
    nodeId: string;
    portId: string;
    portDataType: string;
    nodeName: string;
}

interface UseConnectionModeReturn {
    state: ConnectionModeState;
    source: SourceSelection | null;
    selectSourcePort: (nodeId: string, portId: string, portDataType: string, nodeName: string) => void;
    selectTargetPort: (nodeId: string, portId: string) => void;
    cancel: () => void;
    isPortCompatible: (nodeId: string, portDataType: string) => boolean;
}

export const useConnectionMode = (): UseConnectionModeReturn => {
    const [state, setState] = useState<ConnectionModeState>('IDLE');
    const [source, setSource] = useState<SourceSelection | null>(null);
    const connections = useCanvasConnections();
    const nodes = useCanvasNodes();

    // Pre-compute which nodes would create a cycle if connected from source
    const incompatibleNodeIds = useMemo(() => {
        if (!source) return new Set<string>();
        const result = new Set<string>();
        result.add(source.nodeId);
        for (const node of nodes) {
            if (node.id === source.nodeId) continue;
            if (wouldCreateCycle(connections, source.nodeId, node.id)) {
                result.add(node.id);
            }
        }
        return result;
    }, [source, connections, nodes]);

    const selectSourcePort = useCallback(
        (nodeId: string, portId: string, portDataType: string, nodeName: string) => {
            if (source?.nodeId === nodeId && source?.portId === portId) {
                setState('IDLE');
                setSource(null);
                return;
            }

            setSource({ nodeId, portId, portDataType, nodeName });
            setState('SOURCE_SELECTED');
        },
        [source]
    );

    const selectTargetPort = useCallback(
        async (targetNodeId: string, targetPortId: string) => {
            if (!source) return;

            const storeState = useCanvasStore.getState();
            const { connections: currentConnections, addConnection, updateConnection } = storeState;
            const flowId = storeState.flowId ?? '';

            if (wouldCreateCycle(currentConnections, source.nodeId, targetNodeId)) {
                toast.error('Cannot create circular connection');
                return;
            }

            const existing = currentConnections.find(
                c =>
                    c.sourceNodeId === source.nodeId &&
                    c.sourcePortId === source.portId &&
                    c.targetNodeId === targetNodeId &&
                    c.targetPortId === targetPortId
            );
            if (existing) {
                toast.info('Connection already exists');
                setState('IDLE');
                setSource(null);
                return;
            }

            const tempId = generateTempId('edge');
            const newConnection: Connection = {
                id: tempId,
                sourceNodeId: source.nodeId,
                sourcePortId: source.portId,
                targetNodeId,
                targetPortId,
            };

            addConnection(newConnection);
            setState('IDLE');
            setSource(null);

            try {
                const sourceNode = storeState.nodes.find(n => n.id === source.nodeId);
                const targetNode = storeState.nodes.find(n => n.id === targetNodeId);

                const result = await createEdge({
                    flowId,
                    sourceNodeId: source.nodeId,
                    sourcePortId: source.portId,
                    targetNodeId,
                    targetPortId,
                    sourceType: sourceNode?.type,
                    targetType: targetNode?.type,
                });

                if (result?.id && result.id !== tempId) {
                    updateConnection(tempId, { id: result.id });
                }

                toast.success('Connected');
            } catch {
                useCanvasStore.getState().deleteConnection(tempId);
                toast.error('Failed to create connection');
            }
        },
        [source]
    );

    const cancel = useCallback(() => {
        setState('IDLE');
        setSource(null);
    }, []);

    const isPortCompatible = useCallback(
        (nodeId: string, portDataType: string): boolean => {
            if (!source) return false;
            if (incompatibleNodeIds.has(nodeId)) return false;
            return arePortTypesCompatible(source.portDataType, portDataType);
        },
        [source, incompatibleNodeIds]
    );

    return {
        state,
        source,
        selectSourcePort,
        selectTargetPort,
        cancel,
        isPortCompatible,
    };
};
