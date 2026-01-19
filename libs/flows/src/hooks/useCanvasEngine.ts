import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { useBlockRegistry, useCanvasStore } from '../stores';

import type { DataPacket, NodeData, PortDefinition, WorkflowState } from '@lemoncloud/eureka-flows-api';

const GRID_SIZE = 20;

interface UseCanvasEngineOptions {
    readOnly?: boolean;
    onNodeSelect?: (nodeId: string | null) => void;
    onChange?: () => void;
}

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
        setViewport,
        setSelectedNodeId,
        setSelectedConnectionId,
        clearSelection,
    } = useCanvasStore();

    // History refs (kept as refs because they don't need to trigger re-renders)
    const pastRef = useRef<WorkflowState[]>([]);
    const futureRef = useRef<WorkflowState[]>([]);
    const dragStartSnapshotRef = useRef<WorkflowState | null>(null);
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

    // --- History Management ---
    const saveCheckpoint = useCallback(() => {
        if (readOnly) return;
        pastRef.current.push({
            nodes: JSON.parse(JSON.stringify(nodes)),
            connections: [...connections],
        });
        futureRef.current = [];
    }, [nodes, connections, readOnly]);

    const undo = useCallback(() => {
        if (readOnly || pastRef.current.length === 0) return;

        futureRef.current.push({
            nodes: JSON.parse(JSON.stringify(nodes)),
            connections: [...connections],
        });

        const previous = pastRef.current.pop();
        if (previous) {
            setNodes(previous.nodes);
            setConnections(previous.connections);
        }
    }, [nodes, connections, readOnly, setNodes, setConnections]);

    const redo = useCallback(() => {
        if (readOnly || futureRef.current.length === 0) return;

        pastRef.current.push({
            nodes: JSON.parse(JSON.stringify(nodes)),
            connections: [...connections],
        });

        const next = futureRef.current.pop();
        if (next) {
            setNodes(next.nodes);
            setConnections(next.connections);
        }
    }, [nodes, connections, readOnly, setNodes, setConnections]);

    // --- Selection Management ---
    const handleSelectionChange = useCallback(
        (nodeId: string | null) => {
            setSelectedNodeId(nodeId);
            if (onNodeSelect) {
                onNodeSelect(nodeId);
            }
        },
        [onNodeSelect, setSelectedNodeId]
    );

    // --- Node Operations ---
    const deleteNode = useCallback(
        (id: string) => {
            if (readOnly) return;
            saveCheckpoint();
            setNodes(prev => prev.filter(n => n.id !== id));
            setConnections(prev => prev.filter(c => c.sourceNodeId !== id && c.targetNodeId !== id));
            handleSelectionChange(null);
        },
        [readOnly, saveCheckpoint, setNodes, setConnections, handleSelectionChange]
    );

    const duplicateNode = useCallback(
        (nodeId: string, generateId: () => string) => {
            if (readOnly) return;
            const node = nodes.find(n => n.id === nodeId);
            if (!node) return;

            saveCheckpoint();
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
                config: JSON.parse(JSON.stringify(node.config)),
                autoExecutionEnabled: node.autoExecutionEnabled ?? true,
                customLabel: node.customLabel ? `${node.customLabel} (copy)` : undefined,
            };

            setNodes(prev => [...prev, newNode]);
            handleSelectionChange(newNode.id);
        },
        [readOnly, nodes, saveCheckpoint, setNodes, handleSelectionChange]
    );

    const toggleNodeDisabled = useCallback(
        (nodeId: string) => {
            if (readOnly) return;
            saveCheckpoint();
            setNodes(prev =>
                prev.map(n =>
                    n.id === nodeId ? { ...n, disabled: !(n as NodeData & { disabled?: boolean }).disabled } : n
                )
            );
        },
        [readOnly, saveCheckpoint, setNodes]
    );

    // --- Connection Operations ---
    const deleteConnection = useCallback(
        (id: string) => {
            if (readOnly) return;
            saveCheckpoint();
            setConnections(prev => prev.filter(c => c.id !== id));
            setSelectedConnectionId(null);
        },
        [readOnly, saveCheckpoint, setConnections, setSelectedConnectionId]
    );

    // --- Output Propagation ---
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

    // --- Node Execution ---
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
                              executionStats: {
                                  startTime,
                                  progress: 0,
                                  duration: 0,
                              },
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
                const results = await nodeDef.execute(inputs, currentNode.config, onProgress);
                const endTime = Date.now();
                const duration = endTime - startTime;

                const hash = nodeDef.inputs.map((p: PortDefinition) => inputs[p.id]?.timestamp).join('|');
                nodeInputHashesRef.current.set(nodeId, hash);

                setNodes(prev =>
                    prev.map(n =>
                        n.id === nodeId
                            ? {
                                  ...n,
                                  status: 'COMPLETED',
                                  outputData: results,
                                  executionStats: {
                                      startTime,
                                      duration,
                                      progress: 100,
                                  },
                              }
                            : n
                    )
                );

                propagateOutputs(nodeId, results);
            } catch (e: unknown) {
                const endTime = Date.now();
                const duration = endTime - startTime;
                const errorMessage = e instanceof Error ? e.message : t('flows:detailPanel.unknownError');

                setNodes(prev =>
                    prev.map(n =>
                        n.id === nodeId
                            ? {
                                  ...n,
                                  status: 'ERROR',
                                  errorMessage,
                                  executionStats: {
                                      startTime,
                                      duration,
                                      progress: 0,
                                  },
                              }
                            : n
                    )
                );
            }
        },
        [nodes, propagateOutputs, readOnly, blockRegistry, setNodes, t]
    );

    // --- Reactive Trigger ---
    useEffect(() => {
        if (readOnly) return;
        nodes.forEach(node => {
            const def = blockRegistry[node.type];
            if (!def) return;

            if (def.inputs.length === 0) return;
            if (node.status === 'RUNNING') return;
            if (node.autoExecutionEnabled === false) return;

            const hasInputs = def.inputs.every(p => node.inputData[p.id]);

            if (hasInputs) {
                const currentInputHash = def.inputs.map(p => node.inputData[p.id]?.timestamp).join('|');
                const lastHash = nodeInputHashesRef.current.get(node.id);

                if (currentInputHash !== lastHash) {
                    nodeInputHashesRef.current.set(node.id, currentInputHash);
                    executeNode(node.id);
                }
            }
        });
    }, [nodes, executeNode, readOnly, blockRegistry]);

    // --- Config & Label Handlers ---
    const handleConfigChange = useCallback(
        (nodeId: string, key: string, value: unknown) => {
            if (readOnly) return;
            saveCheckpoint();
            setNodes(prev => prev.map(n => (n.id === nodeId ? { ...n, config: { ...n.config, [key]: value } } : n)));
        },
        [readOnly, saveCheckpoint, setNodes]
    );

    const handleLabelChange = useCallback(
        (nodeId: string, label: string) => {
            if (readOnly) return;
            saveCheckpoint();
            setNodes(prev => prev.map(n => (n.id === nodeId ? { ...n, customLabel: label || undefined } : n)));
        },
        [readOnly, saveCheckpoint, setNodes]
    );

    const handleDescriptionChange = useCallback(
        (nodeId: string, description: string) => {
            if (readOnly) return;
            saveCheckpoint();
            setNodes(prev => prev.map(n => (n.id === nodeId ? { ...n, description: description || undefined } : n)));
        },
        [readOnly, saveCheckpoint, setNodes]
    );

    const handleToggleAuto = useCallback(
        (nodeId: string) => {
            if (readOnly) return;
            saveCheckpoint();
            setNodes(prev =>
                prev.map(n => (n.id === nodeId ? { ...n, autoExecutionEnabled: !n.autoExecutionEnabled } : n))
            );
        },
        [readOnly, saveCheckpoint, setNodes]
    );

    // --- Auto Layout ---
    const autoLayout = useCallback(() => {
        if (readOnly) return;
        if (nodes.length === 0) return;
        saveCheckpoint();

        const adj: Record<string, string[]> = {};
        const inDegree: Record<string, number> = {};
        const incomingEdges: Record<string, string[]> = {};

        nodes.forEach(n => {
            adj[n.id] = [];
            incomingEdges[n.id] = [];
            inDegree[n.id] = 0;
        });

        connections.forEach(c => {
            if (adj[c.sourceNodeId] && adj[c.targetNodeId] !== undefined) {
                adj[c.sourceNodeId].push(c.targetNodeId);
                incomingEdges[c.targetNodeId].push(c.sourceNodeId);
                inDegree[c.targetNodeId]++;
            }
        });

        const levels: Record<string, number> = {};
        const queue: string[] = [];

        nodes.forEach(n => {
            if (inDegree[n.id] === 0) {
                queue.push(n.id);
                levels[n.id] = 0;
            }
        });

        const processed = new Set<string>();
        const tempInDegree = { ...inDegree };

        while (queue.length > 0) {
            const u = queue.shift()!;
            processed.add(u);

            const neighbors = adj[u] || [];
            neighbors.forEach(v => {
                levels[v] = Math.max(levels[v] || 0, (levels[u] || 0) + 1);
                tempInDegree[v]--;
                if (tempInDegree[v] === 0) {
                    queue.push(v);
                }
            });
        }

        let maxLevel = 0;
        Object.values(levels).forEach(l => (maxLevel = Math.max(maxLevel, l)));

        nodes.forEach(n => {
            if (!processed.has(n.id)) {
                levels[n.id] = maxLevel + 1;
            }
        });

        const LEVEL_WIDTH = 300;
        const ROW_HEIGHT = 200;
        const START_X = 50;
        const START_Y = 50;

        const levelGroups: Record<number, NodeData[]> = {};
        nodes.forEach(n => {
            const l = levels[n.id] || 0;
            if (!levelGroups[l]) levelGroups[l] = [];
            levelGroups[l].push(n);
        });

        const sortedLevels = Object.keys(levelGroups)
            .map(Number)
            .sort((a, b) => a - b);
        const nodeYPositions: Record<string, number> = {};
        const positionedNodes = [...nodes];

        sortedLevels.forEach(level => {
            const group = levelGroups[level];
            group.sort((a, b) => {
                const getAvgParentY = (nodeId: string) => {
                    const parents = incomingEdges[nodeId];
                    if (parents.length === 0) return 0;
                    const sum = parents.reduce((acc, pid) => acc + (nodeYPositions[pid] || 0), 0);
                    return sum / parents.length;
                };
                const avgA = getAvgParentY(a.id);
                const avgB = getAvgParentY(b.id);
                if (Math.abs(avgA - avgB) < 10) return a.id.localeCompare(b.id);
                return avgA - avgB;
            });

            group.forEach((node, idx) => {
                const x = START_X + level * LEVEL_WIDTH;
                const y = START_Y + idx * ROW_HEIGHT;
                nodeYPositions[node.id] = y;
                const nodeIndex = positionedNodes.findIndex(n => n.id === node.id);
                if (nodeIndex !== -1) {
                    positionedNodes[nodeIndex] = {
                        ...positionedNodes[nodeIndex],
                        position: { x, y },
                    };
                }
            });
        });

        setNodes(positionedNodes);
        setViewport({ x: 20, y: 20, zoom: 1 });
    }, [readOnly, nodes, connections, saveCheckpoint, setNodes, setViewport]);

    // --- Run All / Stop All ---
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

        // Refs
        pastRef,
        futureRef,
        dragStartSnapshotRef,

        // History Actions
        saveCheckpoint,
        undo,
        redo,

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

        // Layout Actions
        autoLayout,

        // Execution Actions
        runAll,
        stopAll,
    };
};
