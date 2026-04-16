import { toPortVariantData, upsertFlow, upsertPortNode, useCanvasStore } from '@flows/flows';

import { isTempId } from '../../flows/utils';

import type { Connection } from '@lemoncloud/eureka-flows-api';

/**
 * Delete a node and its connected edges from the server.
 * Uses the `#` prefix convention to signal deletion via upsertFlow.
 */
export const deleteNodeWithSync = (nodeId: string, flowId: string | null): void => {
    const { connections, deleteNode } = useCanvasStore.getState();
    const connectedEdges = connections.filter(c => c.sourceNodeId === nodeId || c.targetNodeId === nodeId);

    deleteNode(nodeId);

    if (flowId && !isTempId(nodeId)) {
        const serverEdges = connectedEdges.filter((e: Connection) => e.id && !isTempId(e.id));
        upsertFlow(flowId, {
            nodes: [{ id: `#${nodeId}` }] as never[],
            edges: serverEdges.map((e: Connection) => ({ id: `#${e.id}` })) as never[],
        }).catch(err => {
            console.error('[deleteNodeWithSync] Failed to delete node:', err);
        });
    }
};

/**
 * Save input port data to the server before node execution.
 * Server's hydrateInputs() reads from these port nodes.
 */
export const hydrateInputPorts = async (
    nodeId: string,
    flowId: string,
    connections: Array<{ sourceNodeId: string; sourcePortId: string; targetNodeId: string; targetPortId: string }>,
    nodes: Array<{ id: string; outputData?: Record<string, { value: unknown; type: string }> }>,
    existingInputData: Record<string, { value: unknown; type: string }>
): Promise<void> => {
    const inputData: Record<string, { value: unknown; type: string }> = { ...existingInputData };

    for (const conn of connections.filter(c => c.targetNodeId === nodeId)) {
        const sourceNode = nodes.find(n => n.id === conn.sourceNodeId);
        const sourceOutput = sourceNode?.outputData?.[conn.sourcePortId];
        if (sourceOutput) {
            inputData[conn.targetPortId] = sourceOutput;
        }
    }

    if (Object.keys(inputData).length > 0) {
        await Promise.all(
            Object.entries(inputData).map(([portName, packet]) =>
                upsertPortNode(flowId, {
                    stereo: 'port',
                    parentId: nodeId,
                    direction: 'in',
                    name: portName,
                    dataType: packet.type,
                    data$: toPortVariantData(packet),
                })
            )
        );
    }
};
