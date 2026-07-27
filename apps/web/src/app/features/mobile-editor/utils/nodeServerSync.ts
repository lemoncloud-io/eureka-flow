import { toPortVariantData, upsertPortNode } from '@flows/flows';

import type { DataPacket } from '@flows/flows';

/**
 * Save input port data to the server before node execution.
 * Server's hydrateInputs() reads from these port nodes.
 */
export const hydrateInputPorts = async (
    nodeId: string,
    flowId: string,
    connections: Array<{ sourceNodeId: string; sourcePortId: string; targetNodeId: string; targetPortId: string }>,
    nodes: Array<{ id: string; outputData?: Record<string, DataPacket> }>,
    existingInputData: Record<string, DataPacket>
): Promise<void> => {
    const inputData: Record<string, DataPacket> = { ...existingInputData };

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
