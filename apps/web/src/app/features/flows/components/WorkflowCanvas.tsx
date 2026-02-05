import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { X } from 'lucide-react';

import {
    LAYOUT_CONFIG,
    estimateNodeHeight,
    loadFlow,
    requiresBackendProcessing,
    runNode,
    useBlockRegistry,
} from '@flows/flows';

import { ConnectionLine } from './ConnectionLine';
import { DetailPanel } from './DetailPanel';
import { LogModal } from './LogModal';
import { NodeBlock } from './NodeBlock';
import { TooltipImage } from './TooltipImage';
import { ZoomControls } from './ZoomControls';
import { generateId, isValidConnection } from '../utils';

import type { Connection, DataPacket, NodeData, PortDefinition, WorkflowState } from '@lemoncloud/eureka-flows-api';

export interface WorkflowCanvasRef {
    addNode: (type: string) => void;
    getWorkflow: () => WorkflowState;
    loadWorkflow: (state: WorkflowState) => void;
    clearWorkflow: () => void;
    newWorkflow: () => void;
    undo: () => void;
    redo: () => void;
    autoLayout: () => void;
    selectNode: (nodeId: string | null) => void;
    runAll: () => Promise<void>;
    /** Update node data (used for socket status updates) */
    updateNode: (nodeId: string, updates: Partial<NodeData>) => void;
    stopAll: () => void;
}

interface WorkflowCanvasProps {
    readOnly?: boolean;
    initialData?: WorkflowState;
    onNodeSelect?: (nodeId: string | null) => void;
    onChange?: () => void;
    /** Called before running a node that requires backend processing. Should save the flow. */
    onBeforeBackendRun?: () => Promise<void>;
}

const GRID_SIZE = 20;

