import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getPermissions, upsertNode, useBlockRegistry, useCanvasStore } from '@flows/flows';

import { isUnresolvedTempId, resolveTempId } from '../../flows/utils';

import type { FlowRole } from '@flows/flows';
import type { NodeConfigItem, NodeData } from '@lemoncloud/eureka-flows-api';

export const useNodeConfig = (nodeId: string | null, flowId: string | null, role: FlowRole) => {
    const node = useCanvasStore(state => (nodeId ? state.nodes.find(n => n.id === nodeId) : undefined));
    const blockRegistry = useBlockRegistry();
    const [customLabel, setCustomLabel] = useState('');

    const blockDef = node ? blockRegistry[node.type] : undefined;
    const syncTimerRef = useRef<number | null>(null);
    const { canEditConfig, canEditStructure, canRun } = useMemo(() => getPermissions(role), [role]);

    const configFields: NodeConfigItem[] = blockDef?.config$$ ?? node?.config$$ ?? [];

    const syncNodeToServer = useCallback(
        (updates: Record<string, unknown>) => {
            // Owner + Editor may sync config; for an Editor the server routes /nodes/:id/upsert
            // into their session overlay (CASE B). Viewer/Anonymous: blocked.
            if (!canEditConfig || !nodeId || !flowId || isUnresolvedTempId(nodeId)) return;
            if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
            syncTimerRef.current = window.setTimeout(() => {
                // resolveTempId: the server may have assigned the real ID while the UI
                // state still holds the temp ID — upserting the temp ID would re-create it
                upsertNode(resolveTempId(nodeId), flowId, updates).catch(err => {
                    console.error('[useNodeConfig] Failed to sync node:', err);
                });
            }, 500);
        },
        [canEditConfig, nodeId, flowId]
    );

    useEffect(
        () => () => {
            if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
        },
        [nodeId]
    );

    useEffect(() => {
        setCustomLabel(node?.customLabel ?? '');
    }, [node?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleConfigChange = useCallback(
        (key: string, value: unknown) => {
            // Owner + Editor edit any node config (Editor's change persists via session overlay)
            if (!canEditConfig || !nodeId) return;
            const currentNode = useCanvasStore.getState().nodes.find(n => n.id === nodeId);
            if (!currentNode) return;

            const newConfig = { ...currentNode.config, [key]: value };
            useCanvasStore.getState().updateNodeData(nodeId, { config: newConfig } as Partial<NodeData>);
            syncNodeToServer({ config: newConfig });
        },
        [canEditConfig, nodeId, syncNodeToServer]
    );

    const handleCustomLabelChange = useCallback(
        (value: string) => {
            if (!canEditStructure) return;
            setCustomLabel(value);
            if (!nodeId) return;
            useCanvasStore.getState().updateNodeData(nodeId, { customLabel: value } as Partial<NodeData>);
            syncNodeToServer({ customLabel: value || undefined });
        },
        [canEditStructure, nodeId, syncNodeToServer]
    );

    const handleDescriptionChange = useCallback(
        (value: string) => {
            if (!canEditStructure || !nodeId) return;
            useCanvasStore.getState().updateNodeData(nodeId, { description: value } as Partial<NodeData>);
            syncNodeToServer({ description: value || undefined });
        },
        [canEditStructure, nodeId, syncNodeToServer]
    );

    const handleToggleAuto = useCallback(
        (auto: boolean) => {
            if (!canEditStructure || !nodeId) return;
            useCanvasStore.getState().updateNodeData(nodeId, { auto } as Partial<NodeData>);
            syncNodeToServer({ auto });
        },
        [canEditStructure, nodeId, syncNodeToServer]
    );

    return {
        node,
        blockDef,
        canEditStructure,
        canRun,
        customLabel,
        configFields,
        handleConfigChange,
        handleCustomLabelChange,
        handleDescriptionChange,
        handleToggleAuto,
    };
};
