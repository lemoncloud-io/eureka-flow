import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MousePointerClick, Plus, X } from 'lucide-react';

import {
    EXECUTE_FUNCTIONS,
    LAYOUT_CONFIG,
    PORT_LAYOUT,
    estimateNodeHeight,
    getEffectiveState,
    loadFlow,
    runNode,
    shouldUpdateState,
    toPortData,
    upsertFlow,
    upsertPortNode,
    useBlockRegistry,
    useEdgeSync,
    useNodeSync,
    useUpdatedPortIds,
} from '@flows/flows';
import { cn } from '@flows/lib/utils';

import { ConnectionLine } from './ConnectionLine';
import { DetailPanel } from './DetailPanel';
import { LogModal } from './LogModal';
import { NodeBlock } from './NodeBlock';
import { TooltipImage } from './TooltipImage';
import { ZoomControls } from './ZoomControls';
import {
    deduplicateEdges,
    generateTempId,
    getVisiblePorts,
    isTempId,
    isValidConnection,
    replaceNodeIdInState,
    wouldCreateCycle,
} from '../utils';

import type { NodeState, PortData } from '@flows/flows';
import type { Connection, DataPacket, NodeData, WorkflowState } from '@lemoncloud/eureka-flows-api';

/** Extended WorkflowState with optional ports array from LoadFlowResult */
interface WorkflowStateWithPorts extends WorkflowState {
    ports?: PortData[];
}

export interface WorkflowCanvasRef {
    addNode: (type: string) => void;
    getWorkflow: () => WorkflowState;
    loadWorkflow: (state: WorkflowStateWithPorts) => void;
    clearWorkflow: () => void;
    newWorkflow: () => void;
    undo: () => void;
    redo: () => void;
    autoLayout: () => void;
    selectNode: (nodeId: string | null) => void;
    /** Execute a specific node by ID */
    executeNode: (nodeId: string) => Promise<void>;
    /** Update node data (used for socket status updates) */
    updateNode: (nodeId: string, updates: Partial<NodeData>) => void;
    /** Update node from server data (used for socket node update notifications) */
    updateNodeFromServer: (nodeId: string, serverData: Partial<NodeData>) => void;
}

interface WorkflowCanvasProps {
    readOnly?: boolean;
    initialData?: WorkflowState;
    /** Flow ID for syncing node changes to backend */
    flowId?: string | null;
    onNodeSelect?: (nodeId: string | null) => void;
    onChange?: () => void;
    /** Called when user clicks "Add Node" from empty state */
    onOpenLibrary?: () => void;
    /** Called when a connection is rejected due to validation error */
    onConnectionError?: (error: 'cycle' | 'invalid_type') => void;
    /** Called to show notification message (dev only, for touch debug) */
    onShowNotification?: (message: string, type: 'success' | 'error') => void;
}

const GRID_SIZE = 20;

