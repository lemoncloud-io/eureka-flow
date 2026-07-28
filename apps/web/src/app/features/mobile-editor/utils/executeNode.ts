import { toast } from 'sonner';

import { EXECUTE_FUNCTIONS, hydrateInputsFromUpstream, runNode, useCanvasStore, useFlowsStore } from '@flows/flows';

import { hydrateInputPorts } from './nodeServerSync';

import type { FlowEngine } from '@flows/engine';
import type { NodeData } from '@lemoncloud/eureka-flows-api';

export interface ExecuteNodeOptions {
    /** Run state and output are runtime, so they land through the engine, outside history. */
    engine: FlowEngine;
    flowId: string | null;
    socketConnectionId?: string;
    /** Whether the user can edit (owner). Affects hydration and run body. */
    canEdit?: boolean;
    /** If true, propagates to downstream nodes after execution (default: true for server) */
    propagate?: boolean;
}

/**
 * Pure node execution function — shared across useMobileRunAll, MobileStepDetail, and socket auto-execute.
 * Mirrors desktop WorkflowCanvas executeNode logic.
 */
export const executeNodeDirect = async (nodeId: string, options: ExecuteNodeOptions): Promise<void> => {
    const { engine, flowId, socketConnectionId, canEdit = true, propagate } = options;
    const { nodes, connections } = useCanvasStore.getState();
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    const blockRegistry = useFlowsStore.getState().blockRegistry;
    const blockDef = blockRegistry[node.type];
    if (!blockDef) return;

    engine.applyRuntime(nodeId, { state: 'RUNNING' } as Partial<NodeData>);

    try {
        const nodeConfig = (node.config ?? {}) as Record<string, string>;

        if (blockDef.isFrontend && EXECUTE_FUNCTIONS[blockDef.type]) {
            const executeFn = EXECUTE_FUNCTIONS[blockDef.type];
            const hydratedInputs = hydrateInputsFromUpstream(nodeId, connections, nodes, node.inputData ?? {});
            const result = await executeFn(hydratedInputs, node.config ?? {});
            engine.applyRuntime(nodeId, { outputData: result, state: 'COMPLETED' } as Partial<NodeData>);
            const runBody = canEdit ? { output: result } : { output: result, config: nodeConfig };
            await runNode(nodeId, runBody, { force: true, propagate, connection: socketConnectionId });
        } else {
            if (canEdit && flowId) {
                await hydrateInputPorts(nodeId, flowId, connections, nodes, node.inputData ?? {});
            }
            const runBody = canEdit ? undefined : { config: nodeConfig };
            await runNode(nodeId, runBody, { propagate, connection: socketConnectionId });
        }
    } catch (e) {
        engine.applyRuntime(nodeId, { state: 'ERROR' } as Partial<NodeData>);
        throw e;
    }
};

/**
 * Execute a node with toast error handling (for UI-triggered runs).
 */
export const executeNodeWithToast = async (nodeId: string, options: ExecuteNodeOptions): Promise<void> => {
    try {
        await executeNodeDirect(nodeId, options);
    } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Node execution failed');
    }
};
