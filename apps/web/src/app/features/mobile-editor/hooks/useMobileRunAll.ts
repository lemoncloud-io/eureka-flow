import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from 'sonner';

import { useCanvasStore, useFlows } from '@flows/flows';

import { executeNodeDirect, topologicalSort } from '../utils';

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
    const { currentFlowId } = useFlows();
    const [runProgress, setRunProgress] = useState<{ current: number; total: number; currentNodeId?: string } | null>(
        null
    );

    const handleRunAll = useCallback(async () => {
        const { nodes, connections } = useCanvasStore.getState();
        if (nodes.length === 0) return;

        const ordered = topologicalSort(nodes, connections);
        const total = ordered.length;
        let completed = 0;

        setRunProgress({ current: 0, total, currentNodeId: ordered[0] });

        for (const nodeId of ordered) {
            setRunProgress(prev => (prev ? { ...prev, currentNodeId: nodeId } : null));
            try {
                await executeNodeDirect(nodeId, {
                    flowId: currentFlowId,
                    socketConnectionId,
                    canEdit: true,
                });
                completed++;
                setRunProgress({ current: completed, total });
            } catch {
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
    }, [socketConnectionId, currentFlowId, t]);

    return {
        runProgress,
        isRunning: runProgress !== null,
        handleRunAll,
    };
};
