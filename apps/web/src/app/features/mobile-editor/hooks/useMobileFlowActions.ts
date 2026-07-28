import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from 'sonner';

import { captureBaseline, useBlocks, useCanvasStore, useFlows } from '@flows/flows';

import { loadFlowIntoEngine } from '../utils';

import type { FlowEngine } from '@flows/engine';

interface UseMobileFlowActionsParams {
    engine: FlowEngine;
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
    engine,
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
                    loadFlowIntoEngine(engine, flowData);
                    const { nodes, edges } = engine.getGraph();
                    captureBaseline({ nodes, connections: edges });
                }
                updateUrl(flowId);
            } catch {
                toast.error(t('flowEditor.failedToLoadFlow'));
            }
        },
        [engine, loadFlowById, updateUrl, t]
    );

    const handleAddBlock = useCallback(
        async (type: string): Promise<string | null> => {
            const { nodes } = engine.getGraph();
            const def = blockRegistry[type];
            if (!def) return null;

            // Place new node at the top: y less than current min so it sorts first.
            const minY = nodes.reduce((m, n) => Math.min(m, n.position?.y ?? Infinity), Infinity);
            const posX = nodes[0]?.position?.x ?? 100;
            const posY = nodes.length === 0 ? 100 : minY - 200;

            // `addNode` mints the id and fills the rest — IDLE state, empty port data,
            // auto-execution on — which is exactly the node this used to build by hand.
            let nodeId = '';
            engine.transact('node:add', ops => {
                nodeId = ops.addNode({ type, position: { x: posX, y: posY }, config: def.defaultConfig });
            });

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
                engine.transact('node:add:rollback', ops => ops.removeNodes([nodeId]));
                toast.error(t('mobile.failedToCreateNode', 'Failed to create node'));
                return null;
            }
        },
        [engine, blockRegistry, currentFlowId, saveCurrentFlow, updateUrl, lastLocalUpdateTimestampRef, t]
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
        // Both halves, or they disagree: the engine holds the graph and `clearWorkflow`
        // only empties the store's copy of it plus the selection and run state it owns.
        // Leaving the previous flow in the document is invisible today — nothing reads it
        // back until the next load, which replaces it anyway — but the first edit routed
        // through `transact` would edit that stale flow and the mirror would put it on the
        // new, supposedly empty canvas.
        engine.reset();
        useCanvasStore.getState().clearWorkflow();
        // No server flow yet — the first save claims the ID, so the URL has nothing to
        // point at until then.
        createNewFlow();
        updateUrl(null);
        toast.success(t('flowEditor.newFlowCreated'));
    }, [engine, createNewFlow, updateUrl, t]);

    return {
        handleSave,
        handleSelectFlow,
        handleAddBlock,
        handleExport,
        handleCreateNewFlow,
    };
};
