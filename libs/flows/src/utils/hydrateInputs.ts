/**
 * Collect input data from upstream nodes' outputData.
 * Fills gaps in existingInputs where a connection exists but inputData is stale
 * (e.g., connection was drawn after source node already executed).
 */
export const hydrateInputsFromUpstream = <T extends { value?: unknown; type?: string }>(
    nodeId: string,
    connections: ReadonlyArray<{
        sourceNodeId: string;
        sourcePortId: string;
        targetNodeId: string;
        targetPortId: string;
    }>,
    nodes: ReadonlyArray<{ id: string; outputData?: Record<string, T> }>,
    existingInputs: Record<string, T>
): Record<string, T> => {
    const hydrated = { ...existingInputs };
    for (const conn of connections) {
        if (conn.targetNodeId !== nodeId) continue;
        if (hydrated[conn.targetPortId]) continue;
        const sourceNode = nodes.find(n => n.id === conn.sourceNodeId);
        const sourceOutput = sourceNode?.outputData?.[conn.sourcePortId];
        if (sourceOutput) {
            hydrated[conn.targetPortId] = sourceOutput;
        }
    }
    return hydrated;
};
