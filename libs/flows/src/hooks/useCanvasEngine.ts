import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { useBlockRegistry, useCanvasStore } from '../stores';
import { useCanvasHistory } from './useCanvasHistory';
import { useCanvasLayout } from './useCanvasLayout';

import type { DataPacket, NodeData, PortDefinition } from '@lemoncloud/eureka-flows-api';

const GRID_SIZE = 20;

interface UseCanvasEngineOptions {
    readOnly?: boolean;
    onNodeSelect?: (nodeId: string | null) => void;
    onChange?: () => void;
}

/**
 * Main canvas orchestration hook
 *
 * Combines history, layout, and provides node/connection operations.
 */
export const useCanvasEngine = ({ readOnly, onNodeSelect, onChange }: UseCanvasEngineOptions) => {
    const { t } = useTranslation(['flows', 'nodes']);
    const blockRegistry = useBlockRegistry();

    // Store state
    const {
        nodes,
        connections,
        viewport,
        selectedNodeId,
        setNodes,
        setConnections,
        setSelectedNodeId,
        setSelectedConnectionId,
        clearSelection,
    } = useCanvasStore();

    // Composed hooks
    const history = useCanvasHistory({ readOnly });
    const layout = useCanvasLayout({
        readOnly,
        onBeforeLayout: history.saveCheckpoint,
    });

    // Execution tracking ref
    const nodeInputHashesRef = useRef<Map<string, string>>(new Map());
    const isMounted = useRef(false);

    // Change detection for auto-save
    useEffect(() => {
        if (isMounted.current) {
            if (onChange && !readOnly) {
                onChange();
            }
        } else {
            isMounted.current = true;
        }
    }, [nodes, connections, onChange, readOnly]);

    const handleSelectionChange = useCallback(
        (nodeId: string | null) => {
            setSelectedNodeId(nodeId);
            onNodeSelect?.(nodeId);
        },
        [onNodeSelect, setSelectedNodeId]
    );

    const deleteNode = useCallback(
        (id: string) => {
            if (readOnly) return;
            history.saveCheckpoint();
            setNodes(prev => prev.filter(n => n.id !== id));
            setConnections(prev => prev.filter(c => c.sourceNodeId !== id && c.targetNodeId !== id));
            handleSelectionChange(null);
        },
        [readOnly, history, setNodes, setConnections, handleSelectionChange]
    );

    const duplicateNode = useCallback(
        (nodeId: string, generateId: () => string) => {
            if (readOnly) return;
            const node = nodes.find(n => n.id === nodeId);
            if (!node) return;

            history.saveCheckpoint();
            const newNode: NodeData = {
                ...node,
                id: generateId(),
                position: {
                    x: Math.round((node.position.x + 40) / GRID_SIZE) * GRID_SIZE,
                    y: Math.round((node.position.y + 40) / GRID_SIZE) * GRID_SIZE,
                },
                status: 'IDLE',
                inputData: {},
                outputData: {},
                errorMessage: undefined,
                config: node.config ? JSON.parse(JSON.stringify(node.config)) : {},
                autoExecutionEnabled: node.autoExecutionEnabled ?? true,
                customLabel: node.customLabel ? `${node.customLabel} (copy)` : undefined,
            };

            setNodes(prev => [...prev, newNode]);
            handleSelectionChange(newNode.id);
        },
        [readOnly, nodes, history, setNodes, handleSelectionChange]
    );

    const toggleNodeDisabled = useCallback(
        (nodeId: string) => {
            if (readOnly) return;
            history.saveCheckpoint();
            setNodes(prev =>
                prev.map(n =>
                    n.id === nodeId ? { ...n, disabled: !(n as NodeData & { disabled?: boolean }).disabled } : n
                )
            );
        },
        [readOnly, history, setNodes]
    );

    const deleteConnection = useCallback(
        (id: string) => {
            if (readOnly) return;
            history.saveCheckpoint();
            setConnections(prev => prev.filter(c => c.id !== id));
            setSelectedConnectionId(null);
        },
        [readOnly, history, setConnections, setSelectedConnectionId]
    );

    const propagateOutputs = useCallback(
        (sourceNodeId: string, outputs: Record<string, DataPacket>) => {
            const relevantConnections = connections.filter(c => c.sourceNodeId === sourceNodeId);
            if (relevantConnections.length === 0) return;

            setNodes(prevNodes => {
                let hasChanges = false;
                const nextNodes = prevNodes.map(node => {
                    const incoming = relevantConnections.filter(c => c.targetNodeId === node.id);
                    if (incoming.length === 0) return node;

                    const newInputData = { ...node.inputData };
                    let nodeChanged = false;

                    incoming.forEach(conn => {
                        const packet = outputs[conn.sourcePortId];
                        if (packet) {
                            newInputData[conn.targetPortId] = packet;
                            nodeChanged = true;
                        }
                    });

                    if (nodeChanged) {
                        hasChanges = true;
                        return { ...node, inputData: newInputData };
                    }
                    return node;
                });
                return hasChanges ? nextNodes : prevNodes;
            });
        },
        [connections, setNodes]
    );

    const executeNode = useCallback(
        async (nodeId: string, manualOverrideInputs?: Record<string, DataPacket>) => {
            if (readOnly) return;
            const startTime = Date.now();

            setNodes(prev =>
                prev.map(n =>
                    n.id === nodeId
                        ? {
                              ...n,
                              status: 'RUNNING',
                              errorMessage: undefined,
                              executionStats: { startTime, progress: 0, duration: 0 },
                          }
                        : n
                )
            );

            const currentNode = nodes.find(n => n.id === nodeId);
            if (!currentNode) return;

            const inputs = manualOverrideInputs || currentNode.inputData;
            const nodeDef = blockRegistry[currentNode.type];

            if (!nodeDef) {
                setNodes(prev =>
                    prev.map(n =>
                        n.id === nodeId
                            ? { ...n, status: 'ERROR', errorMessage: t('nodes:errors.unknownBlockType') }
                            : n
                    )
                );
                return;
            }

            const onProgress = (progress: number) => {
                setNodes(prev =>
                    prev.map(n =>
                        n.id === nodeId
                            ? {
                                  ...n,
                                  executionStats: {
                                      ...n.executionStats,
                                      progress: Math.min(Math.max(progress, 0), 100),
                                  },
                              }
                            : n
                    )
                );
            };

            try {
                const results = await nodeDef.execute(inputs, currentNode.config || {}, onProgress);
                const duration = Date.now() - startTime;

                const hash = nodeDef.inputs.map((p: PortDefinition) => inputs[p.id]?.timestamp).join('|');
                nodeInputHashesRef.current.set(nodeId, hash);

                setNodes(prev =>
                    prev.map(n =>
                        n.id === nodeId
                            ? {
                                  ...n,
                                  status: 'COMPLETED',
                                  outputData: results,
                                  executionStats: { startTime, duration, progress: 100 },
                              }
                            : n
                    )
                );

                propagateOutputs(nodeId, results);
            } catch (e: unknown) {
                const duration = Date.now() - startTime;
                const errorMessage = e instanceof Error ? e.message : t('flows:detailPanel.unknownError');

                setNodes(prev =>
                    prev.map(n =>
                        n.id === nodeId
                            ? {
                                  ...n,
                                  status: 'ERROR',
                                  errorMessage,
                                  executionStats: { startTime, duration, progress: 0 },
                              }
                            : n
                    )
                );
            }
        },
        [nodes, propagateOutputs, readOnly, blockRegistry, setNodes, t]
    );

    useEffect(() => {
        if (readOnly) return;

        nodes.forEach(node => {
            const def = blockRegistry[node.type];
            if (!def) return;
            if (def.inputs.length === 0) return;
            if (node.status === 'RUNNING') return;
            if (node.autoExecutionEnabled === false) return;

            const hasInputs = def.inputs.every(p => node.inputData?.[p.id]);
            if (!hasInputs) return;

            const currentInputHash = def.inputs.map(p => node.inputData?.[p.id]?.timestamp).join('|');
            const lastHash = nodeInputHashesRef.current.get(node.id);

            if (currentInputHash !== lastHash) {
                nodeInputHashesRef.current.set(node.id, currentInputHash);
                executeNode(node.id);
            }
        });
    }, [nodes, executeNode, readOnly, blockRegistry]);

    const handleConfigChange = useCallback(
        (nodeId: string, key: string, value: unknown) => {
            if (readOnly) return;
            history.saveCheckpoint();
            setNodes(prev =>
                prev.map(n => (n.id === nodeId ? { ...n, config: { ...(n.config || {}), [key]: value } } : n))
            );
        },
        [readOnly, history, setNodes]
    );

    const handleLabelChange = useCallback(
        (nodeId: string, label: string) => {
            if (readOnly) return;
            history.saveCheckpoint();
            setNodes(prev => prev.map(n => (n.id === nodeId ? { ...n, customLabel: label || undefined } : n)));
        },
        [readOnly, history, setNodes]
    );

    const handleDescriptionChange = useCallback(
        (nodeId: string, description: string) => {
            if (readOnly) return;
            history.saveCheckpoint();
            setNodes(prev => prev.map(n => (n.id === nodeId ? { ...n, description: description || undefined } : n)));
        },
        [readOnly, history, setNodes]
    );

    const handleToggleAuto = useCallback(
        (nodeId: string) => {
            if (readOnly) return;
            history.saveCheckpoint();
            setNodes(prev =>
                prev.map(n => (n.id === nodeId ? { ...n, autoExecutionEnabled: !n.autoExecutionEnabled } : n))
            );
        },
        [readOnly, history, setNodes]
    );

    const runAll = useCallback(() => {
        const inputNodeIds = nodes
            .filter(n => {
                const hasIncoming = connections.some(c => c.targetNodeId === n.id);
                const def = blockRegistry[n.type];
                return !hasIncoming || (def && def.inputs.length === 0);
            })
            .filter(n => !(n as NodeData & { disabled?: boolean }).disabled)
            .map(n => n.id);

        setNodes(prev => prev.map(n => (inputNodeIds.includes(n.id) ? { ...n, status: 'running' as const } : n)));
    }, [nodes, connections, blockRegistry, setNodes]);

    const stopAll = useCallback(() => {
        setNodes(prev => prev.map(n => (n.status === 'running' ? { ...n, status: 'idle' as const } : n)));
    }, [setNodes]);

    return {
        // State
        nodes,
        connections,
        viewport,
        selectedNodeId,
        blockRegistry,

        // History (from useCanvasHistory)
        pastRef: history.pastRef,
        futureRef: history.futureRef,
        dragStartSnapshotRef: history.dragStartSnapshotRef,
        saveCheckpoint: history.saveCheckpoint,
        undo: history.undo,
        redo: history.redo,

        // Selection Actions
        handleSelectionChange,
        clearSelection,

        // Node Actions
        deleteNode,
        duplicateNode,
        toggleNodeDisabled,
        executeNode,
        handleConfigChange,
        handleLabelChange,
        handleDescriptionChange,
        handleToggleAuto,

        // Connection Actions
        deleteConnection,

        // Layout Actions (from useCanvasLayout)
        autoLayout: layout.autoLayout,

        // Execution Actions
        runAll,
        stopAll,
    };
};
