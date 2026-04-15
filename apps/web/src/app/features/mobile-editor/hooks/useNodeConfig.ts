import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getPermissions, upsertNode, useBlockRegistry, useCanvasStore } from '@flows/flows';

import { isTempId } from '../../flows/utils';

import type { FlowRole } from '@flows/flows';
import type { NodeConfigItem, NodeData } from '@lemoncloud/eureka-flows-api';

export const useNodeConfig = (nodeId: string | null, flowId: string | null, role: FlowRole) => {
    const node = useCanvasStore(state => (nodeId ? state.nodes.find(n => n.id === nodeId) : undefined));
    const blockRegistry = useBlockRegistry();
    const [customLabel, setCustomLabel] = useState('');

    const blockDef = node ? blockRegistry[node.type] : undefined;
    const syncTimerRef = useRef<number | null>(null);
    const { canEdit, canRun } = useMemo(() => getPermissions(role), [role]);

    const configFields: NodeConfigItem[] = blockDef?.config$$ ?? node?.config$$ ?? [];

    const syncNodeToServer = useCallback(
        (updates: Record<string, unknown>) => {
            if (!canEdit || !nodeId || !flowId || isTempId(nodeId)) return;
            if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
            syncTimerRef.current = window.setTimeout(() => {
                upsertNode(nodeId, flowId, updates).catch(err => {
                    console.error('[useNodeConfig] Failed to sync node:', err);
                });
            }, 500);
        },
        [canEdit, nodeId, flowId]
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
            if (role === 'anonymous' || !nodeId) return;
            const currentNode = useCanvasStore.getState().nodes.find(n => n.id === nodeId);
            if (!currentNode) return;
            if (role === 'guest' && !currentNode.type?.startsWith('input-')) return;

            const newConfig = { ...currentNode.config, [key]: value };
            useCanvasStore.getState().updateNodeData(nodeId, { config: newConfig } as Partial<NodeData>);
            syncNodeToServer({ config: newConfig });
        },
        [role, nodeId, syncNodeToServer]
    );

    const handleCustomLabelChange = useCallback(
        (value: string) => {
            if (!canEdit) return;
            setCustomLabel(value);
            if (!nodeId) return;
            useCanvasStore.getState().updateNodeData(nodeId, { customLabel: value } as Partial<NodeData>);
            syncNodeToServer({ customLabel: value || undefined });
        },
        [canEdit, nodeId, syncNodeToServer]
    );

    const handleDescriptionChange = useCallback(
        (value: string) => {
            if (!canEdit || !nodeId) return;
            useCanvasStore.getState().updateNodeData(nodeId, { description: value } as Partial<NodeData>);
            syncNodeToServer({ description: value || undefined });
        },
        [canEdit, nodeId, syncNodeToServer]
    );

    const handleToggleAuto = useCallback(
        (auto: boolean) => {
            if (!canEdit || !nodeId) return;
            useCanvasStore.getState().updateNodeData(nodeId, { auto } as Partial<NodeData>);
            syncNodeToServer({ auto });
        },
        [canEdit, nodeId, syncNodeToServer]
    );

    return {
        node,
        blockDef,
        canEdit,
        canRun,
        customLabel,
        configFields,
        handleConfigChange,
        handleCustomLabelChange,
        handleDescriptionChange,
        handleToggleAuto,
    };
};
