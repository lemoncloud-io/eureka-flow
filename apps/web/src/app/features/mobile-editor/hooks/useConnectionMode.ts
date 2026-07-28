import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from 'sonner';

import { resolveNodeName, translateField, useCanvasConnections, useCanvasNodes } from '@flows/flows';

import { markConnectionNew } from './useRecentConnections';
import { arePortTypesCompatible, wouldCreateCycle } from '../../flows/utils';

import type { FlowEngine } from '@flows/engine';
import type { BlockDefinitionWithFrontend } from '@flows/flows';

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

export const useConnectionMode = (blockRegistry: Record<string, BlockDefinitionWithFrontend>, engine: FlowEngine) => {
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

    /**
     * Make one edge, the way both entry points need it.
     *
     * Replacing an input's existing edge is **one transaction**: an input port is 1:1, so
     * the old edge has to go before the new one lands, and `connect` refuses cycles and
     * mismatched port types by throwing. Two transactions would leave the port with
     * neither edge when the second one is refused; `transact` rolls the whole thing back.
     *
     * Returns the new edge's id, or `null` when nothing was made.
     */
    const connectThroughEngine = useCallback(
        (sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string): string | null => {
            const { nodes, edges } = engine.getGraph();

            const already = edges.some(
                e =>
                    e.sourceNodeId === sourceNodeId &&
                    e.sourcePortId === sourcePortId &&
                    e.targetNodeId === targetNodeId &&
                    e.targetPortId === targetPortId
            );
            if (already) {
                toast.info(t('mobile.connection.alreadyConnected', 'Already connected'));
                return null;
            }

            const occupying = edges.find(e => e.targetNodeId === targetNodeId && e.targetPortId === targetPortId);

            let edgeId = '';
            try {
                engine.transact('edge:connect', ops => {
                    if (occupying) ops.disconnect([occupying.id]);
                    edgeId = ops.connect({ sourceNodeId, sourcePortId, targetNodeId, targetPortId });
                });
            } catch {
                toast.error(t('mobile.connection.failed', 'Could not connect these ports'));
                return null;
            }

            // Whatever the upstream already produced flows straight in — run output, not an
            // edit, so it lands outside the transaction and never reads as unsaved work.
            // Merged rather than assigned: `applyRuntime` replaces the field it is given,
            // and this target may already hold packets on its other input ports.
            const packet = nodes.find(n => n.id === sourceNodeId)?.outputData?.[sourcePortId];
            if (packet) {
                const target = engine.getGraph().nodes.find(n => n.id === targetNodeId);
                engine.applyRuntime(targetNodeId, { inputData: { ...target?.inputData, [targetPortId]: packet } });
            }

            toast.success(t('mobile.connection.connected', 'Connected'));
            return edgeId;
        },
        [engine, t]
    );

    const connectTo = useCallback(
        async (targetNodeId: string, targetPortId: string) => {
            if (!source) return;

            // Determine actual source→target based on direction
            const srcNodeId = source.direction === 'output' ? source.nodeId : targetNodeId;
            const srcPortId = source.direction === 'output' ? source.portId : targetPortId;
            const tgtNodeId = source.direction === 'output' ? targetNodeId : source.nodeId;
            const tgtPortId = source.direction === 'output' ? targetPortId : source.portId;

            const edgeId = connectThroughEngine(srcNodeId, srcPortId, tgtNodeId, tgtPortId);
            if (edgeId) markConnectionNew(edgeId);
        },
        [source, connectThroughEngine]
    );

    const close = useCallback(() => {
        setSource(null);
    }, []);

    /** Direct connect between any two ports — does not require source state */
    const connectPorts = useCallback(
        async (sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string) => {
            const edgeId = connectThroughEngine(sourceNodeId, sourcePortId, targetNodeId, targetPortId);
            if (edgeId) markConnectionNew(edgeId);
        },
        [connectThroughEngine]
    );

    const disconnect = useCallback(
        (connectionId: string) => {
            engine.transact('edge:disconnect', ops => ops.disconnect([connectionId]));
            toast.success(t('mobile.connection.disconnected', 'Disconnected'));
        },
        [engine, t]
    );

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
