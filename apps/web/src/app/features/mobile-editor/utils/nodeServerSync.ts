import { hydrateInputsFromUpstream, toPortVariantData, upsertPortNode } from '@flows/flows';

import type { DataPacket } from '@flows/flows';

/**
 * Save input port data to the server before node execution.
 * Server's hydrateInputs() reads from these port nodes.
 *
 * Which packet each port gets is `hydrateInputsFromUpstream`'s answer, not a second one.
 * This used to walk the edges itself — the two agreed, but only by coincidence, and the
 * desktop copy had already drifted into skipping a port that held a value.
 */
export const hydrateInputPorts = async (
    nodeId: string,
    flowId: string,
    connections: Array<{ sourceNodeId: string; sourcePortId: string; targetNodeId: string; targetPortId: string }>,
    nodes: Array<{ id: string; outputData?: Record<string, DataPacket> }>,
    existingInputData: Record<string, DataPacket>
): Promise<void> => {
    const inputData = hydrateInputsFromUpstream(nodeId, connections, nodes, existingInputData);

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
