import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from 'sonner';

import { runFlow, useCanvasStore, useFlowsStore } from '@flows/flows';

import { useRunGate } from '../../flows/hooks/useRunGate';

import type { NodeData, NodeState } from '@lemoncloud/eureka-flows-api';

interface UseMobileRunAllReturn {
    runProgress: { current: number; total: number; currentNodeId?: string } | null;
    isRunning: boolean;
    handleRunAll: () => Promise<void>;
}

/**
 * Delegates to server via `runFlow()`. Node state updates arrive via WebSocket.
 */
interface UseMobileRunAllParams {
    socketConnectionId?: string;
}

export const useMobileRunAll = ({ socketConnectionId }: UseMobileRunAllParams = {}): UseMobileRunAllReturn => {
    const { t } = useTranslation(['flows']);
    const runGate = useRunGate();
    const [runProgress, setRunProgress] = useState<{ current: number; total: number; currentNodeId?: string } | null>(
        null
    );

    const handleRunAll = useCallback(async () => {
        const { nodes: working, connections } = useCanvasStore.getState();
        if (!(await runGate({ nodes: working, connections }))) return;

        // Read the id after the gate, not before: a flow with no id yet gets one from the
        // save the gate just made, and that store write has not re-rendered this callback.
        // The id it closed over is null, so the run would silently do nothing on exactly
        // the new-flow path.
        const runFlowId = useFlowsStore.getState().currentFlowId;
        if (!runFlowId) return;

        const { nodes, updateNodeData } = useCanvasStore.getState();
        const blockRegistry = useFlowsStore.getState().blockRegistry;

        // Collect input nodes with auto-execution enabled (same filter as desktop)
        const inputNodeIds = nodes
            .filter(n => {
                const def = blockRegistry[n.type];
                return def?.stereo === 'input' && n.autoExecutionEnabled !== false;
            })
            .map(n => n.id);

        if (inputNodeIds.length === 0) return;

        const total = inputNodeIds.length;

        // Set input nodes to RUNNING state
        for (const id of inputNodeIds) {
            updateNodeData(id, { state: 'RUNNING' as NodeState } as Partial<NodeData>);
        }
        setRunProgress({ current: 0, total });

        try {
            await runFlow(runFlowId, inputNodeIds, { connection: socketConnectionId });
        } catch {
            // Reset input nodes to IDLE on failure
            for (const id of inputNodeIds) {
                updateNodeData(id, { state: 'IDLE' as NodeState } as Partial<NodeData>);
            }
            toast.error(t('mobile.runAllFailed', { defaultValue: 'Failed to run flow' }));
        } finally {
            setRunProgress(null);
        }
    }, [runGate, socketConnectionId, t]);

    return {
        runProgress,
        isRunning: runProgress !== null,
        handleRunAll,
    };
};
