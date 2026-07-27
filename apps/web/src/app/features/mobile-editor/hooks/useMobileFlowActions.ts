import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from 'sonner';

import { captureBaseline, newNodeId, useBlocks, useCanvasStore, useFlows } from '@flows/flows';

import type { GraphNode, NodeState } from '@flows/flows';

interface UseMobileFlowActionsParams {
    updateUrl: (flowId: string | null) => void;
    lastLocalUpdateTimestampRef: React.MutableRefObject<number | null>;
}

interface UseMobileFlowActionsReturn {
    handleSave: () => Promise<void>;
    handleSelectFlow: (flowId: string) => Promise<void>;
    /** Returns the new node's ID */
    handleAddBlock: (type: string) => Promise<string | null>;
    handleExport: () => void;
    /** Creates new flow without confirm — for MobileNewFlowSheet */
    handleCreateNewFlow: () => void;
}

export const useMobileFlowActions = ({
    updateUrl,
    lastLocalUpdateTimestampRef,
}: UseMobileFlowActionsParams): UseMobileFlowActionsReturn => {
    const { t } = useTranslation(['flows']);
    const { currentFlowId, flowName, saveCurrentFlow, loadFlowById, createNewFlow } = useFlows();
    const { blockRegistry } = useBlocks();

    const handleSave = useCallback(async () => {
        const { nodes, connections } = useCanvasStore.getState();
        lastLocalUpdateTimestampRef.current = Date.now();
        const result = await saveCurrentFlow({ nodes, connections });
        if (result.success) {
            // A 200 does not mean the whole graph landed — an editor's added and deleted
            // steps are dropped server-side without complaint. Saying "saved" here would
            // be the more misleading of the two.
            if (result.structureDropped) {
                toast.error(
                    t(
                        'flowEditor.savedWithoutStructure',
                        'Saved the step settings only. Added and deleted steps need owner access.'
                    )
                );
            } else {
                toast.success(t('flowEditor.savedAs', { flowName }));
            }
            if (result.id !== currentFlowId) updateUrl(result.id);
        } else {
            toast.error(t('flowEditor.failedToSaveWorkflow'));
        }
    }, [saveCurrentFlow, flowName, currentFlowId, updateUrl, t, lastLocalUpdateTimestampRef]);

    const handleSelectFlow = useCallback(
        async (flowId: string) => {
            try {
                const flowData = await loadFlowById(flowId);
                if (flowData) {
                    const { loadWorkflow } = useCanvasStore.getState();
                    loadWorkflow(flowData);
                    const { nodes, connections } = useCanvasStore.getState();
                    captureBaseline({ nodes, connections });
                }
                updateUrl(flowId);
            } catch {
                toast.error(t('flowEditor.failedToLoadFlow'));
            }
        },
        [loadFlowById, updateUrl, t]
    );

    const handleAddBlock = useCallback(
        async (type: string): Promise<string | null> => {
            const { nodes } = useCanvasStore.getState();
            const def = blockRegistry[type];
            if (!def) return null;

            // Place new node at the top: y less than current min so it sorts first.
            const nodeId = newNodeId();
            const minY = nodes.reduce((m, n) => Math.min(m, n.position?.y ?? Infinity), Infinity);
            const posX = nodes[0]?.position?.x ?? 100;
            const posY = nodes.length === 0 ? 100 : minY - 200;

            const newNode: GraphNode = {
                id: nodeId,
                type,
                position: { x: posX, y: posY },
                config: { ...def.defaultConfig },
                state: 'IDLE' as NodeState,
                status: 'IDLE',
                inputData: {},
                outputData: {},
                autoExecutionEnabled: true,
            };

            useCanvasStore.getState().setNodes(prev => [...prev, newNode]);

            try {
                // Persist immediately so refresh within autosave debounce keeps the node.
                const { nodes: latestNodes, connections: latestConnections } = useCanvasStore.getState();
                lastLocalUpdateTimestampRef.current = Date.now();
                const saveResult = await saveCurrentFlow({ nodes: latestNodes, connections: latestConnections });
                if (saveResult.success && saveResult.id && saveResult.id !== currentFlowId) {
                    updateUrl(saveResult.id);
                }

                return nodeId;
            } catch {
                useCanvasStore.getState().setNodes(prev => prev.filter(n => n.id !== nodeId));
                toast.error(t('mobile.failedToCreateNode', 'Failed to create node'));
                return null;
            }
        },
        [blockRegistry, currentFlowId, saveCurrentFlow, updateUrl, lastLocalUpdateTimestampRef, t]
    );

    const handleExport = useCallback(() => {
        const { nodes, connections } = useCanvasStore.getState();
        const jsonString = JSON.stringify({ nodes, edges: connections }, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${flowName.replace(/\s+/g, '-').toLowerCase()}-${currentFlowId || Date.now()}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success(t('flowEditor.exportedToJson'));
    }, [flowName, currentFlowId, t]);

    /** Creates new flow without confirmation — for use by MobileNewFlowSheet */
    const handleCreateNewFlow = useCallback((): void => {
        useCanvasStore.getState().clearWorkflow();
        // No server flow yet — the first save claims the ID, so the URL has nothing to
        // point at until then.
        createNewFlow();
        updateUrl(null);
        toast.success(t('flowEditor.newFlowCreated'));
    }, [createNewFlow, updateUrl, t]);

    return {
        handleSave,
        handleSelectFlow,
        handleAddBlock,
        handleExport,
        handleCreateNewFlow,
    };
};
