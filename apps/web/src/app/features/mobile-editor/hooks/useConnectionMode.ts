import { useCallback, useMemo, useState } from 'react';

import { toast } from 'sonner';

import { upsertFlow, useCanvasConnections, useCanvasNodes, useCanvasStore } from '@flows/flows';

import { arePortTypesCompatible, generateTempId, wouldCreateCycle } from '../../flows/utils';

import type { BlockDefinitionWithFrontend } from '@flows/flows';
import type { Connection } from '@lemoncloud/eureka-flows-api';

interface SourceSelection {
    nodeId: string;
    portId: string;
    portDataType: string;
    nodeName: string;
    portName: string;
}

export interface CompatibleTarget {
    nodeId: string;
    nodeName: string;
    nodeIcon?: string;
    portId: string;
    portName: string;
    portDataType: string;
    alreadyConnected: boolean;
}

interface UseConnectionModeReturn {
    /** Whether the connection sheet is open */
    isOpen: boolean;
    /** The source port info */
    source: SourceSelection | null;
    /** List of compatible target ports */
    compatibleTargets: CompatibleTarget[];
    /** Open connection sheet for an output port */
    openForPort: (nodeId: string, portId: string, portDataType: string, nodeName: string, portName: string) => void;
    /** Connect to a target */
    connectTo: (targetNodeId: string, targetPortId: string) => void;
    /** Close the sheet */
    close: () => void;
    /** Disconnect an existing connection */
    disconnect: (connectionId: string) => void;
}

export const useConnectionMode = (
    blockRegistry: Record<string, BlockDefinitionWithFrontend>,
    flowId: string | null
): UseConnectionModeReturn => {
    const [source, setSource] = useState<SourceSelection | null>(null);
    const connections = useCanvasConnections();
    const nodes = useCanvasNodes();

    const isOpen = source !== null;

    // Compute compatible targets when source is selected
    const compatibleTargets = useMemo((): CompatibleTarget[] => {
        if (!source) return [];

        const targets: CompatibleTarget[] = [];

        for (const node of nodes) {
            if (node.id === source.nodeId) continue;
            if (wouldCreateCycle(connections, source.nodeId, node.id)) continue;

            const blockDef = blockRegistry[node.type];
            if (!blockDef?.inputs) continue;

            const nodeName = node.customLabel || blockDef.label || node.type;

            for (const port of blockDef.inputs) {
                if (!arePortTypesCompatible(source.portDataType, port.type)) continue;

                const alreadyConnected = connections.some(
                    c =>
                        c.sourceNodeId === source.nodeId &&
                        c.sourcePortId === source.portId &&
                        c.targetNodeId === node.id &&
                        c.targetPortId === port.id
                );

                targets.push({
                    nodeId: node.id,
                    nodeName,
                    nodeIcon: blockDef.icon,
                    portId: port.id,
                    portName: port.label || port.id,
                    portDataType: port.type ?? 'any',
                    alreadyConnected,
                });
            }
        }

        return targets;
    }, [source, nodes, connections, blockRegistry]);

    const openForPort = useCallback(
        (nodeId: string, portId: string, portDataType: string, nodeName: string, portName: string) => {
            setSource({ nodeId, portId, portDataType, nodeName, portName });
        },
        []
    );

    const connectTo = useCallback(
        async (targetNodeId: string, targetPortId: string) => {
            if (!source) return;

            const storeState = useCanvasStore.getState();
            const { connections: currentConnections, addConnection, updateConnection } = storeState;

            // Check if already connected
            const existing = currentConnections.find(
                c =>
                    c.sourceNodeId === source.nodeId &&
                    c.sourcePortId === source.portId &&
                    c.targetNodeId === targetNodeId &&
                    c.targetPortId === targetPortId
            );
            if (existing) {
                toast.info('Already connected');
                return;
            }

            // Create optimistically
            const tempId = generateTempId('edge');
            const newConnection: Connection = {
                id: tempId,
                sourceNodeId: source.nodeId,
                sourcePortId: source.portId,
                targetNodeId,
                targetPortId,
            };

            addConnection(newConnection);

            // Sync to backend via upsertFlow (same as desktop editor)
            try {
                if (!flowId) throw new Error('flowId is required');

                const edgeData = {
                    id: '',
                    sourceNodeId: source.nodeId,
                    sourcePortId: source.portId,
                    targetNodeId,
                    targetPortId,
                };

                const result = await upsertFlow(flowId, { nodes: [], edges: [edgeData] });
                const createdEdge = result.edges?.find(
                    e =>
                        e.sourceNodeId === edgeData.sourceNodeId &&
                        e.sourcePortId === edgeData.sourcePortId &&
                        e.targetNodeId === edgeData.targetNodeId &&
                        e.targetPortId === edgeData.targetPortId
                );

                if (createdEdge?.id && createdEdge.id !== tempId) {
                    updateConnection(tempId, { id: createdEdge.id });
                }

                toast.success('Connected');
            } catch {
                useCanvasStore.getState().deleteConnection(tempId);
                toast.error('Failed to create connection');
            }
        },
        [source, flowId]
    );

    const close = useCallback(() => {
        setSource(null);
    }, []);

    const disconnect = useCallback(
        async (connectionId: string) => {
            useCanvasStore.getState().deleteConnection(connectionId);
            try {
                if (!flowId) throw new Error('flowId is required');
                // Delete edge by prefixing ID with # (same as desktop editor)
                const edgesToDelete = [{ id: `#${connectionId}` }];
                await upsertFlow(flowId, { nodes: [], edges: edgesToDelete as never[] });
                toast.success('Disconnected');
            } catch {
                toast.error('Failed to disconnect');
            }
        },
        [flowId]
    );

    return {
        isOpen,
        source,
        compatibleTargets,
        openForPort,
        connectTo,
        close,
        disconnect,
    };
};