interface EmptyStateProps {
    onOpenLibrary: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({ onOpenLibrary }) => {
    const { t } = useTranslation(['flows']);

    return (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-5">
            <div className="flex flex-col items-center gap-6 text-center max-w-md px-8">
                {/* Icon */}
                <div className="relative">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20">
                        <Plus className="w-10 h-10 text-primary/60" />
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-lg bg-accent flex items-center justify-center border border-accent-foreground/20 animate-bounce">
                        <MousePointerClick className="w-4 h-4 text-accent-foreground" />
                    </div>
                </div>

                {/* Text */}
                <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-foreground">{t('canvas.emptyState.title')}</h3>
                    <p className="text-sm text-muted-foreground">{t('canvas.emptyState.description')}</p>
                </div>

                {/* CTA Button */}
                <button
                    onClick={onOpenLibrary}
                    className={cn(
                        'pointer-events-auto px-6 py-3 rounded-xl',
                        'bg-primary text-primary-foreground font-medium',
                        'hover:bg-primary/90 transition-all',
                        'shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30',
                        'flex items-center gap-2'
                    )}
                >
                    <Plus className="w-4 h-4" />
                    {t('canvas.emptyState.addFirstNode')}
                </button>

                {/* Keyboard hint */}
                <p className="text-xs text-muted-foreground/60">{t('canvas.emptyState.keyboardHint')}</p>
            </div>
        </div>
    );
};

export const WorkflowCanvas = forwardRef<WorkflowCanvasRef, WorkflowCanvasProps>(
    (
        { readOnly, initialData, flowId, onNodeSelect, onChange, onOpenLibrary, onConnectionError, onShowNotification },
        ref
    ) => {
        const { t } = useTranslation(['flows', 'nodes']);
        const blockRegistry = useBlockRegistry();
        const updatedPortIds = useUpdatedPortIds();

        // Pre-compute updated ports grouped by nodeId for O(1) lookup per node
        const updatedPortIdsByNode = useMemo(() => {
            const map = new Map<string, string[]>();
            updatedPortIds.forEach(pid => {
                const colonIndex = pid.indexOf(':');
                if (colonIndex !== -1) {
                    const nodeId = pid.substring(0, colonIndex);
                    const portName = pid.substring(colonIndex + 1);
                    const existing = map.get(nodeId);
                    if (existing) {
                        existing.push(portName);
                    } else {
                        map.set(nodeId, [portName]);
                    }
                }
            });
            return map;
        }, [updatedPortIds]);

        const { syncNodeUpdate, createNodeAsync, flushPendingUpdates, waitForNodeId } = useNodeSync({
            flowId: flowId ?? null,
        });
        const { createEdgeAsync, pendingEdgeIds } = useEdgeSync({ flowId: flowId ?? null });

        const [nodes, setNodes] = useState<NodeData[]>([]);
        const [connections, setConnections] = useState<Connection[]>([]);
        const [clipboard, setClipboard] = useState<NodeData[]>([]);

        const pastRef = useRef<WorkflowState[]>([]);
        const futureRef = useRef<WorkflowState[]>([]);
        const dragStartSnapshotRef = useRef<WorkflowState | null>(null);
        const executeNodeRef = useRef<(nodeId: string) => Promise<void>>();

        const nodesRef = useRef(nodes);
        const connectionsRef = useRef(connections);
        nodesRef.current = nodes;
        connectionsRef.current = connections;

        const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
        const [isPanning, setIsPanning] = useState(false);
        const lastMousePosRef = useRef({ x: 0, y: 0 });

        const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
        const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
        const [hoveredConnectionId, setHoveredConnectionId] = useState<string | null>(null);

        // For single-node operations (detail panel, etc.), use the first selected node
        const selectedNodeId = selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] : null;

        const [logViewerNodeId, setLogViewerNodeId] = useState<string | null>(null);

        const [dragState, setDragState] = useState<{
            nodeId: string;
            startX: number;
            startY: number;
            /** Initial positions of all dragged nodes (for multi-select) */
            initialPositions: Map<string, { x: number; y: number }>;
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
                // Normalize nodes to ensure config is never undefined
                const loadedNodes = (initialData.nodes ?? []).map(n => ({
                    ...n,
                    config: n.config ?? {},
                }));
                setNodes(loadedNodes);
                setConnections(deduplicateEdges(initialData.connections ?? []));
                pastRef.current = [];
                futureRef.current = [];
            }
        }, [initialData, blockRegistry]);

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
            (nodeId: string | null, options?: { addToSelection?: boolean; toggleSelection?: boolean }) => {
                const { addToSelection = false, toggleSelection = false } = options || {};

                setSelectedNodeIds(prev => {
                    if (nodeId === null) {
                        // Clear selection
                        return new Set();
                    }

                    if (toggleSelection) {
                        // Toggle: if selected, remove; if not, add
                        const next = new Set(prev);
                        if (next.has(nodeId)) {
                            next.delete(nodeId);
                        } else {
                            next.add(nodeId);
                        }
                        return next;
                    }

                    if (addToSelection) {
                        // Add to existing selection
                        const next = new Set(prev);
                        next.add(nodeId);
                        return next;
                    }

                    // Replace selection with single node
                    return new Set([nodeId]);
                });

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

                    // Generate temp ID for optimistic UI
                    const tempNodeId = generateTempId('node');

                    const newNode: NodeData = {
                        id: tempNodeId,
                        type,
                        position: { x: snappedX, y: snappedY },
                        config: { ...blockRegistry[type].defaultConfig },
                        state: 'IDLE' as NodeState,
                        status: 'IDLE', // Deprecated: kept for backward compatibility
                        inputData: {},
                        outputData: {},
                        autoExecutionEnabled: true,
                    };

                    // Generate temp edge ID if connection will be created
                    const tempEdgeId = generateTempId('edge');
                    let newConnection: Connection | null = null;
                    if (sourceNode && sourcePortId && targetPortId) {
                        newConnection = {
                            id: tempEdgeId,
                            sourceNodeId: sourceNode.id,
                            sourcePortId: sourcePortId,
                            targetNodeId: tempNodeId,
                            targetPortId: targetPortId,
                        };

                        if (sourceNode.outputData?.[sourcePortId]) {
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
                                id: tempEdgeId,
                                sourceNodeId: tempNodeId,
                                sourcePortId: sourceOutputPortId,
                                targetNodeId: targetNode.id,
                                targetPortId: targetInputPortId,
                            };
                        }
                    }

                    // Optimistic UI update
                    setNodes(prev => [...prev, newNode]);
                    if (newConnection) {
                        setConnections(prev => [...prev, newConnection]);
                    }

                    // Store connection info for later edge creation
                    const connectionToCreate = newConnection;

                    // Create node on backend with server-assigned ID
                    createNodeAsync(
                        tempNodeId,
                        {
                            type,
                            position: { x: snappedX, y: snappedY },
                            config: { ...blockRegistry[type].defaultConfig },
                            autoExecutionEnabled: true,
                        },
                        (oldTempId, newServerId) => {
                            replaceNodeIdInState(oldTempId, newServerId, setNodes, setConnections, setSelectedNodeIds);

                            // Now create the edge on the server if there was a connection
                            if (connectionToCreate) {
                                const resolvedConnection = {
                                    ...connectionToCreate,
                                    sourceNodeId:
                                        connectionToCreate.sourceNodeId === oldTempId
                                            ? newServerId
                                            : connectionToCreate.sourceNodeId,
                                    targetNodeId:
                                        connectionToCreate.targetNodeId === oldTempId
                                            ? newServerId
                                            : connectionToCreate.targetNodeId,
                                };

                                // Prepare node data with server ID for upsert
                                const nodeForServer: NodeData = {
                                    ...newNode,
                                    id: newServerId,
                                };

                                createEdgeAsync(
                                    tempEdgeId,
                                    {
                                        sourceNodeId: resolvedConnection.sourceNodeId,
                                        sourcePortId: resolvedConnection.sourcePortId,
                                        targetNodeId: resolvedConnection.targetNodeId,
                                        targetPortId: resolvedConnection.targetPortId,
                                    },
                                    (oldEdgeTempId, newEdgeServerId) => {
                                        // Replace temp edge ID with server ID
                                        setConnections(prev =>
                                            prev.map(c => (c.id === oldEdgeTempId ? { ...c, id: newEdgeServerId } : c))
                                        );
                                    },
                                    [nodeForServer]
                                );
                            }
                        }
                    );

                    handleSelectionChange(tempNodeId);
                    setSelectedConnectionId(null);
                },
                getWorkflow: () => ({
                    nodes,
                    edges: connections.filter(c => !pendingEdgeIds.has(c.id)),
                }),
                loadWorkflow: (state: WorkflowStateWithPorts) => {
                    // Normalize nodes to ensure config is never undefined
                    const loadedNodes = (state.nodes ?? []).map(n => ({
                        ...n,
                        config: n.config ?? {},
                    }));

                    const rawConnections = state.edges ?? state.connections ?? [];
                    const loadedConnections = deduplicateEdges(rawConnections);

                    // Step 1: Propagate outputData to downstream nodes' inputData
                    // This ensures that existing completed nodes' outputs are reflected in downstream inputs
                    const nodesWithPropagatedData = loadedNodes.map(node => {
                        // Find all connections where this node is the target
                        const incomingConnections = loadedConnections.filter(c => c.targetNodeId === node.id);

                        if (incomingConnections.length === 0) {
                            return node;
                        }

                        // Build inputData from upstream nodes' outputData
                        const propagatedInputData = { ...node.inputData };
                        let hasNewData = false;

                        incomingConnections.forEach(conn => {
                            const sourceNode = loadedNodes.find(n => n.id === conn.sourceNodeId);
                            if (sourceNode?.outputData) {
                                const packet = sourceNode.outputData[conn.sourcePortId];
                                if (packet) {
                                    propagatedInputData[conn.targetPortId] = packet;
                                    hasNewData = true;
                                }
                            }
                        });

                        if (hasNewData) {
                            return { ...node, inputData: propagatedInputData };
                        }
                        return node;
                    });

                    // Step 2: Apply port data from ports[] array to nodes' inputData/outputData
                    // This loads persisted port values that may not be reflected in node outputData
                    // Port format: { id, nodeId, portId, direction, data: DataPacket }
                    const ports = state.ports ?? [];
                    const nodesWithPortData = ports.length
                        ? nodesWithPropagatedData.map(node => {
                              const nodePorts = ports.filter(
                                  p => p.nodeId === node.id && p.portId && p.data && p.direction
                              );
                              if (nodePorts.length === 0) return node;

                              let inputData = { ...node.inputData };
                              let outputData = { ...node.outputData };

                              for (const port of nodePorts) {
                                  const { portId, data, direction } = port;
                                  if (!portId || !data) continue;
                                  if (direction === 'in') {
                                      inputData = { ...inputData, [portId]: data };
                                  } else {
                                      outputData = { ...outputData, [portId]: data };
                                  }
                              }

                              return { ...node, inputData, outputData };
                          })
                        : nodesWithPropagatedData;

                    setNodes(nodesWithPortData);
                    setConnections(loadedConnections);
                    pastRef.current = [];
                    futureRef.current = [];
                    handleSelectionChange(null);
                    setSelectedConnectionId(null);
                },
                clearWorkflow: () => {
                    if (readOnly) return;
                    saveCheckpoint();
                    setNodes([]);
                    setConnections([]);
                    handleSelectionChange(null);
                },
                newWorkflow: () => {
                    if (readOnly) return;
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
                        const u = queue.shift();
                        if (!u) break;
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
                executeNode: async (nodeId: string) => {
                    if (executeNodeRef.current) {
                        await executeNodeRef.current(nodeId);
                    }
                },
                updateNode: (nodeId: string, updates: Partial<NodeData>) => {
                    setNodes(prev => prev.map(n => (n.id === nodeId ? { ...n, ...updates } : n)));
                },
                updateNodeFromServer: (nodeId: string, serverData: Partial<NodeData>) => {
                    // Merge server data with existing node, preserving UI-specific fields
                    // Note: Server returns NodeView format from GET /nodes/:id
                    // - config$: ConfigItem[] (array) -> config: Record<string, string> (object)
                    // - inputData$$: DataPacketItem[] (array) -> inputData: Record<string, DataPacket> (object)
                    // - outputData$$: DataPacketItem[] (array) -> outputData: Record<string, DataPacket> (object)
                    // - position: { x, y } -> use directly

                    const serverDataAny = serverData as unknown as Record<string, unknown>;

                    // Pre-calculate transformed outputData
                    let outputDataForPropagation: Record<string, DataPacket> | null = null;
                    if (Array.isArray(serverDataAny['outputData$$'])) {
                        outputDataForPropagation = {};
                        for (const item of serverDataAny['outputData$$'] as Array<{
                            portId: string;
                            packet: { value: unknown; type: string; timestamp?: number };
                        }>) {
                            outputDataForPropagation[item.portId] = item.packet as DataPacket;
                        }
                    } else if (serverData.outputData && Object.keys(serverData.outputData).length > 0) {
                        outputDataForPropagation = serverData.outputData;
                    }

                    setNodes(prev =>
                        prev.map(n => {
                            if (n.id !== nodeId) return n;

                            // Transform config$ (array) to config (object) if needed
                            let transformedConfig = n.config;
                            if (Array.isArray(serverDataAny['config$'])) {
                                transformedConfig = {};
                                for (const item of serverDataAny['config$'] as Array<{
                                    key: string;
                                    val: string;
                                }>) {
                                    transformedConfig[item.key] = item.val;
                                }
                            } else if (serverData.config) {
                                transformedConfig = serverData.config;
                            }

                            // Transform inputData$$ (array) to inputData (object) if needed
                            let transformedInputData = n.inputData;
                            if (Array.isArray(serverDataAny['inputData$$'])) {
                                transformedInputData = {};
                                for (const item of serverDataAny['inputData$$'] as Array<{
                                    portId: string;
                                    packet: { value: unknown; type: string; timestamp?: number };
                                }>) {
                                    transformedInputData[item.portId] = item.packet as DataPacket;
                                }
                            } else if (serverData.inputData) {
                                transformedInputData = { ...n.inputData, ...serverData.inputData };
                            }

                            // Transform outputData$$ (array) to outputData (object) if needed
                            let transformedOutputData = n.outputData;
                            if (outputDataForPropagation) {
                                transformedOutputData = { ...n.outputData, ...outputDataForPropagation };
                            }

                            // State priority: only update if server state is more "final"
                            // EXCEPTION: If RUNNING with progress, force update (active execution)
                            // Use getEffectiveState for backward compatibility (state preferred, status fallback)
                            const serverState = getEffectiveState(serverData.state, serverData.status);
                            const currentState = getEffectiveState(n.state, n.status);
                            const isActiveExecution =
                                serverState === 'RUNNING' && serverData.executionStats?.progress !== undefined;
                            const finalState =
                                isActiveExecution || shouldUpdateState(currentState, serverState)
                                    ? serverState
                                    : currentState;

                            return {
                                ...n,
                                config: transformedConfig,
                                inputData: transformedInputData,
                                outputData: transformedOutputData,
                                state: finalState ?? n.state,
                                status: finalState ?? n.status, // Deprecated: kept for backward compatibility
                                errorMessage: serverData.errorMessage,
                                // Merge executionStats to preserve existing values (startTime, duration)
                                // when only progress is being updated
                                executionStats: serverData.executionStats
                                    ? { ...n.executionStats, ...serverData.executionStats }
                                    : n.executionStats,
                                position: serverData.position ?? n.position,
                            };
                        })
                    );

                    // Note: Output propagation to downstream nodes is handled by the server
                    // via propagateDownstreamV2. Socket notifications will update downstream
                    // nodes' inputData separately, so we don't need to propagate here.
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
                createNodeAsync,
                createEdgeAsync,
                pendingEdgeIds,
            ]
        );

        const executeNode = useCallback(
            async (nodeId: string, manualOverrideInputs?: Record<string, DataPacket>) => {
                if (readOnly) return;

                // Flush any pending config updates before execution
                await flushPendingUpdates();

                const startTime = Date.now();

                setNodes(prev =>
                    prev.map(n =>
                        n.id === nodeId
                            ? {
                                  ...n,
                                  state: 'RUNNING' as NodeState,
                                  status: 'RUNNING', // Deprecated: kept for backward compatibility
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
                                ? {
                                      ...n,
                                      state: 'ERROR' as NodeState,
                                      status: 'ERROR', // Deprecated: kept for backward compatibility
                                      errorMessage: t('nodes:errors.unknownBlockType'),
                                  }
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
                                      state: 'ERROR' as NodeState,
                                      status: 'ERROR', // Deprecated: kept for backward compatibility
                                      errorMessage: t('nodes:errors.missingInputs', { inputs: missingLabels }),
                                      executionStats: { startTime, duration: 0, progress: 0 },
                                  }
                                : n
                        )
                    );
                    return;
                }

                // ============================================================
                // Frontend vs Backend Execution
                // ============================================================
                // Check if this node should be executed on frontend (isFrontend = true)
                // Frontend nodes use EXECUTE_FUNCTIONS, then save output and trigger propagation
                // Backend nodes call server API directly
                // ============================================================
                const shouldRunOnFrontend = nodeDef.isFrontend === true && EXECUTE_FUNCTIONS[nodeDef.type];

                try {
                    if (shouldRunOnFrontend) {
                        // ============================================================
                        // Frontend Execution Path
                        // ============================================================
                        // 1. Execute locally using EXECUTE_FUNCTIONS
                        // 2. Save outputs to server via upsertNode
                        // 3. Trigger propagation via runNode with force flag
                        // ============================================================
                        const executeFunc = EXECUTE_FUNCTIONS[nodeDef.type];

                        const onProgress = (progress: number) => {
                            setNodes(prev =>
                                prev.map(n =>
                                    n.id === nodeId
                                        ? { ...n, executionStats: { ...(n.executionStats || {}), progress } }
                                        : n
                                )
                            );
                        };

                        // Execute frontend function
                        const outputs = await executeFunc(inputs, currentNode.config || {}, onProgress);
                        const duration = Date.now() - startTime;

                        // Update local state with outputs and propagate to downstream nodes
                        setNodes(prev => {
                            // First, update the executed node
                            const nodesWithOutput = prev.map(n =>
                                n.id === nodeId
                                    ? {
                                          ...n,
                                          state: 'COMPLETED' as NodeState,
                                          status: 'COMPLETED' as const, // Deprecated: kept for backward compatibility
                                          outputData: outputs,
                                          executionStats: { startTime, duration, progress: 100 },
                                      }
                                    : n
                            );

                            // Then, propagate outputs to downstream nodes' inputData
                            return nodesWithOutput.map(n => {
                                // Find connections where this node receives data from the executed node
                                const incomingFromExecuted = connections.filter(
                                    c => c.targetNodeId === n.id && c.sourceNodeId === nodeId
                                );
                                if (incomingFromExecuted.length === 0) return n;

                                // Build propagated inputData
                                const propagatedInputData = { ...n.inputData };
                                incomingFromExecuted.forEach(conn => {
                                    const packet = outputs[conn.sourcePortId];
                                    if (packet) {
                                        propagatedInputData[conn.targetPortId] = packet;
                                    }
                                });

                                return { ...n, inputData: propagatedInputData };
                            });
                        });

                        // Send outputs to server and trigger propagation
                        if (flowId) {
                            // Send frontend execution output to server
                            // Server will save outputs to ports and propagate to downstream nodes
                            await runNode(nodeId, { output: outputs }, { force: true });
                        }
                    } else {
                        // ============================================================
                        // Backend Execution Path (existing logic)
                        // ============================================================
                        // Call server API to execute the node.
                        // API response provides status, but socket may have already delivered
                        // a more recent status update (e.g., COMPLETED) before API returns.
                        //
                        // To prevent race condition:
                        //   - Compare API response status with current node status
                        //   - Only update if API status is "more complete" (higher priority)
                        //
                        // Priority: COMPLETED/ERROR (3) > RUNNING (2) > READY (1) > IDLE (0)
                        // ============================================================

                        // Step 1: Collect input data from upstream nodes' outputs
                        // Server's hydrateInputs() reads from DB port nodes, so we must save port data first.
                        const collectedInputData: Record<string, DataPacket> = { ...inputs };
                        for (const conn of incomingConnections) {
                            if (!conn.sourceNodeId || !conn.sourcePortId || !conn.targetPortId) continue;
                            const sourceNode = nodesRef.current.find(n => n.id === conn.sourceNodeId);
                            const sourceOutput = sourceNode?.outputData?.[conn.sourcePortId];
                            if (sourceOutput) {
                                collectedInputData[conn.targetPortId] = sourceOutput;
                            }
                        }

                        // Step 2: Save input port data to server before execution
                        // Server's fromNodeData ignores inputData, so we must upsert port nodes directly
                        if (flowId && Object.keys(collectedInputData).length > 0) {
                            await Promise.all(
                                Object.entries(collectedInputData).map(([portName, packet]) =>
                                    upsertPortNode(flowId, {
                                        stereo: 'port',
                                        parentId: nodeId,
                                        direction: 'in',
                                        name: portName,
                                        dataType: packet.type,
                                        data$: toPortData(packet),
                                    })
                                )
                            );
                        }

                        // Step 3: Run the node (server will hydrate inputs from saved port nodes)
                        const result = await runNode(nodeId, {
                            config: currentNode.config || {},
                        });

                        // Use state from result if available, fallback to status for backward compatibility
                        const resultState = getEffectiveState(result?.state, result?.status);
                        if (resultState) {
                            const duration = Date.now() - startTime;

                            setNodes(prev =>
                                prev.map(n => {
                                    if (n.id !== nodeId) return n;

                                    // Compare priorities: only update if API state >= current state
                                    const currentState = getEffectiveState(n.state, n.status);
                                    if (shouldUpdateState(currentState, resultState)) {
                                        return {
                                            ...n,
                                            state: resultState as NodeState,
                                            status: resultState, // Deprecated: kept for backward compatibility
                                            executionStats: { startTime, duration, progress: 100 },
                                        };
                                    }

                                    // API state is lower priority (e.g., RUNNING when already COMPLETED)
                                    // Keep current state, but update executionStats
                                    return {
                                        ...n,
                                        executionStats: { startTime, duration, progress: 100 },
                                    };
                                })
                            );
                        }
                    }
                } catch (e: unknown) {
                    console.error('[executeNode] Execution failed:', e);
                    const duration = Date.now() - startTime;
                    const errorMessage = e instanceof Error ? e.message : t('flows:detailPanel.unknownError');

                    setNodes(prev =>
                        prev.map(n =>
                            n.id === nodeId
                                ? {
                                      ...n,
                                      state: 'ERROR' as NodeState,
                                      status: 'ERROR', // Deprecated: kept for backward compatibility
                                      errorMessage,
                                      executionStats: { startTime, duration, progress: 0 },
                                  }
                                : n
                        )
                    );
                }
            },
            [readOnly, blockRegistry, t, flowId, connections, flushPendingUpdates]
        );

        executeNodeRef.current = executeNode;

        // ============================================================
        // Auto-execution removed - Backend handles all propagation
        // ============================================================
        // Previously, this component watched for inputData changes and
        // automatically executed downstream nodes. This has been removed
        // because the server's propagateDownstreamV2 handles:
        //   1. Copying output data to downstream input ports
        //   2. Executing downstream nodes automatically
        //
        // Frontend now only executes nodes when user clicks the "Run" button manually
        // ============================================================

        // Node-level properties that should be saved directly on node, not in config
        const NODE_LEVEL_PROPERTIES = ['height', 'width'] as const;
        type NodeLevelProperty = (typeof NODE_LEVEL_PROPERTIES)[number];

        const handleConfigChange = (nodeId: string, key: string, value: unknown) => {
            if (readOnly) return;
            saveCheckpoint();

            // Handle node-level properties separately from config
            if (NODE_LEVEL_PROPERTIES.includes(key as NodeLevelProperty)) {
                const numericValue = typeof value === 'number' && value > 0 ? value : undefined;
                setNodes(prev => prev.map(n => (n.id === nodeId ? { ...n, [key]: numericValue } : n)));
                syncNodeUpdate(nodeId, { [key]: numericValue });
                return;
            }

            setNodes(prev => {
                const node = prev.find(n => n.id === nodeId);
                if (node) {
                    const newConfig = { ...(node.config || {}), [key]: value };
                    syncNodeUpdate(nodeId, { config: newConfig });
                }
                return prev.map(n => (n.id === nodeId ? { ...n, config: { ...(n.config || {}), [key]: value } } : n));
            });
        };

        const handleLabelChange = (nodeId: string, label: string) => {
            if (readOnly) return;
            saveCheckpoint();
            setNodes(prev => prev.map(n => (n.id === nodeId ? { ...n, customLabel: label || undefined } : n)));
            syncNodeUpdate(nodeId, { customLabel: label || undefined });
        };

        const handleDescriptionChange = (nodeId: string, description: string) => {
            if (readOnly) return;
            saveCheckpoint();
            setNodes(prev => prev.map(n => (n.id === nodeId ? { ...n, description: description || undefined } : n)));
            syncNodeUpdate(nodeId, { description: description || undefined });
        };

        const handleToggleAuto = (nodeId: string) => {
            if (readOnly) return;
            saveCheckpoint();
            const node = nodes.find(n => n.id === nodeId);
            const newValue = node ? !node.autoExecutionEnabled : true;
            setNodes(prev =>
                prev.map(n => (n.id === nodeId ? { ...n, autoExecutionEnabled: !n.autoExecutionEnabled } : n))
            );
            syncNodeUpdate(nodeId, { autoExecutionEnabled: newValue });
        };

        const deleteNode = useCallback(
            (id: string) => {
                if (readOnly) return;
                saveCheckpoint();

                // Get connected edges before removing from state
                const connectedEdges = connectionsRef.current.filter(
                    c => c.sourceNodeId === id || c.targetNodeId === id
                );

                setNodes(prev => prev.filter(n => n.id !== id));
                setConnections(prev => prev.filter(c => c.sourceNodeId !== id && c.targetNodeId !== id));
                handleSelectionChange(null);

                if (flowId && !flowId.startsWith('local-') && !isTempId(id)) {
                    const serverEdges = connectedEdges.filter(e => e.id && !isTempId(e.id));
                    const nodesToDelete = [{ id: `#${id}` }] as unknown as NodeData[];
                    const edgesToDelete = serverEdges.map(e => ({ id: `#${e.id}` })) as unknown as Connection[];

                    upsertFlow(flowId, { nodes: nodesToDelete, edges: edgesToDelete }).catch(err => {
                        console.error('[WorkflowCanvas] Failed to delete node:', err);
                    });
                }
            },
            [readOnly, saveCheckpoint, handleSelectionChange, flowId]
        );

        const deleteConnection = useCallback(
            (id: string) => {
                if (readOnly) return;
                saveCheckpoint();

                setConnections(prev => prev.filter(c => c.id !== id));
                setSelectedConnectionId(null);

                if (flowId && !flowId.startsWith('local-') && !isTempId(id)) {
                    const edgesToDelete = [{ id: `#${id}` }] as unknown as Connection[];

                    upsertFlow(flowId, { nodes: [], edges: edgesToDelete }).catch(err => {
                        console.error('[WorkflowCanvas] Failed to delete edge:', err);
                    });
                }
            },
            [readOnly, saveCheckpoint, flowId]
        );

        const duplicateNode = useCallback(
            (nodeId: string) => {
                if (readOnly) return;
                const node = nodes.find(n => n.id === nodeId);
                if (!node) return;

                saveCheckpoint();

                const tempId = generateTempId('node');
                const newNode: NodeData = {
                    ...node,
                    id: tempId,
                    position: {
                        x: Math.round((node.position.x + 40) / GRID_SIZE) * GRID_SIZE,
                        y: Math.round((node.position.y + 40) / GRID_SIZE) * GRID_SIZE,
                    },
                    state: 'IDLE' as NodeState,
                    status: 'IDLE', // Deprecated: kept for backward compatibility
                    inputData: {},
                    outputData: {},
                    errorMessage: undefined,
                    config: node.config ? JSON.parse(JSON.stringify(node.config)) : {},
                    autoExecutionEnabled: node.autoExecutionEnabled ?? true,
                    customLabel: node.customLabel ? `${node.customLabel} (copy)` : undefined,
                };

                // Optimistic UI update
                setNodes(prev => [...prev, newNode]);
                handleSelectionChange(tempId);

                // Create on backend with server-assigned ID
                createNodeAsync(
                    tempId,
                    {
                        type: node.type,
                        position: newNode.position,
                        config: newNode.config ?? {},
                        customLabel: newNode.customLabel,
                        autoExecutionEnabled: newNode.autoExecutionEnabled,
                    },
                    (oldTempId, newServerId) => {
                        replaceNodeIdInState(oldTempId, newServerId, setNodes, setConnections, setSelectedNodeIds);
                    }
                );
            },
            [readOnly, nodes, saveCheckpoint, handleSelectionChange, createNodeAsync]
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
            setSelectedConnectionId(null);

            const isMultiSelectKey = e.shiftKey || e.metaKey || e.ctrlKey;
            const isAlreadySelected = selectedNodeIds.has(nodeId);

            // Handle selection based on modifier keys
            if (isMultiSelectKey) {
                // Shift/Cmd/Ctrl + click: toggle selection
                handleSelectionChange(nodeId, { toggleSelection: true });
            } else if (!isAlreadySelected) {
                // Regular click on unselected node: replace selection
                handleSelectionChange(nodeId);
            }
            // If already selected without modifier, keep current selection for group drag

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

            // Determine which nodes will be dragged
            const nodesToDrag =
                isAlreadySelected || isMultiSelectKey ? new Set([...selectedNodeIds, nodeId]) : new Set([nodeId]);

            // Store initial positions of all nodes to be dragged
            const initialPositions = new Map<string, { x: number; y: number }>();
            nodesToDrag.forEach(id => {
                const node = nodes.find(n => n.id === id);
                if (node) {
                    initialPositions.set(id, { x: node.position.x, y: node.position.y });
                }
            });

            setDragState({
                nodeId,
                startX: e.clientX,
                startY: e.clientY,
                initialPositions,
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

                // Move all nodes that are being dragged
                setNodes(prev =>
                    prev.map(n => {
                        const initialPos = dragState.initialPositions.get(n.id);
                        if (!initialPos) return n;

                        const rawX = initialPos.x + dx;
                        const rawY = initialPos.y + dy;
                        const snappedX = Math.round(rawX / GRID_SIZE) * GRID_SIZE;
                        const snappedY = Math.round(rawY / GRID_SIZE) * GRID_SIZE;

                        return { ...n, position: { x: snappedX, y: snappedY } };
                    })
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
                // Check if any node was actually moved
                const movedNodes = Array.from(dragState.initialPositions.entries())
                    .map(([nodeId, initialPos]) => {
                        const currentNode = nodes.find(n => n.id === nodeId);
                        if (
                            currentNode &&
                            (currentNode.position.x !== initialPos.x || currentNode.position.y !== initialPos.y)
                        ) {
                            return currentNode;
                        }
                        return null;
                    })
                    .filter((n): n is NodeData => n !== null);

                if (movedNodes.length > 0) {
                    pastRef.current.push(dragStartSnapshotRef.current);
                    futureRef.current = [];

                    // Batch update moved nodes' positions via /flows/:id/upsert
                    if (flowId && !flowId.startsWith('local-')) {
                        const nodesToUpdate = movedNodes
                            .filter(n => n.id && !isTempId(n.id))
                            .map(n => ({
                                id: n.id,
                                position: n.position,
                            }));

                        if (nodesToUpdate.length > 0) {
                            upsertFlow(flowId, { nodes: nodesToUpdate as NodeData[], edges: [] }).catch(err => {
                                console.error('[WorkflowCanvas] Failed to batch update node positions:', err);
                            });
                        }
                    }
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
                    // Check for cycle before creating connection
                    // Use sourceNode.id (current state) instead of connectionDraft.sourceNodeId
                    // to handle race condition where temp ID was replaced with server ID
                    if (wouldCreateCycle(connections, sourceNode.id, targetNode.id)) {
                        onConnectionError?.('cycle');
                        setConnectionDraft(null);
                        return;
                    }

                    saveCheckpoint();

                    const tempEdgeId = generateTempId('edge');
                    const newConn: Connection = {
                        id: tempEdgeId,
                        sourceNodeId: connectionDraft.sourceNodeId,
                        sourcePortId: connectionDraft.sourcePortId,
                        targetNodeId,
                        targetPortId,
                    };

                    // Optimistic UI update
                    setConnections(prev => {
                        const filtered = prev.filter(
                            c => !(c.targetNodeId === targetNodeId && c.targetPortId === targetPortId)
                        );
                        return [...filtered, newConn];
                    });

                    const packet = sourceNode.outputData?.[connectionDraft.sourcePortId];
                    if (packet) {
                        // Copy existing output data to the new connection's target input
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

                    // Check if either node has a temp ID - if so, wait for real IDs
                    const sourceIsTempId = isTempId(connectionDraft.sourceNodeId);
                    const targetIsTempId = isTempId(targetNodeId);

                    // Create edge callback to replace temp ID with server ID
                    const onEdgeIdAssigned = (oldTempId: string, newServerId: string) => {
                        setConnections(prev => prev.map(c => (c.id === oldTempId ? { ...c, id: newServerId } : c)));
                    };

                    if (!sourceIsTempId && !targetIsTempId) {
                        // Both nodes have real IDs, create edge immediately
                        createEdgeAsync(
                            tempEdgeId,
                            {
                                sourceNodeId: connectionDraft.sourceNodeId,
                                sourcePortId: connectionDraft.sourcePortId,
                                targetNodeId,
                                targetPortId,
                            },
                            onEdgeIdAssigned
                        );
                    } else {
                        // One or both nodes have temp IDs - wait for real IDs then create edge
                        const createEdgeAfterNodeIds = async () => {
                            const resolvedSourceId = sourceIsTempId
                                ? await waitForNodeId(connectionDraft.sourceNodeId)
                                : connectionDraft.sourceNodeId;
                            const resolvedTargetId = targetIsTempId ? await waitForNodeId(targetNodeId) : targetNodeId;

                            createEdgeAsync(
                                tempEdgeId,
                                {
                                    sourceNodeId: resolvedSourceId,
                                    sourcePortId: connectionDraft.sourcePortId,
                                    targetNodeId: resolvedTargetId,
                                    targetPortId,
                                },
                                onEdgeIdAssigned
                            );
                        };
                        createEdgeAfterNodeIds();
                    }
                }
            }
            setConnectionDraft(null);
            handleSelectionChange(null);
        };

        /**
         * Calculate port position based on VISIBLE ports only.
         *
         * Visibility rules (from getVisiblePorts):
         * 1. First port is always visible
         * 2. Connected ports are always visible
         * 3. Input ports: also show compatible ports when dragging from output
         */
        const getPortPosition = (nodeId: string, portId: string, type: 'input' | 'output') => {
            const node = nodes.find(n => n.id === nodeId);
            if (!node) return { x: 0, y: 0 };
            const def = blockRegistry[node.type];
            if (!def) return { x: node.position.x, y: node.position.y };

            const allPorts = type === 'input' ? def.inputs : def.outputs;
            if (allPorts.length === 0) return { x: node.position.x, y: node.position.y };

            // Calculate connected port IDs for this node
            const connectedPortIds = connections
                .filter(c => (type === 'input' ? c.targetNodeId : c.sourceNodeId) === nodeId)
                .map(c => (type === 'input' ? c.targetPortId : c.sourcePortId));

            // Use shared utility for consistent visibility calculation
            const visiblePorts = getVisiblePorts(allPorts, connectedPortIds, connectionDraft, nodeId, type);

            // Find index within visible ports
            const visibleIndex = visiblePorts.findIndex(p => p.id === portId);
            const safeIndex = visibleIndex !== -1 ? visibleIndex : 0;

            const yOffset = PORT_LAYOUT.FIRST_PORT_Y + safeIndex * PORT_LAYOUT.PORT_SPACING;
            const xOffset = type === 'input' ? PORT_LAYOUT.INPUT_X : PORT_LAYOUT.OUTPUT_X;
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
                    if (selectedNodeIds.size > 0) {
                        const nodesToCopy = nodes.filter(n => selectedNodeIds.has(n.id));
                        if (nodesToCopy.length > 0) setClipboard(nodesToCopy);
                    }
                }

                if (isCtrlOrCmd && e.key.toLowerCase() === 'v') {
                    if (clipboard.length > 0) {
                        saveCheckpoint();

                        // Calculate offset from original positions
                        const offsetX = 40;
                        const offsetY = 40;

                        // Generate temp IDs for all pasted nodes
                        const newNodes: NodeData[] = clipboard.map(node => ({
                            ...node,
                            id: generateTempId('node'),
                            position: {
                                x: Math.round((node.position.x + offsetX) / GRID_SIZE) * GRID_SIZE,
                                y: Math.round((node.position.y + offsetY) / GRID_SIZE) * GRID_SIZE,
                            },
                            state: 'IDLE' as NodeState,
                            status: 'IDLE', // Deprecated: kept for backward compatibility
                            inputData: {},
                            outputData: {},
                            errorMessage: undefined,
                            config: node.config ? JSON.parse(JSON.stringify(node.config)) : {},
                            autoExecutionEnabled: node.autoExecutionEnabled ?? true,
                            customLabel: node.customLabel,
                        }));

                        // Optimistic UI update
                        setNodes(prev => [...prev, ...newNodes]);
                        // Select all pasted nodes
                        setSelectedNodeIds(new Set(newNodes.map(n => n.id)));

                        // Create each node on backend
                        newNodes.forEach(newNode => {
                            createNodeAsync(
                                newNode.id,
                                {
                                    type: newNode.type,
                                    position: newNode.position,
                                    config: newNode.config ?? {},
                                    customLabel: newNode.customLabel,
                                    autoExecutionEnabled: newNode.autoExecutionEnabled,
                                },
                                (oldTempId, newServerId) => {
                                    replaceNodeIdInState(
                                        oldTempId,
                                        newServerId,
                                        setNodes,
                                        setConnections,
                                        setSelectedNodeIds
                                    );
                                }
                            );
                        });
                    }
                }

                if (e.key === 'Delete' || e.key === 'Backspace') {
                    if (selectedNodeIds.size > 0) {
                        // Delete all selected nodes
                        saveCheckpoint();

                        // Get connected edges before removing from state
                        const connectedEdges = connectionsRef.current.filter(
                            c => selectedNodeIds.has(c.sourceNodeId) || selectedNodeIds.has(c.targetNodeId)
                        );

                        setNodes(prev => prev.filter(n => !selectedNodeIds.has(n.id)));
                        setConnections(prev =>
                            prev.filter(
                                c => !selectedNodeIds.has(c.sourceNodeId) && !selectedNodeIds.has(c.targetNodeId)
                            )
                        );
                        handleSelectionChange(null);

                        if (flowId && !flowId.startsWith('local-')) {
                            const serverNodeIds = Array.from(selectedNodeIds).filter(id => !isTempId(id));
                            const serverEdges = connectedEdges.filter(e => e.id && !isTempId(e.id));

                            if (serverNodeIds.length > 0 || serverEdges.length > 0) {
                                const nodesToDelete = serverNodeIds.map(id => ({
                                    id: `#${id}`,
                                })) as unknown as NodeData[];
                                const edgesToDelete = serverEdges.map(e => ({
                                    id: `#${e.id}`,
                                })) as unknown as Connection[];

                                upsertFlow(flowId, { nodes: nodesToDelete, edges: edgesToDelete }).catch(err => {
                                    console.error('[WorkflowCanvas] Failed to delete nodes:', err);
                                });
                            }
                        }
                    } else if (selectedConnectionId || hoveredConnectionId) {
                        const targetId = selectedConnectionId || hoveredConnectionId;
                        saveCheckpoint();
                        setConnections(prev => prev.filter(c => c.id !== targetId));
                        setSelectedConnectionId(null);
                        setHoveredConnectionId(null);
                        setTooltip(null);

                        if (flowId && !flowId.startsWith('local-') && targetId && !isTempId(targetId)) {
                            const edgesToDelete = [{ id: `#${targetId}` }] as unknown as Connection[];

                            upsertFlow(flowId, { nodes: [], edges: edgesToDelete }).catch(err => {
                                console.error('[WorkflowCanvas] Failed to delete edge:', err);
                            });
                        }
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
            selectedNodeIds,
            selectedConnectionId,
            hoveredConnectionId,
            clipboard,
            readOnly,
            viewport,
            saveCheckpoint,
            handleSelectionChange,
            createNodeAsync,
            flowId,
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
                    {/* Background Grid - always visible with subtle opacity */}
                    <div
                        className="absolute inset-0 pointer-events-none transition-opacity duration-300 ease-in-out z-0"
                        style={{
                            opacity: dragState ? 0.4 : 0.15,
                            backgroundImage: 'radial-gradient(hsl(var(--muted-foreground) / 0.5) 1px, transparent 1px)',
                            backgroundSize: `${GRID_SIZE * viewport.zoom}px ${GRID_SIZE * viewport.zoom}px`,
                            backgroundPosition: `${viewport.x}px ${viewport.y}px`,
                        }}
                    />

                    {/* Empty State */}
                    {nodes.length === 0 && !readOnly && onOpenLibrary && <EmptyState onOpenLibrary={onOpenLibrary} />}

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
                                const targetNode = nodes.find(n => n.id === conn.targetNodeId);
                                const packet = sourceNode?.outputData?.[conn.sourcePortId];
                                const isActive = !!packet;
                                // Use getEffectiveState for backward compatibility (state preferred, status fallback)
                                const sourceState = getEffectiveState(sourceNode?.state, sourceNode?.status);
                                const targetState = getEffectiveState(targetNode?.state, targetNode?.status);
                                const isFlowing = sourceState === 'RUNNING' || targetState === 'RUNNING';

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
                                        isFlowing={isFlowing}
                                        onMouseEnter={handleHover}
                                        onMouseMove={handleHover}
                                        onMouseLeave={handleLeave}
                                        onClick={handleClick}
                                    />
                                );
                            })}
                            {connectionDraft &&
                                (() => {
                                    const draftStart = getPortPosition(
                                        connectionDraft.sourceNodeId,
                                        connectionDraft.sourcePortId,
                                        'output'
                                    );
                                    return (
                                        <ConnectionLine
                                            x1={draftStart.x}
                                            y1={draftStart.y}
                                            x2={connectionDraft.mouseX}
                                            y2={connectionDraft.mouseY}
                                            isActive={true}
                                            isDraft={true}
                                        />
                                    );
                                })()}
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

                                // Calculate connected ports for this node
                                const connectedPorts = connections
                                    .filter(c => c.sourceNodeId === node.id || c.targetNodeId === node.id)
                                    .map(c => (c.sourceNodeId === node.id ? c.sourcePortId : c.targetPortId));

                                return (
                                    <div key={node.id}>
                                        <NodeBlock
                                            node={node}
                                            highlightState={{
                                                isSelected: selectedNodeIds.has(node.id),
                                                isHighlighted: !!isConnected,
                                                updatedPortIds: updatedPortIdsByNode.get(node.id) ?? [],
                                                highlightedPortIds: highlightedPorts,
                                                connectedPortIds: connectedPorts,
                                                connectionDraft: connectionDraft
                                                    ? {
                                                          sourceNodeId: connectionDraft.sourceNodeId,
                                                          sourcePortId: connectionDraft.sourcePortId,
                                                          sourceType: connectionDraft.sourceType,
                                                      }
                                                    : null,
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
                                            isDragging={dragState?.initialPositions.has(node.id) ?? false}
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
                                <div className="text-xs text-foreground min-w-[100px] max-w-[400px] break-all">
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
                        onShowNotification={onShowNotification}
                    />
                </div>
            </div>
        );
    }
);
