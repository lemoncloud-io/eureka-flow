import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from 'sonner';

import { EXECUTE_FUNCTIONS, runNode, useBlocks, useCanvasStore, useFlows } from '@flows/flows';

import { hydrateInputPorts, topologicalSort } from '../utils';

import type { NodeData } from '@lemoncloud/eureka-flows-api';

interface UseMobileRunAllParams {
    socketConnectionId: string | undefined;
}

interface UseMobileRunAllReturn {
    runProgress: { current: number; total: number } | null;
    isRunning: boolean;
    handleRunAll: () => Promise<void>;
}

export const useMobileRunAll = ({ socketConnectionId }: UseMobileRunAllParams): UseMobileRunAllReturn => {
    const { t } = useTranslation(['flows']);
    const { blockRegistry } = useBlocks();
    const { currentFlowId } = useFlows();
    const [runProgress, setRunProgress] = useState<{ current: number; total: number } | null>(null);

    const handleRunAll = useCallback(async () => {
        const { nodes, connections, updateNodeData } = useCanvasStore.getState();
        if (nodes.length === 0) return;

        const ordered = topologicalSort(nodes, connections);
        const nodeMap = new Map(nodes.map(n => [n.id, n]));
        const total = ordered.length;
        let completed = 0;

        setRunProgress({ current: 0, total });

        for (const nodeId of ordered) {
            const node = nodeMap.get(nodeId);
            if (!node) continue;

            updateNodeData(nodeId, { state: 'RUNNING' } as Partial<NodeData>);

            try {
                const blockDef = blockRegistry[node.type];
                if (blockDef?.isFrontend && EXECUTE_FUNCTIONS[blockDef.type]) {
                    const executeFn = EXECUTE_FUNCTIONS[blockDef.type];
                    const result = await executeFn(node.inputData ?? {}, node.config ?? {});
                    updateNodeData(nodeId, { outputData: result, state: 'COMPLETED' } as Partial<NodeData>);
                    await runNode(nodeId, { output: result }, { force: true, connection: socketConnectionId });
                } else {
                    if (currentFlowId) {
                        const latestNodes = useCanvasStore.getState().nodes;
                        await hydrateInputPorts(nodeId, currentFlowId, connections, latestNodes, node.inputData ?? {});
                    }
                    await runNode(nodeId, undefined, { connection: socketConnectionId });
                }
                completed++;
                setRunProgress({ current: completed, total });
            } catch {
                updateNodeData(nodeId, { state: 'ERROR' } as Partial<NodeData>);
                toast.error(
                    t('mobile.nodeFailed', {
                        current: completed + 1,
                        total,
                        defaultValue: `Node ${completed + 1}/${total} failed`,
                    })
                );
                break;
            }
        }

        setRunProgress(null);
        if (completed === total) {
            toast.success(
                t('mobile.allNodesCompleted', { count: total, defaultValue: `All ${total} nodes completed` })
            );
        }
    }, [blockRegistry, socketConnectionId, currentFlowId, t]);

    return {
        runProgress,
        isRunning: runProgress !== null,
        handleRunAll,
    };
};
