import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from 'sonner';

import { upsertNode, useBlocks, useCanvasStore, useFlows } from '@flows/flows';

import { generateTempId } from '../../flows/utils';

import type { SerializeWorkflowFn } from './types';
import type { NodeState } from '@flows/flows';
import type { NodeData } from '@lemoncloud/eureka-flows-api';

interface UseMobileFlowActionsParams {
    updateUrl: (flowId: string | null) => void;
    serializeWorkflowState: SerializeWorkflowFn;
    lastSavedStateRef: React.MutableRefObject<string | null>;
    lastLocalUpdateTimestampRef: React.MutableRefObject<number | null>;
}

interface UseMobileFlowActionsReturn {
    handleSave: () => Promise<void>;
    handleSelectFlow: (flowId: string) => Promise<void>;
    /** Returns the final node ID (server-assigned or temp) */
    handleAddBlock: (type: string) => Promise<string | null>;
    handleExport: () => void;
    /** Creates new flow without confirm — for MobileNewFlowSheet */
    handleCreateNewFlow: () => Promise<string | null>;
}

export const useMobileFlowActions = ({
    updateUrl,
    serializeWorkflowState,
    lastSavedStateRef,
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
            lastSavedStateRef.current = serializeWorkflowState({ nodes, connections });
            toast.success(t('flowEditor.savedAs', { flowName }));
            if (result.id !== currentFlowId) updateUrl(result.id);
        } else {
            toast.error(t('flowEditor.failedToSaveWorkflow'));
        }
    }, [
        saveCurrentFlow,
        flowName,
        currentFlowId,
        updateUrl,
        t,
        serializeWorkflowState,
        lastSavedStateRef,
        lastLocalUpdateTimestampRef,
    ]);

    const handleSelectFlow = useCallback(
        async (flowId: string) => {
            try {
                const flowData = await loadFlowById(flowId);
                if (flowData) {
                    useCanvasStore.getState().loadWorkflow(flowData);
                    lastSavedStateRef.current = serializeWorkflowState(flowData);
                }
                updateUrl(flowId);
            } catch {
                toast.error(t('flowEditor.failedToLoadFlow'));
            }
        },
        [loadFlowById, updateUrl, t, serializeWorkflowState, lastSavedStateRef]
    );

    const handleAddBlock = useCallback(
        async (type: string): Promise<string | null> => {
            const { nodes } = useCanvasStore.getState();
            const def = blockRegistry[type];
            if (!def) return null;

            const tempNodeId = generateTempId('node');
            const lastNode = nodes[nodes.length - 1];
            const posX = lastNode ? lastNode.position.x : 100;
            const posY = lastNode ? lastNode.position.y + 200 : 100;

            const newNode: NodeData = {
                id: tempNodeId,
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
                const result = await upsertNode('0', currentFlowId ?? '', {
                    blockId: type,
                    position: newNode.position,
                    config: newNode.config,
                });
                const serverId = result?.nodes?.[0]?.id;
                if (serverId && serverId !== tempNodeId) {
                    useCanvasStore
                        .getState()
                        .setNodes(prev => prev.map(n => (n.id === tempNodeId ? { ...n, id: serverId } : n)));
                    useCanvasStore.getState().setConnections(prev =>
                        prev.map(c => ({
                            ...c,
                            sourceNodeId: c.sourceNodeId === tempNodeId ? serverId : c.sourceNodeId,
                            targetNodeId: c.targetNodeId === tempNodeId ? serverId : c.targetNodeId,
                        }))
                    );
                    return serverId;
                }
                return tempNodeId;
            } catch {
                toast.error(t('mobile.failedToCreateNode', 'Failed to create node'));
                return null;
            }
        },
        [blockRegistry, currentFlowId, t]
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
    const handleCreateNewFlow = useCallback(async (): Promise<string | null> => {
        useCanvasStore.getState().clearWorkflow();
        lastSavedStateRef.current = serializeWorkflowState({ nodes: [], connections: [] });
        const newId = await createNewFlow();
        if (newId) {
            updateUrl(newId);
            toast.success(t('flowEditor.newFlowCreated'));
        }
        return newId;
    }, [createNewFlow, updateUrl, t, serializeWorkflowState, lastSavedStateRef]);

    return {
        handleSave,
        handleSelectFlow,
        handleAddBlock,
        handleExport,
        handleCreateNewFlow,
    };
};
