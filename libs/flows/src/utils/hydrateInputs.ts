/**
 * Collect input data from upstream nodes' outputData.
 *
 * A connected input port takes whatever its source is producing now. This used to skip a
 * port that already held a value, to protect an input the user had set by hand — but
 * nothing ever set one (`executeNode`'s `manualOverrideInputs` was never passed by any
 * caller), so all the guard did was keep whatever an earlier run had left there. The run
 * then upserted that stale packet to the server's port record, which is what the backend
 * reads. Load-time propagation always overwrote, so the same actions gave a different
 * answer depending on whether the flow had been reloaded in between.
 *
 * If a manual override is ever added back, it has to be distinguishable from run
 * leftovers — the presence of a value cannot tell the two apart.
 *
 * Ports with no incoming connection are untouched: the loop only visits connected ones.
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
        const sourceNode = nodes.find(n => n.id === conn.sourceNodeId);
        const sourceOutput = sourceNode?.outputData?.[conn.sourcePortId];
        if (sourceOutput) {
            hydrated[conn.targetPortId] = sourceOutput;
        }
    }
    return hydrated;
};
