import { useCallback, useEffect, useMemo, useState } from 'react';

import { getPermissions, useBlockRegistry, useCanvasStore } from '@flows/flows';

import type { FlowEngine } from '@flows/engine';
import type { FlowRole } from '@flows/flows';
import type { ConfigField, NodeData } from '@lemoncloud/eureka-flows-api';

export const useNodeConfig = (nodeId: string | null, role: FlowRole, engine: FlowEngine) => {
    const node = useCanvasStore(state => (nodeId ? state.nodes.find(n => n.id === nodeId) : undefined));
    const blockRegistry = useBlockRegistry();
    const [customLabel, setCustomLabel] = useState('');

    const blockDef = node ? blockRegistry[node.type] : undefined;
    const { canEditConfig, canEditStructure, canRun } = useMemo(() => getPermissions(role), [role]);

    // Field *definitions*, which only the block carries — a node's stored config is
    // key/val pairs, a shape this list cannot render. `configSchema` is where they live;
    // the `config$$` this used to read exists on neither type, so it was always undefined
    // and the node fallback behind it is what actually rendered.
    const configFields: ConfigField[] = blockDef?.configSchema ?? [];

    useEffect(() => {
        setCustomLabel(node?.customLabel ?? '');
    }, [node?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleConfigChange = useCallback(
        (key: string, value: unknown) => {
            // Owner + Editor edit any node config; Viewer/Anonymous are blocked.
            if (!canEditConfig || !nodeId) return;
            // Read from the engine, not the store: the store is its projection, and the
            // merge below has to start from the copy the write lands on.
            const currentNode = engine.getGraph().nodes.find(n => n.id === nodeId);
            if (!currentNode) return;

            const newConfig = { ...currentNode.config, [key]: value };
            engine.transact('config:set', ops => ops.updateNode(nodeId, { config: newConfig } as Partial<NodeData>));
        },
        [canEditConfig, nodeId, engine]
    );

    const handleCustomLabelChange = useCallback(
        (value: string) => {
            if (!canEditStructure) return;
            setCustomLabel(value);
            if (!nodeId) return;
            engine.transact('node:label', ops => ops.updateNode(nodeId, { customLabel: value }));
        },
        [canEditStructure, nodeId, engine]
    );

    const handleDescriptionChange = useCallback(
        (value: string) => {
            if (!canEditStructure || !nodeId) return;
            engine.transact('node:description', ops => ops.updateNode(nodeId, { description: value }));
        },
        [canEditStructure, nodeId, engine]
    );

    const handleToggleAuto = useCallback(
        (auto: boolean) => {
            if (!canEditStructure || !nodeId) return;
            engine.transact('node:auto', ops => ops.updateNode(nodeId, { auto } as Partial<NodeData>));
        },
        [canEditStructure, nodeId, engine]
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