export const WorkflowCanvas = forwardRef<WorkflowCanvasRef, WorkflowCanvasProps>(
    ({ readOnly, initialData, onNodeSelect, onChange, onBeforeBackendRun }, ref) => {
        const { t } = useTranslation(['flows', 'nodes']);
        const blockRegistry = useBlockRegistry();

        const [nodes, setNodes] = useState<NodeData[]>([]);
        const [connections, setConnections] = useState<Connection[]>([]);
        const [clipboard, setClipboard] = useState<NodeData | null>(null);

        const pastRef = useRef<WorkflowState[]>([]);
        const futureRef = useRef<WorkflowState[]>([]);
        const dragStartSnapshotRef = useRef<WorkflowState | null>(null);
        const nodeInputHashesRef = useRef<Map<string, string>>(new Map());
        const executeNodeRef = useRef<(nodeId: string) => Promise<void>>();
        /** Counter for batch run operations. When > 0, skip individual saves (already saved by runAll) */
        const batchRunCountRef = useRef(0);

        const nodesRef = useRef(nodes);
        const connectionsRef = useRef(connections);
        nodesRef.current = nodes;
        connectionsRef.current = connections;

        /** Queue for pending node executions to ensure sequential processing */
        const executionQueueRef = useRef<Set<string>>(new Set());
        const isProcessingQueueRef = useRef(false);
        /** Track currently executing nodes to prevent concurrent execution of the same node */
        const executingNodesRef = useRef<Set<string>>(new Set());

        const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
        const [isPanning, setIsPanning] = useState(false);
        const lastMousePosRef = useRef({ x: 0, y: 0 });

        const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
        const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
        const [hoveredConnectionId, setHoveredConnectionId] = useState<string | null>(null);

        const [logViewerNodeId, setLogViewerNodeId] = useState<string | null>(null);

        const [dragState, setDragState] = useState<{
            nodeId: string;
            startX: number;
            startY: number;
            initialX: number;
            initialY: number;
        } | null>(null);
        const [tooltip, setTooltip] = useState<{ x: number; y: number; content: unknown; type: string } | null>(null);

        const [modalFlowId, setModalFlowId] = useState<string | null>(null);
        const [modalFlowData, setModalFlowData] = useState<WorkflowState | null>(null);

        const [connectionDraft, setConnectionDraft] = useState<{
            sourceNodeId: string;
            sourcePortId: string;
            sourceType: string;
            mouseX: number;
            mouseY: number;
        } | null>(null);

        const canvasRef = useRef<HTMLDivElement>(null);

        const isMounted = useRef(false);
        useEffect(() => {
            if (isMounted.current) {
                if (onChange && !readOnly) {
                    onChange();
                }
            } else {
                isMounted.current = true;
            }
        }, [nodes, connections, onChange, readOnly]);

        const saveCheckpoint = useCallback(() => {
            if (readOnly) return;
            pastRef.current.push({
                nodes: JSON.parse(JSON.stringify(nodes)),
                connections: [...connections],
            });
            futureRef.current = [];
        }, [nodes, connections, readOnly]);

        /** Initialize input hashes to prevent auto-execution on load */
        const initializeInputHashes = useCallback(
            (loadedNodes: NodeData[]) => {
                loadedNodes.forEach(node => {
                    const def = blockRegistry[node.type];
                    if (def && def.inputs.length > 0) {
                        const hash = def.inputs.map(p => node.inputData?.[p.id]?.timestamp).join('|');
                        nodeInputHashesRef.current.set(node.id, hash);
                    }
                });
            },
            [blockRegistry]
        );

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
        }, [nodes, connections, readOnly]);

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
        }, [nodes, connections, readOnly]);

        useEffect(() => {
            if (initialData) {
                const loadedNodes = initialData.nodes ?? [];
                setNodes(loadedNodes);
                setConnections(initialData.connections ?? []);
                pastRef.current = [];
                futureRef.current = [];

                initializeInputHashes(loadedNodes);
            }
        }, [initialData, blockRegistry, initializeInputHashes]);

        useEffect(() => {
            if (modalFlowId) {
                loadFlow(modalFlowId)
                    .then(setModalFlowData)
                    .catch(() => setModalFlowData(null));
            } else {
                setModalFlowData(null);
            }
        }, [modalFlowId]);

        const handleSelectionChange = useCallback(
            (nodeId: string | null) => {
                setSelectedNodeId(nodeId);
                if (onNodeSelect) {
                    onNodeSelect(nodeId);
                }
            },
            [onNodeSelect]
        );

        const screenToWorld = useCallback(
            (clientX: number, clientY: number) => {
                const rect = canvasRef.current?.getBoundingClientRect();
                if (!rect) return { x: 0, y: 0 };
                return {
                    x: (clientX - rect.left - viewport.x) / viewport.zoom,
                    y: (clientY - rect.top - viewport.y) / viewport.zoom,
                };
            },
            [viewport]
        );

        useImperativeHandle(
            ref,
            () => ({
                addNode: (type: string) => {
                    if (readOnly) return;
                    saveCheckpoint();

                    const newDef = blockRegistry[type];
                    if (!newDef) return;

                    let sourceNode: NodeData | undefined;
                    let sourcePortId: string | undefined;
                    let targetPortId: string | undefined;

                    if (newDef.inputs.length > 0) {
                        const firstInput = newDef.inputs[0];
                        targetPortId = firstInput.id;

                        const findCompatibleOutput = (n: NodeData) => {
                            const def = blockRegistry[n.type];
                            if (!def) return undefined;
                            return def.outputs.find(
                                out => out.type === firstInput.type || out.type === 'any' || firstInput.type === 'any'
                            );
                        };

                        if (selectedNodeId) {
                            const selected = nodes.find(n => n.id === selectedNodeId);
                            if (selected) {
                                const out = findCompatibleOutput(selected);
                                if (out) {
                                    sourceNode = selected;
                                    sourcePortId = out.id;
                                }
                            }
                        }

                        if (!sourceNode && nodes.length > 0) {
                            const lastNode = nodes[nodes.length - 1];
                            const out = findCompatibleOutput(lastNode);
                            if (out) {
                                sourceNode = lastNode;
                                sourcePortId = out.id;
                            }
                        }
                    }

                    let startX = 0;
                    let startY = 0;

                    if (sourceNode) {
                        startX = sourceNode.position.x + 300;
                        startY = sourceNode.position.y;
                    } else {
                        const rect = canvasRef.current?.getBoundingClientRect();
                        const centerX = rect ? (rect.width / 2 - viewport.x) / viewport.zoom : 100;
                        const centerY = rect ? (rect.height / 2 - viewport.y) / viewport.zoom : 100;
                        startX = centerX - 100 + (Math.random() * 40 - 20);
                        startY = centerY - 50 + (Math.random() * 40 - 20);
                    }

                    const snappedX = Math.round(startX / GRID_SIZE) * GRID_SIZE;
                    const snappedY = Math.round(startY / GRID_SIZE) * GRID_SIZE;

                    const newNode: NodeData = {
                        id: generateId(),
                        type,
                        position: { x: snappedX, y: snappedY },
                        config: { ...blockRegistry[type].defaultConfig },
                        status: 'IDLE',
                        inputData: {},
                        outputData: {},
                        autoExecutionEnabled: true,
                    };

                    let newConnection: Connection | null = null;
                    if (sourceNode && sourcePortId && targetPortId) {
                        newConnection = {
                            id: generateId(),
                            sourceNodeId: sourceNode.id,
                            sourcePortId: sourcePortId,
                            targetNodeId: newNode.id,
                            targetPortId: targetPortId,
                        };

                        if (sourceNode.outputData[sourcePortId]) {
                            newNode.inputData[targetPortId] = sourceNode.outputData[sourcePortId];
                        }
                    }

                    let targetNode: NodeData | undefined;
                    let targetInputPortId: string | undefined;
                    let sourceOutputPortId: string | undefined;

                    if (!newConnection && newDef.outputs.length > 0 && nodes.length > 0) {
                        const firstOutput = newDef.outputs[0];

                        for (const existingNode of nodes) {
                            const existingDef = blockRegistry[existingNode.type];
                            if (!existingDef || existingDef.inputs.length === 0) continue;

                            const compatibleInput = existingDef.inputs.find(inp => {
                                const isConnected = connections.some(
                                    c => c.targetNodeId === existingNode.id && c.targetPortId === inp.id
                                );
                                if (isConnected) return false;
                                return (
                                    inp.type === firstOutput.type || inp.type === 'any' || firstOutput.type === 'any'
                                );
                            });

                            if (compatibleInput) {
                                targetNode = existingNode;
                                targetInputPortId = compatibleInput.id;
                                sourceOutputPortId = firstOutput.id;
                                break;
                            }
                        }

                        if (targetNode && targetInputPortId && sourceOutputPortId) {
                            newConnection = {
                                id: generateId(),
                                sourceNodeId: newNode.id,
                                sourcePortId: sourceOutputPortId,
                                targetNodeId: targetNode.id,
                                targetPortId: targetInputPortId,
                            };
                        }
                    }

                    setNodes(prev => [...prev, newNode]);
                    if (newConnection) {
                        setConnections(prev => [...prev, newConnection!]);
                    }

                    handleSelectionChange(newNode.id);
                    setSelectedConnectionId(null);
                },
                getWorkflow: () => ({ nodes, edges: connections }),
                loadWorkflow: (state: WorkflowState) => {
                    executionQueueRef.current.clear();
                    isProcessingQueueRef.current = false;
                    executingNodesRef.current.clear();
                    const loadedNodes = state.nodes ?? [];
                    setNodes(loadedNodes);
                    // Support both 'edges' (API format) and 'connections' (legacy)
                    setConnections(state.edges ?? state.connections ?? []);
                    pastRef.current = [];
                    futureRef.current = [];
                    handleSelectionChange(null);
                    setSelectedConnectionId(null);
                    initializeInputHashes(loadedNodes);
                },
                clearWorkflow: () => {
                    if (readOnly) return;
                    saveCheckpoint();
                    executionQueueRef.current.clear();
                    isProcessingQueueRef.current = false;
                    executingNodesRef.current.clear();
                    setNodes([]);
                    setConnections([]);
                    handleSelectionChange(null);
                },
                newWorkflow: () => {
                    if (readOnly) return;
                    executionQueueRef.current.clear();
                    isProcessingQueueRef.current = false;
                    executingNodesRef.current.clear();
                    nodeInputHashesRef.current.clear();
                    setNodes([]);
                    setConnections([]);
                    pastRef.current = [];
                    futureRef.current = [];
                    setViewport({ x: 0, y: 0, zoom: 1 });
                    handleSelectionChange(null);
                },
                undo,
                redo,
                selectNode: (nodeId: string | null) => {
                    handleSelectionChange(nodeId);
                    if (nodeId) setSelectedConnectionId(null);
                },
                autoLayout: () => {
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

                        let currentY = LAYOUT_CONFIG.START_Y;
                        group.forEach(node => {
                            const x = LAYOUT_CONFIG.START_X + level * LAYOUT_CONFIG.LEVEL_WIDTH;
                            const y = currentY;
                            nodeYPositions[node.id] = y;
                            const nodeIndex = positionedNodes.findIndex(n => n.id === node.id);
                            if (nodeIndex !== -1) {
                                positionedNodes[nodeIndex] = {
                                    ...positionedNodes[nodeIndex],
                                    position: { x, y },
                                };
                            }
                            const nodeHeight = estimateNodeHeight(node, blockRegistry[node.type]);
                            currentY += nodeHeight + LAYOUT_CONFIG.MIN_GAP;
                        });
                    });

                    setNodes(positionedNodes);
                    setViewport({ x: 20, y: 20, zoom: 1 });
                },
                runAll: async () => {
                    const inputNodes = nodes
                        .filter(n => {
                            const hasIncoming = connections.some(c => c.targetNodeId === n.id);
                            const def = blockRegistry[n.type];
                            return !hasIncoming || (def && def.inputs.length === 0);
                        })
                        .filter(n => !(n as NodeData & { disabled?: boolean }).disabled);

                    batchRunCountRef.current++;

                    try {
                        if (onBeforeBackendRun) {
                            await onBeforeBackendRun();
                        }

                        for (const node of inputNodes) {
                            if (executeNodeRef.current) {
                                await executeNodeRef.current(node.id);
                            }
                        }

                        await new Promise<void>(resolve => {
                            const checkQueue = () => {
                                if (executionQueueRef.current.size === 0 && !isProcessingQueueRef.current) {
                                    resolve();
                                } else {
                                    setTimeout(checkQueue, 50);
                                }
                            };
                            setTimeout(checkQueue, 10);
                        });
                    } finally {
                        batchRunCountRef.current--;
                    }
                },
                stopAll: () => {
                    batchRunCountRef.current = 0;
                    executionQueueRef.current.clear();
                    isProcessingQueueRef.current = false;
                    executingNodesRef.current.clear();
                    setNodes(prev => prev.map(n => (n.status === 'RUNNING' ? { ...n, status: 'IDLE' } : n)));
                },
                updateNode: (nodeId: string, updates: Partial<NodeData>) => {
                    setNodes(prev => prev.map(n => (n.id === nodeId ? { ...n, ...updates } : n)));
                },
            }),
            [
                nodes,
                connections,
                viewport,
                readOnly,
                undo,
                redo,
                saveCheckpoint,
                selectedNodeId,
                handleSelectionChange,
                blockRegistry,
                onBeforeBackendRun,
            ]
        );

        const propagateOutputs = useCallback((sourceNodeId: string, outputs: Record<string, DataPacket>): string[] => {
            const relevantConnections = connectionsRef.current.filter(c => c.sourceNodeId === sourceNodeId);
            if (relevantConnections.length === 0) return [];

            const updatedNodeIds: string[] = [];
            relevantConnections.forEach(conn => {
                if (outputs[conn.sourcePortId]) {
                    if (!updatedNodeIds.includes(conn.targetNodeId)) {
                        updatedNodeIds.push(conn.targetNodeId);
                    }
                }
            });

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

            return updatedNodeIds;
        }, []);

        const processExecutionQueue = useCallback(async () => {
            if (isProcessingQueueRef.current) return;
            if (executionQueueRef.current.size === 0) return;

            isProcessingQueueRef.current = true;

            try {
                while (executionQueueRef.current.size > 0) {
                    const nextValue = executionQueueRef.current.values().next();
                    if (nextValue.done || !nextValue.value) break;
                    const nodeId = nextValue.value;
                    executionQueueRef.current.delete(nodeId);

                    const node = nodesRef.current.find(n => n.id === nodeId);
                    if (!node) continue;

                    const def = blockRegistry[node.type];
                    if (!def) continue;

                    // Check if all inputs are still available and hash has changed
                    const hasAllInputs = def.inputs.every(p => node.inputData[p.id]);
                    if (!hasAllInputs) continue;

                    const currentInputHash = def.inputs.map(p => node.inputData[p.id]?.timestamp).join('|');
                    const lastHash = nodeInputHashesRef.current.get(nodeId);

                    if (currentInputHash !== lastHash) {
                        // Skip if this node is already executing
                        if (executingNodesRef.current.has(nodeId)) continue;

                        nodeInputHashesRef.current.set(nodeId, currentInputHash);
                        if (executeNodeRef.current) {
                            executingNodesRef.current.add(nodeId);
                            try {
                                await executeNodeRef.current(nodeId);
                            } finally {
                                executingNodesRef.current.delete(nodeId);
                            }
                        }
                    }
                }
            } finally {
                isProcessingQueueRef.current = false;
            }
        }, [blockRegistry]);

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

                const currentNode = nodesRef.current.find(n => n.id === nodeId);
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

                // Check for missing required inputs before execution
                // Missing if: no data AND (has incoming connection OR explicitly required)
                const incomingConnections = connectionsRef.current.filter(c => c.targetNodeId === nodeId);
                const missingInputs = nodeDef.inputs.filter(inputPort => {
                    if (inputs[inputPort.id]) return false; // Has data - not missing
                    const hasConnection = incomingConnections.some(c => c.targetPortId === inputPort.id);
                    return hasConnection || inputPort.required === true;
                });

                if (missingInputs.length > 0) {
                    const missingLabels = missingInputs.map(p => p.label || p.id).join(', ');
                    setNodes(prev =>
                        prev.map(n =>
                            n.id === nodeId
                                ? {
                                      ...n,
                                      status: 'ERROR',
                                      errorMessage: t('nodes:errors.missingInputs', { inputs: missingLabels }),
                                      executionStats: { startTime, duration: 0, progress: 0 },
                                  }
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
                    let results: Record<string, DataPacket>;

                    // Check if this block requires backend processing
                    // Uses isFrontend flag from server, with fallback to legacy type check
                    if (requiresBackendProcessing(nodeDef)) {
                        if (batchRunCountRef.current === 0 && onBeforeBackendRun) {
                            await onBeforeBackendRun();
                        }

                        const nodeResult = await runNode(nodeId, { config$: currentNode.config });

                        if (nodeResult.status === 'ERROR') {
                            const duration = Date.now() - startTime;
                            setNodes(prev =>
                                prev.map(n =>
                                    n.id === nodeId
                                        ? {
                                              ...n,
                                              status: 'ERROR',
                                              errorMessage:
                                                  nodeResult.errorMessage || t('flows:detailPanel.unknownError'),
                                              executionStats: { startTime, duration, progress: 0 },
                                          }
                                        : n
                                )
                            );
                            return;
                        }

                        if (nodeResult.outputData$$) {
                            type OutputDataItem = {
                                portId: string;
                                packet: { value: unknown; type: string; timestamp?: number };
                            };
                            results = nodeResult.outputData$$.reduce<Record<string, DataPacket>>(
                                (acc: Record<string, DataPacket>, item: OutputDataItem) => {
                                    acc[item.portId] = {
                                        value: item.packet.value,
                                        type: item.packet.type as 'text' | 'image' | 'number',
                                        timestamp: item.packet.timestamp || Date.now(),
                                    };
                                    return acc;
                                },
                                {}
                            );
                        } else {
                            results = {};
                        }
                    } else if (nodeDef.execute) {
                        results = await nodeDef.execute(inputs, currentNode.config, onProgress);
                    } else {
                        results = {};
                    }

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

                    const downstreamNodeIds = propagateOutputs(nodeId, results);

                    if (downstreamNodeIds.length > 0) {
                        setTimeout(() => {
                            downstreamNodeIds.forEach(downstreamId => {
                                const downstreamNode = nodesRef.current.find(n => n.id === downstreamId);
                                if (!downstreamNode) return;

                                const downstreamDef = blockRegistry[downstreamNode.type];
                                if (!downstreamDef) return;

                                if (downstreamNode.autoExecutionEnabled === false) return;

                                const hasAllInputs = downstreamDef.inputs.every(p => downstreamNode.inputData[p.id]);

                                if (hasAllInputs) {
                                    executionQueueRef.current.add(downstreamId);
                                    processExecutionQueue();
                                }
                            });
                        }, 0);
                    }
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
            [propagateOutputs, processExecutionQueue, readOnly, blockRegistry, t, onBeforeBackendRun]
        );

        executeNodeRef.current = executeNode;

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

        const handleConfigChange = (nodeId: string, key: string, value: unknown) => {
            if (readOnly) return;
            saveCheckpoint();
            setNodes(prev => prev.map(n => (n.id === nodeId ? { ...n, config: { ...n.config, [key]: value } } : n)));
        };

        const handleLabelChange = (nodeId: string, label: string) => {
            if (readOnly) return;
            saveCheckpoint();
            setNodes(prev => prev.map(n => (n.id === nodeId ? { ...n, customLabel: label || undefined } : n)));
        };

        const handleDescriptionChange = (nodeId: string, description: string) => {
            if (readOnly) return;
            saveCheckpoint();
            setNodes(prev => prev.map(n => (n.id === nodeId ? { ...n, description: description || undefined } : n)));
        };

        const handleToggleAuto = (nodeId: string) => {
            if (readOnly) return;
            saveCheckpoint();
            setNodes(prev =>
                prev.map(n => (n.id === nodeId ? { ...n, autoExecutionEnabled: !n.autoExecutionEnabled } : n))
            );
        };

        const deleteNode = useCallback(
            (id: string) => {
                if (readOnly) return;
                saveCheckpoint();
                setNodes(prev => prev.filter(n => n.id !== id));
                setConnections(prev => prev.filter(c => c.sourceNodeId !== id && c.targetNodeId !== id));
                handleSelectionChange(null);
            },
            [readOnly, saveCheckpoint, handleSelectionChange]
        );

        const deleteConnection = useCallback(
            (id: string) => {
                if (readOnly) return;
                saveCheckpoint();
                setConnections(prev => prev.filter(c => c.id !== id));
                setSelectedConnectionId(null);
            },
            [readOnly, saveCheckpoint]
        );

        const duplicateNode = useCallback(
            (nodeId: string) => {
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
            [readOnly, nodes, saveCheckpoint, handleSelectionChange]
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
            [readOnly, saveCheckpoint]
        );

        const MIN_ZOOM = 0.1;
        const MAX_ZOOM = 5;

        const handleWheel = (e: React.WheelEvent) => {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return;
            const delta = -e.deltaY * 0.001;
            const newZoom = Math.min(Math.max(viewport.zoom + delta, MIN_ZOOM), MAX_ZOOM);

            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const worldX = (mouseX - viewport.x) / viewport.zoom;
            const worldY = (mouseY - viewport.y) / viewport.zoom;

            const newX = mouseX - worldX * newZoom;
            const newY = mouseY - worldY * newZoom;

            setViewport({ x: newX, y: newY, zoom: newZoom });
        };

        const handleZoomIn = useCallback(() => {
            setViewport(prev => ({ ...prev, zoom: Math.min(prev.zoom * 1.2, MAX_ZOOM) }));
        }, []);

        const handleZoomOut = useCallback(() => {
            setViewport(prev => ({ ...prev, zoom: Math.max(prev.zoom / 1.2, MIN_ZOOM) }));
        }, []);

        const handleFitToScreen = useCallback(() => {
            if (nodes.length === 0) return;
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return;

            const NODE_WIDTH = 220;
            const NODE_HEIGHT = 150;
            const PADDING = 50;

            let minX = Infinity,
                minY = Infinity,
                maxX = -Infinity,
                maxY = -Infinity;

            nodes.forEach(node => {
                minX = Math.min(minX, node.position.x);
                minY = Math.min(minY, node.position.y);
                maxX = Math.max(maxX, node.position.x + NODE_WIDTH);
                maxY = Math.max(maxY, node.position.y + NODE_HEIGHT);
            });

            const contentWidth = maxX - minX;
            const contentHeight = maxY - minY;
            const availableWidth = rect.width - PADDING * 2;
            const availableHeight = rect.height - PADDING * 2;

            const scaleX = availableWidth / contentWidth;
            const scaleY = availableHeight / contentHeight;
            const newZoom = Math.min(Math.max(Math.min(scaleX, scaleY), MIN_ZOOM), MAX_ZOOM);

            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;

            const newX = rect.width / 2 - centerX * newZoom;
            const newY = rect.height / 2 - centerY * newZoom;

            setViewport({ x: newX, y: newY, zoom: newZoom });
        }, [nodes]);

        const handleResetView = useCallback(() => {
            setViewport({ x: 0, y: 0, zoom: 1 });
        }, []);

        const handleCanvasMouseDown = (e: React.MouseEvent) => {
            if (e.button === 0 || e.button === 1) {
                setIsPanning(true);
                lastMousePosRef.current = { x: e.clientX, y: e.clientY };
                handleSelectionChange(null);
                setSelectedConnectionId(null);
            }
        };

        const handleDoubleClick = () => {
            handleSelectionChange(null);
            setSelectedConnectionId(null);
        };

        const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
            if (readOnly) return;
            e.stopPropagation();
            handleSelectionChange(nodeId);
            setSelectedConnectionId(null);

            const target = e.target as HTMLElement;
            if (
                ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'LABEL'].includes(target.tagName) ||
                target.isContentEditable
            ) {
                return;
            }

            dragStartSnapshotRef.current = {
                nodes: JSON.parse(JSON.stringify(nodes)),
                connections: [...connections],
            };

            setDragState({
                nodeId,
                startX: e.clientX,
                startY: e.clientY,
                initialX: nodes.find(n => n.id === nodeId)?.position.x || 0,
                initialY: nodes.find(n => n.id === nodeId)?.position.y || 0,
            });
        };

        const handleMouseMove = (e: React.MouseEvent) => {
            if (isPanning) {
                const dx = e.clientX - lastMousePosRef.current.x;
                const dy = e.clientY - lastMousePosRef.current.y;
                setViewport(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
                lastMousePosRef.current = { x: e.clientX, y: e.clientY };
                return;
            }

            if (dragState && !readOnly) {
                const screenDx = e.clientX - dragState.startX;
                const screenDy = e.clientY - dragState.startY;
                const dx = screenDx / viewport.zoom;
                const dy = screenDy / viewport.zoom;

                const rawX = dragState.initialX + dx;
                const rawY = dragState.initialY + dy;
                const snappedX = Math.round(rawX / GRID_SIZE) * GRID_SIZE;
                const snappedY = Math.round(rawY / GRID_SIZE) * GRID_SIZE;

                setNodes(prev =>
                    prev.map(n => (n.id === dragState.nodeId ? { ...n, position: { x: snappedX, y: snappedY } } : n))
                );
            }

            if (connectionDraft && !readOnly) {
                const worldPos = screenToWorld(e.clientX, e.clientY);
                setConnectionDraft(prev => (prev ? { ...prev, mouseX: worldPos.x, mouseY: worldPos.y } : null));
            }
        };

        const handleMouseUp = () => {
            setIsPanning(false);

            if (dragState && dragStartSnapshotRef.current) {
                const currentNode = nodes.find(n => n.id === dragState.nodeId);
                const originalNode = dragStartSnapshotRef.current.nodes.find(n => n.id === dragState.nodeId);

                if (
                    currentNode &&
                    originalNode &&
                    (currentNode.position.x !== originalNode.position.x ||
                        currentNode.position.y !== originalNode.position.y)
                ) {
                    pastRef.current.push(dragStartSnapshotRef.current);
                    futureRef.current = [];
                }
            }

            setDragState(null);
            dragStartSnapshotRef.current = null;
            setConnectionDraft(null);
        };

        const handlePortMouseDown = (
            nodeId: string,
            portId: string,
            type: 'input' | 'output',
            portType: string,
            e: React.MouseEvent
        ) => {
            if (readOnly) return;
            handleSelectionChange(nodeId);
            setSelectedConnectionId(null);
            if (type === 'output') {
                const worldPos = screenToWorld(e.clientX, e.clientY);
                setConnectionDraft({
                    sourceNodeId: nodeId,
                    sourcePortId: portId,
                    sourceType: portType,
                    mouseX: worldPos.x,
                    mouseY: worldPos.y,
                });
            }
        };

        const handlePortMouseUp = (
            targetNodeId: string,
            targetPortId: string,
            type: 'input' | 'output',
            targetType: string
        ) => {
            if (readOnly) return;
            if (connectionDraft && type === 'input') {
                const sourceNode = nodes.find(n => n.id === connectionDraft.sourceNodeId);
                const targetNode = nodes.find(n => n.id === targetNodeId);
                if (
                    sourceNode &&
                    targetNode &&
                    isValidConnection(sourceNode, 0, targetNode, 0, connectionDraft.sourceType, targetType)
                ) {
                    saveCheckpoint();
                    setConnections(prev => {
                        const filtered = prev.filter(
                            c => !(c.targetNodeId === targetNodeId && c.targetPortId === targetPortId)
                        );
                        const newConn = {
                            id: generateId(),
                            sourceNodeId: connectionDraft.sourceNodeId,
                            sourcePortId: connectionDraft.sourcePortId,
                            targetNodeId,
                            targetPortId,
                        };
                        return [...filtered, newConn];
                    });
                    const packet = sourceNode.outputData[connectionDraft.sourcePortId];
                    if (packet) {
                        // Prevent auto-execution: pre-set hash before updating inputData
                        const targetDef = blockRegistry[targetNode.type];
                        if (targetDef) {
                            const newInputData = { ...targetNode.inputData, [targetPortId]: packet };
                            const hash = targetDef.inputs.map(p => newInputData[p.id]?.timestamp).join('|');
                            nodeInputHashesRef.current.set(targetNodeId, hash);
                        }

                        setNodes(prev =>
                            prev.map(n =>
                                n.id === targetNodeId
                                    ? {
                                          ...n,
                                          inputData: {
                                              ...n.inputData,
                                              [targetPortId]: packet,
                                          },
                                      }
                                    : n
                            )
                        );
                    }
                }
            }
            setConnectionDraft(null);
            handleSelectionChange(null);
        };

        const getPortPosition = (nodeId: string, portId: string, type: 'input' | 'output') => {
            const node = nodes.find(n => n.id === nodeId);
            if (!node) return { x: 0, y: 0 };
            const def = blockRegistry[node.type];
            if (!def) return { x: node.position.x, y: node.position.y };
            const portIndex =
                type === 'input'
                    ? def.inputs.findIndex(p => p.id === portId)
                    : def.outputs.findIndex(p => p.id === portId);
            const safeIndex = portIndex !== -1 ? portIndex : 0;
            const yOffset = 69 + safeIndex * 28;
            const xOffset = type === 'input' ? 8 : 252;
            return { x: node.position.x + xOffset, y: node.position.y + yOffset };
        };

        useEffect(() => {
            const handleKeyDown = (e: KeyboardEvent) => {
                if (readOnly) return;
                const target = e.target as HTMLElement;
                const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
                if (isInput) return;

                const isCtrlOrCmd = e.ctrlKey || e.metaKey;

                if (isCtrlOrCmd && e.key.toLowerCase() === 'c') {
                    if (selectedNodeId) {
                        const node = nodes.find(n => n.id === selectedNodeId);
                        if (node) setClipboard(node);
                    }
                }

                if (isCtrlOrCmd && e.key.toLowerCase() === 'v') {
                    if (clipboard) {
                        saveCheckpoint();
                        let x = 100,
                            y = 100;
                        if (canvasRef.current) {
                            const rect = canvasRef.current.getBoundingClientRect();
                            x = (rect.width / 2 - viewport.x) / viewport.zoom - 100;
                            y = (rect.height / 2 - viewport.y) / viewport.zoom - 50;
                            x += Math.random() * 40 - 20;
                            y += Math.random() * 40 - 20;
                        }
                        const newNode: NodeData = {
                            ...clipboard,
                            id: generateId(),
                            position: {
                                x: Math.round(x / GRID_SIZE) * GRID_SIZE,
                                y: Math.round(y / GRID_SIZE) * GRID_SIZE,
                            },
                            status: 'IDLE',
                            inputData: {},
                            outputData: {},
                            errorMessage: undefined,
                            config: JSON.parse(JSON.stringify(clipboard.config)),
                            autoExecutionEnabled: clipboard.autoExecutionEnabled ?? true,
                            customLabel: clipboard.customLabel,
                        };
                        setNodes(prev => [...prev, newNode]);
                        handleSelectionChange(newNode.id);
                    }
                }

                if (e.key === 'Delete' || e.key === 'Backspace') {
                    if (selectedNodeId) {
                        deleteNode(selectedNodeId);
                    } else if (selectedConnectionId || hoveredConnectionId) {
                        const targetId = selectedConnectionId || hoveredConnectionId;
                        saveCheckpoint();
                        setConnections(prev => prev.filter(c => c.id !== targetId));
                        setSelectedConnectionId(null);
                        setHoveredConnectionId(null);
                        setTooltip(null);
                    }
                }

                if (e.key === 'Escape') {
                    handleSelectionChange(null);
                    setSelectedConnectionId(null);
                }
            };

            window.addEventListener('keydown', handleKeyDown);
            return () => window.removeEventListener('keydown', handleKeyDown);
        }, [
            nodes,
            selectedNodeId,
            selectedConnectionId,
            hoveredConnectionId,
            clipboard,
            readOnly,
            viewport,
            saveCheckpoint,
            deleteNode,
            handleSelectionChange,
        ]);

        const activeConnectionId = selectedConnectionId || hoveredConnectionId;
        const activeConnection = activeConnectionId ? connections.find(c => c.id === activeConnectionId) : null;
        const detailNode = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) || null : null;
        const detailConnection = selectedConnectionId
            ? connections.find(c => c.id === selectedConnectionId) || null
            : null;

        return (
            <div
                className="flex h-screen w-full select-none"
                onMouseUp={handleMouseUp}
                onWheel={handleWheel}
                onDoubleClick={handleDoubleClick}
            >
                <div
                    ref={canvasRef}
                    className={`relative flex-1 bg-canvas overflow-hidden outline-none ${readOnly ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}
                    onMouseMove={handleMouseMove}
                    onMouseDown={handleCanvasMouseDown}
                    tabIndex={0}
                >
                    <div
                        className="absolute inset-0 pointer-events-none transition-opacity duration-300 ease-in-out z-0"
                        style={{
                            opacity: dragState ? 0.3 : 0,
                            backgroundImage: 'radial-gradient(hsl(var(--muted-foreground) / 0.4) 1px, transparent 1px)',
                            backgroundSize: `${GRID_SIZE * viewport.zoom}px ${GRID_SIZE * viewport.zoom}px`,
                            backgroundPosition: `${viewport.x}px ${viewport.y}px`,
                        }}
                    />

                    <div
                        className="absolute origin-top-left w-full h-full pointer-events-none z-10"
                        style={{
                            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
                        }}
                    >
                        <svg className="absolute overflow-visible top-0 left-0 w-full h-full">
                            {connections.map(conn => {
                                const start = getPortPosition(conn.sourceNodeId, conn.sourcePortId, 'output');
                                const end = getPortPosition(conn.targetNodeId, conn.targetPortId, 'input');
                                const sourceNode = nodes.find(n => n.id === conn.sourceNodeId);
                                const packet = sourceNode?.outputData[conn.sourcePortId];
                                const isActive = !!packet;

                                const handleHover = (e: React.MouseEvent) => {
                                    setHoveredConnectionId(conn.id);
                                    if (isActive) {
                                        setTooltip({
                                            x: e.clientX,
                                            y: e.clientY,
                                            content: packet.value,
                                            type: packet.type,
                                        });
                                    }
                                };

                                const handleLeave = () => {
                                    if (hoveredConnectionId === conn.id) {
                                        setHoveredConnectionId(null);
                                        setTooltip(null);
                                    }
                                };

                                const handleClick = () => {
                                    setSelectedConnectionId(conn.id);
                                    handleSelectionChange(null);
                                };

                                return (
                                    <ConnectionLine
                                        key={conn.id}
                                        x1={start.x}
                                        y1={start.y}
                                        x2={end.x}
                                        y2={end.y}
                                        isActive={isActive}
                                        isSelected={selectedConnectionId === conn.id}
                                        isHovered={hoveredConnectionId === conn.id}
                                        onMouseEnter={handleHover}
                                        onMouseMove={handleHover}
                                        onMouseLeave={handleLeave}
                                        onClick={handleClick}
                                    />
                                );
                            })}
                            {connectionDraft && (
                                <ConnectionLine
                                    x1={
                                        getPortPosition(
                                            connectionDraft.sourceNodeId,
                                            connectionDraft.sourcePortId,
                                            'output'
                                        ).x
                                    }
                                    y1={
                                        getPortPosition(
                                            connectionDraft.sourceNodeId,
                                            connectionDraft.sourcePortId,
                                            'output'
                                        ).y
                                    }
                                    x2={connectionDraft.mouseX}
                                    y2={connectionDraft.mouseY}
                                    isActive={true}
                                    isDraft={true}
                                />
                            )}
                        </svg>

                        <div className={`pointer-events-auto ${readOnly ? 'pointer-events-none' : ''}`}>
                            {nodes.map(node => {
                                const isConnected =
                                    activeConnection &&
                                    (activeConnection.sourceNodeId === node.id ||
                                        activeConnection.targetNodeId === node.id);

                                const highlightedPorts: string[] = [];
                                if (activeConnection?.sourceNodeId === node.id) {
                                    highlightedPorts.push(activeConnection.sourcePortId);
                                }
                                if (activeConnection?.targetNodeId === node.id) {
                                    highlightedPorts.push(activeConnection.targetPortId);
                                }

                                return (
                                    <div key={node.id}>
                                        <NodeBlock
                                            node={node}
                                            highlightState={{
                                                isSelected: selectedNodeId === node.id,
                                                isHighlighted: !!isConnected,
                                                highlightedPortIds: highlightedPorts,
                                            }}
                                            portHandlers={{
                                                onPortMouseDown: handlePortMouseDown,
                                                onPortMouseUp: handlePortMouseUp,
                                            }}
                                            configHandlers={{
                                                onConfigChange: (k, v) => handleConfigChange(node.id, k, v),
                                                onLabelChange: label => handleLabelChange(node.id, label),
                                                onToggleAuto: () => handleToggleAuto(node.id),
                                            }}
                                            actions={{
                                                onDelete: () => deleteNode(node.id),
                                                onTrigger: () => executeNode(node.id),
                                                onToggleDisabled: () => toggleNodeDisabled(node.id),
                                                onDuplicate: () => duplicateNode(node.id),
                                                onViewLogs: () => setLogViewerNodeId(node.id),
                                            }}
                                            onMouseDown={e => handleNodeMouseDown(e, node.id)}
                                            isDragging={dragState?.nodeId === node.id}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {tooltip && (
                        <div
                            className="absolute z-50 bg-popover border border-border rounded p-2 shadow-xl pointer-events-none transform -translate-y-full -translate-x-1/2 mt-[-10px]"
                            style={{ left: tooltip.x, top: tooltip.y }}
                        >
                            <div className="text-[10px] text-muted-foreground uppercase font-bold mb-1">
                                {tooltip.type}
                            </div>
                            {tooltip.type === 'image' ? (
                                <TooltipImage
                                    src={tooltip.content as string}
                                    altText={t('flows:nodeBlock.previewAlt')}
                                />
                            ) : (
                                <div className="text-xs text-foreground max-w-[200px] break-all">
                                    {typeof tooltip.content === 'object'
                                        ? JSON.stringify(tooltip.content).slice(0, 100) +
                                          (JSON.stringify(tooltip.content).length > 100 ? '...' : '')
                                        : String(tooltip.content).slice(0, 150)}
                                </div>
                            )}
                        </div>
                    )}

                    {!readOnly && (
                        <ZoomControls
                            zoom={viewport.zoom}
                            onZoomIn={handleZoomIn}
                            onZoomOut={handleZoomOut}
                            onFitToScreen={handleFitToScreen}
                            onReset={handleResetView}
                            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20"
                        />
                    )}

                    {modalFlowId && modalFlowData && (
                        <div
                            className="absolute inset-0 z-50 bg-background/80 flex items-center justify-center p-10 backdrop-blur-sm"
                            onMouseDown={e => e.stopPropagation()}
                        >
                            <div className="bg-surface border border-border w-full h-full rounded shadow-2xl flex flex-col overflow-hidden">
                                <div className="p-3 border-b border-border flex justify-between items-center bg-muted">
                                    <h3 className="text-sm font-bold text-foreground">
                                        {t('canvas.componentDesignView')}
                                    </h3>
                                    <button
                                        onClick={() => setModalFlowId(null)}
                                        className="text-muted-foreground hover:text-foreground flex items-center gap-1"
                                    >
                                        <X className="w-4 h-4" /> {t('canvas.close')}
                                    </button>
                                </div>
                                <div className="flex-1 relative">
                                    <WorkflowCanvas initialData={modalFlowData} readOnly={true} />
                                </div>
                            </div>
                        </div>
                    )}

                    {logViewerNodeId && <LogModal nodeId={logViewerNodeId} onClose={() => setLogViewerNodeId(null)} />}

                    <DetailPanel
                        selectedNode={detailNode}
                        selectedConnection={detailConnection}
                        nodes={nodes}
                        connections={connections}
                        onConfigChange={handleConfigChange}
                        onDescriptionChange={handleDescriptionChange}
                        onLabelChange={handleLabelChange}
                        onToggleAuto={handleToggleAuto}
                        onViewLogs={() => selectedNodeId && setLogViewerNodeId(selectedNodeId)}
                        onDeleteNode={deleteNode}
                        onDeleteConnection={deleteConnection}
                        onTriggerNode={executeNode}
                        onSelectNode={id => handleSelectionChange(id)}
                        onSelectConnection={id => {
                            setSelectedConnectionId(id);
                            handleSelectionChange(null);
                        }}
                        onClose={() => {
                            handleSelectionChange(null);
                            setSelectedConnectionId(null);
                        }}
                    />
                </div>
            </div>
        );
    }
);
