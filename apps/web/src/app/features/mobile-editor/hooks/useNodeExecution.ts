import { useCallback } from 'react';

import { toast } from 'sonner';

import { EXECUTE_FUNCTIONS, getPermissions, runNode, useBlockRegistry, useCanvasStore } from '@flows/flows';

import { hydrateInputPorts } from '../utils';

import type { FlowRole } from '@flows/flows';
import type { NodeData } from '@lemoncloud/eureka-flows-api';

export const useNodeExecution = (
    nodeId: string | null,
    flowId: string | null,
    role: FlowRole,
    socketConnectionId?: string
) => {
    const node = useCanvasStore(state => (nodeId ? state.nodes.find(n => n.id === nodeId) : undefined));
    const blockRegistry = useBlockRegistry();
    const blockDef = node ? blockRegistry[node.type] : undefined;
    const { canEdit, canRun } = getPermissions(role);

    const handleRun = useCallback(async () => {
        if (!canRun || !nodeId || !node || !blockDef) return;
        const { updateNodeData, connections: conns, nodes: allNodes } = useCanvasStore.getState();
        updateNodeData(nodeId, { state: 'RUNNING' } as Partial<NodeData>);

        try {
            const nodeConfig = (node.config ?? {}) as Record<string, string>;

            if (blockDef.isFrontend && EXECUTE_FUNCTIONS[blockDef.type]) {
                const executeFn = EXECUTE_FUNCTIONS[blockDef.type];
                const result = await executeFn(node.inputData ?? {}, node.config ?? {});
                updateNodeData(nodeId, { outputData: result, state: 'COMPLETED' } as Partial<NodeData>);
                const runBody = canEdit ? { output: result } : { output: result, config: nodeConfig };
                await runNode(nodeId, runBody, { force: true, connection: socketConnectionId });
            } else {
                if (canEdit && flowId) {
                    await hydrateInputPorts(nodeId, flowId, conns, allNodes, node.inputData ?? {});
                }
                const runBody = canEdit ? undefined : { config: nodeConfig };
                await runNode(nodeId, runBody, { connection: socketConnectionId });
            }
        } catch (e) {
            updateNodeData(nodeId, { state: 'ERROR' } as Partial<NodeData>);
            toast.error(e instanceof Error ? e.message : 'Node execution failed');
        }
    }, [canRun, canEdit, nodeId, node, blockDef, socketConnectionId, flowId]);

    const isRunning = (node?.state as string) === 'RUNNING';

    return { handleRun, isRunning, canRun, blockDef };
};
