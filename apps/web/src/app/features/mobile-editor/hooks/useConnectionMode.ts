import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from 'sonner';

import {
    newEdgeId,
    resolveNodeName,
    translateField,
    useCanvasConnections,
    useCanvasNodes,
    useCanvasStore,
} from '@flows/flows';

import { markConnectionNew } from './useRecentConnections';
import { arePortTypesCompatible, wouldCreateCycle } from '../../flows/utils';

import type { BlockDefinitionWithFrontend, GraphEdge } from '@flows/flows';

/** 'output' = connecting FROM this port's output, 'input' = connecting TO this port's input */
export type ConnectionDirection = 'output' | 'input';

interface PortSelection {
    nodeId: string;
    portId: string;
    portDataType: string;
    nodeName: string;
    portName: string;
    direction: ConnectionDirection;
}

export interface CompatibleTarget {
    nodeId: string;
    nodeName: string;
    nodeIcon?: string;
    portId: string;
    portName: string;
    portDataType: string;
    /** This exact source→target pair already exists */
    alreadyConnected: boolean;
    /** The target input port already has a connection from another source (will be replaced) */
    occupiedByNode?: string;
}

export const useConnectionMode = (blockRegistry: Record<string, BlockDefinitionWithFrontend>) => {
    const { t } = useTranslation(['flows', 'blocks']);
    const [source, setSource] = useState<PortSelection | null>(null);
    const connections = useCanvasConnections();
    const nodes = useCanvasNodes();

    const isOpen = source !== null;
    const direction = source?.direction ?? 'output';

    const compatibleTargets = useMemo((): CompatibleTarget[] => {
        if (!source) return [];

        const targets: CompatibleTarget[] = [];

        if (source.direction === 'output') {
            // Current behavior: find input ports on other nodes that accept this output
            for (const node of nodes) {
                if (node.id === source.nodeId) continue;
                if (wouldCreateCycle(connections, source.nodeId, node.id)) continue;

                const blockDef = blockRegistry[node.type];
                if (!blockDef?.inputs) continue;

                const nodeName = resolveNodeName(node, blockDef, t);

                for (const port of blockDef.inputs) {
                    if (!arePortTypesCompatible(source.portDataType, port.type)) continue;

                    const alreadyConnected = connections.some(
                        c =>
                            c.sourceNodeId === source.nodeId &&
                            c.sourcePortId === source.portId &&
                            c.targetNodeId === node.id &&
                            c.targetPortId === port.id
                    );

                    // Check if this input port is occupied by another source
                    const existingConn = connections.find(
                        c => c.targetNodeId === node.id && c.targetPortId === port.id
                    );
                    const occupiedByNode =
                        existingConn && !alreadyConnected
                            ? (() => {
                                  const srcNode = nodes.find(n => n.id === existingConn.sourceNodeId);
                                  const srcDef = srcNode ? blockRegistry[srcNode.type] : undefined;
                                  return resolveNodeName(srcNode, srcDef, t, existingConn.sourceNodeId);
                              })()
                            : undefined;

                    targets.push({
                        nodeId: node.id,
                        nodeName,
                        nodeIcon: blockDef.icon,
                        portId: port.id,
                        portName: translateField(t, port, 'label') || port.id,
                        portDataType: port.type ?? 'any',
                        alreadyConnected,
                        occupiedByNode,
                    });
                }
            }
        } else {
            // Reverse: find output ports on other nodes that can feed INTO this input
            for (const node of nodes) {
                if (node.id === source.nodeId) continue;
                if (wouldCreateCycle(connections, node.id, source.nodeId)) continue;

                const blockDef = blockRegistry[node.type];
                if (!blockDef?.outputs) continue;

                const nodeName = resolveNodeName(node, blockDef, t);

                for (const port of blockDef.outputs) {
                    if (!arePortTypesCompatible(port.type ?? 'any', source.portDataType)) continue;

                    const alreadyConnected = connections.some(
                        c =>
                            c.sourceNodeId === node.id &&
                            c.sourcePortId === port.id &&
                            c.targetNodeId === source.nodeId &&
                            c.targetPortId === source.portId
                    );

                    targets.push({
                        nodeId: node.id,
                        nodeName,
                        nodeIcon: blockDef.icon,
                        portId: port.id,
                        portName: translateField(t, port, 'label') || port.id,
                        portDataType: port.type ?? 'any',
                        alreadyConnected,
                    });
                }
            }
        }

        return targets;
    }, [source, nodes, connections, blockRegistry, t]);

    const openForPort = useCallback(
        (nodeId: string, portId: string, portDataType: string, nodeName: string, portName: string) => {
            setSource({ nodeId, portId, portDataType, nodeName, portName, direction: 'output' });
        },
        []
    );

    const openForInputPort = useCallback(
        (nodeId: string, portId: string, portDataType: string, nodeName: string, portName: string) => {
            setSource({ nodeId, portId, portDataType, nodeName, portName, direction: 'input' });
        },
        []
    );

    const connectTo = useCallback(
        async (targetNodeId: string, targetPortId: string) => {
            if (!source) return;

            // Determine actual source→target based on direction
            const srcNodeId = source.direction === 'output' ? source.nodeId : targetNodeId;
            const srcPortId = source.direction === 'output' ? source.portId : targetPortId;
            const tgtNodeId = source.direction === 'output' ? targetNodeId : source.nodeId;
            const tgtPortId = source.direction === 'output' ? targetPortId : source.portId;

            const storeState = useCanvasStore.getState();
            const { connections: currentConnections, addConnection, deleteConnection } = storeState;

            const existing = currentConnections.find(
                c =>
                    c.sourceNodeId === srcNodeId &&
                    c.sourcePortId === srcPortId &&
                    c.targetNodeId === tgtNodeId &&
                    c.targetPortId === tgtPortId
            );
            if (existing) {
                toast.info(t('mobile.connection.alreadyConnected', 'Already connected'));
                return;
            }

            // Input ports are 1:1 — disconnect any existing connection to this input port
            const existingInputConn = currentConnections.find(
                c => c.targetNodeId === tgtNodeId && c.targetPortId === tgtPortId
            );
            if (existingInputConn) {
                deleteConnection(existingInputConn.id);
            }

            const edgeId = newEdgeId();
            const newConnection: GraphEdge = {
                id: edgeId,
                sourceNodeId: srcNodeId,
                sourcePortId: srcPortId,
                targetNodeId: tgtNodeId,
                targetPortId: tgtPortId,
            };

            addConnection(newConnection);
            markConnectionNew(edgeId);

            // Copy source output data to target input data (same as desktop WorkflowCanvas)
            const srcNode = useCanvasStore.getState().nodes.find(n => n.id === srcNodeId);
            const packet = srcNode?.outputData?.[srcPortId];
            if (packet) {
                useCanvasStore
                    .getState()
                    .setNodes(prev =>
                        prev.map(n =>
                            n.id === tgtNodeId ? { ...n, inputData: { ...n.inputData, [tgtPortId]: packet } } : n
                        )
                    );
            }

            toast.success(t('mobile.connection.connected', 'Connected'));
        },
        [source]
    );

    const close = useCallback(() => {
        setSource(null);
    }, []);

    /** Direct connect between any two ports — does not require source state */
    const connectPorts = useCallback(
        async (sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string) => {
            const storeState = useCanvasStore.getState();
            const { connections: currentConnections } = storeState;

            const existing = currentConnections.find(
                c =>
                    c.sourceNodeId === sourceNodeId &&
                    c.sourcePortId === sourcePortId &&
                    c.targetNodeId === targetNodeId &&
                    c.targetPortId === targetPortId
            );
            if (existing) return;

            // Input ports are 1:1 — replace existing connection (same as desktop WorkflowCanvas)
            const existingInputConn = currentConnections.find(
                c => c.targetNodeId === targetNodeId && c.targetPortId === targetPortId
            );
            if (existingInputConn) {
                useCanvasStore.getState().deleteConnection(existingInputConn.id);
            }

            const edgeId = newEdgeId();
            const newConnection: GraphEdge = {
                id: edgeId,
                sourceNodeId,
                sourcePortId,
                targetNodeId,
                targetPortId,
            };

            useCanvasStore.getState().addConnection(newConnection);
            markConnectionNew(edgeId);

            // Copy source output data to target input data (same as desktop WorkflowCanvas)
            const srcNode = useCanvasStore.getState().nodes.find(n => n.id === sourceNodeId);
            const packet = srcNode?.outputData?.[sourcePortId];
            if (packet) {
                useCanvasStore
                    .getState()
                    .setNodes(prev =>
                        prev.map(n =>
                            n.id === targetNodeId ? { ...n, inputData: { ...n.inputData, [targetPortId]: packet } } : n
                        )
                    );
            }

            toast.success(t('mobile.connection.connected', 'Connected'));
        },
        []
    );

    const disconnect = useCallback((connectionId: string) => {
        useCanvasStore.getState().deleteConnection(connectionId);
        toast.success(t('mobile.connection.disconnected', 'Disconnected'));
    }, []);

    return {
        isOpen,
        direction,
        source,
        compatibleTargets,
        openForPort,
        openForInputPort,
        connectTo,
        connectPorts,
        close,
        disconnect,
    };
};
