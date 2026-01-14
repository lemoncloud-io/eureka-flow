import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { ScrollText, X } from 'lucide-react';

import { fetchBlockLogs, loadFlow, useBlockRegistry } from '@flows/flows';

import { ConnectionLine } from './ConnectionLine';
import { DetailPanel } from './DetailPanel';
import { NodeBlock } from './NodeBlock';
import { generateId, isValidConnection } from '../utils';

import type {
    Connection,
    DataPacket,
    LogEntry,
    NodeData,
    PortDefinition,
    WorkflowState,
} from '@lemoncloud/eureka-flows-api';

// Define Ref Interface
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
}

interface WorkflowCanvasProps {
    readOnly?: boolean;
    initialData?: WorkflowState;
    onNodeSelect?: (nodeId: string | null) => void;
    onChange?: () => void; // New prop for Auto Save
}

const GRID_SIZE = 20;

// --- Helper Components ---

const TooltipImage = ({ src }: { src: string }) => {
    const [dims, setDims] = useState<string | null>(null);
    return (
        <div className="relative inline-block">
            <img
                src={src}
                alt="Preview"
                className="max-w-[140px] max-h-[140px] rounded border border-border bg-background/50 block"
                onLoad={e => setDims(`${e.currentTarget.naturalWidth}x${e.currentTarget.naturalHeight}`)}
            />
            {dims && (
                <div className="absolute bottom-1 right-1 bg-popover/80 text-[9px] text-foreground px-1.5 py-0.5 rounded backdrop-blur-md border border-border/10 font-mono shadow-sm">
                    {dims}
                </div>
            )}
        </div>
    );
};

// --- Log Modal Component (Centralized) ---
const LogModal = ({ nodeId, onClose }: { nodeId: string; onClose: () => void }) => {
    const { t } = useTranslation('flows');
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState('');

    useEffect(() => {
        setLoading(true);
        fetchBlockLogs(nodeId).then(data => {
            setLogs(data);
            setLoading(false);
        });
    }, [nodeId]);

    const filteredLogs = logs.filter(l => l.message.toLowerCase().includes(filter.toLowerCase()));

    return createPortal(
        <div
            className="fixed inset-0 z-[110] flex items-center justify-center bg-background/60 backdrop-blur-sm"
            onMouseDown={e => e.stopPropagation()}
        >
            <div className="bg-popover border border-border rounded-lg shadow-2xl w-[600px] max-w-[95vw] h-[500px] flex flex-col animate-in fade-in zoom-in-95 duration-200 font-mono">
                <div className="flex items-center justify-between p-3 border-b border-border bg-muted">
                    <div className="flex items-center gap-2">
                        <ScrollText className="w-5 h-5 text-muted-foreground" />
                        <div>
                            <h3 className="text-sm font-bold text-foreground">{t('canvas.executionLogs')}</h3>
                            <p className="text-[10px] text-muted-foreground">
                                {t('canvas.nodeId')}: {nodeId}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="p-2 border-b border-border bg-muted/50 flex gap-2">
                    <input
                        type="text"
                        placeholder={t('canvas.filterLogs')}
                        className="flex-1 bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:border-primary outline-none"
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                    />
                    <button
                        onClick={() => {
                            setLoading(true);
                            fetchBlockLogs(nodeId).then(data => {
                                setLogs(data);
                                setLoading(false);
                            });
                        }}
                        className="px-3 bg-muted hover:bg-accent border border-border rounded text-xs text-muted-foreground"
                    >
                        {t('canvas.refresh')}
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1 bg-background/30">
                    {loading ? (
                        <div className="flex justify-center items-center h-full text-muted-foreground text-xs">
                            {t('canvas.loading')}
                        </div>
                    ) : filteredLogs.length === 0 ? (
                        <div className="text-center text-muted-foreground text-xs py-10 italic">
                            {t('canvas.noLogs')}
                        </div>
                    ) : (
                        filteredLogs.map(log => (
                            <div
                                key={log.id}
                                className="text-[11px] flex gap-2 p-1.5 hover:bg-accent/50 rounded border-b border-border/50 last:border-0"
                            >
                                <div className="text-muted-foreground w-24 shrink-0 font-mono">
                                    {new Date(log.timestamp).toLocaleTimeString()}
                                </div>
                                <div
                                    className={`w-14 shrink-0 font-bold ${log.level === 'ERROR' ? 'text-destructive' : log.level === 'WARN' ? 'text-warning' : 'text-primary'}`}
                                >
                                    {log.level}
                                </div>
                                <div className="text-foreground flex-1 break-all">{log.message}</div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

export const WorkflowCanvas = forwardRef<WorkflowCanvasRef, WorkflowCanvasProps>(
    ({ readOnly, initialData, onNodeSelect, onChange }, ref) => {
        const { t } = useTranslation('flows');
        // --- BLOCK REGISTRY FROM STORE ---
        const blockRegistry = useBlockRegistry();

        // --- STATE ---
        const [nodes, setNodes] = useState<NodeData[]>([]);
        const [connections, setConnections] = useState<Connection[]>([]);

        // Clipboard
        const [clipboard, setClipboard] = useState<NodeData | null>(null);

        // History State
        const pastRef = useRef<WorkflowState[]>([]);
        const futureRef = useRef<WorkflowState[]>([]);
        const dragStartSnapshotRef = useRef<WorkflowState | null>(null);

        // Input hash tracking for reactive execution (prevents re-execution with same inputs)
        const nodeInputHashesRef = useRef<Map<string, string>>(new Map());

        // Viewport State (Zoom & Pan)
        const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
        const [isPanning, setIsPanning] = useState(false);
        const lastMousePosRef = useRef({ x: 0, y: 0 });

        // UI Interaction State
        const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
        const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
        const [hoveredConnectionId, setHoveredConnectionId] = useState<string | null>(null);

        // Modal States
        const [logViewerNodeId, setLogViewerNodeId] = useState<string | null>(null);

        const [dragState, setDragState] = useState<{
            nodeId: string;
            startX: number;
            startY: number;
            initialX: number;
            initialY: number;
        } | null>(null);
        const [tooltip, setTooltip] = useState<{ x: number; y: number; content: unknown; type: string } | null>(null);

        // Component Modal State
        const [modalFlowId, setModalFlowId] = useState<string | null>(null);
        const [modalFlowData, setModalFlowData] = useState<WorkflowState | null>(null);

        // Connection Creation State
        const [connectionDraft, setConnectionDraft] = useState<{
            sourceNodeId: string;
            sourcePortId: string;
            sourceType: string;
            mouseX: number;
            mouseY: number;
        } | null>(null);

        const canvasRef = useRef<HTMLDivElement>(null);

        // --- CHANGE DETECTION FOR AUTO SAVE ---
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

        // --- HISTORY MANAGEMENT ---
        const saveCheckpoint = useCallback(() => {
            if (readOnly) return;
            // Push current state to past
            pastRef.current.push({
                nodes: JSON.parse(JSON.stringify(nodes)), // Deep copy to prevent reference issues
                connections: [...connections],
            });
            // Clear future because we branched off
            futureRef.current = [];
        }, [nodes, connections, readOnly]);

        const undo = useCallback(() => {
            if (readOnly || pastRef.current.length === 0) return;

            // Save current state to future
            futureRef.current.push({
                nodes: JSON.parse(JSON.stringify(nodes)),
                connections: [...connections],
            });

            // Pop from past
            const previous = pastRef.current.pop();
            if (previous) {
                setNodes(previous.nodes);
                setConnections(previous.connections);
            }
        }, [nodes, connections, readOnly]);

        const redo = useCallback(() => {
            if (readOnly || futureRef.current.length === 0) return;

            // Save current state to past
            pastRef.current.push({
                nodes: JSON.parse(JSON.stringify(nodes)),
                connections: [...connections],
            });

            // Pop from future
            const next = futureRef.current.pop();
            if (next) {
                setNodes(next.nodes);
                setConnections(next.connections);
            }
        }, [nodes, connections, readOnly]);

        // Load Initial Data
        useEffect(() => {
            if (initialData) {
                setNodes(initialData.nodes);
                setConnections(initialData.connections);
                pastRef.current = [];
                futureRef.current = [];
            }
        }, [initialData]);

        // Load Sub-Flow for Modal
        useEffect(() => {
            if (modalFlowId) {
                loadFlow(modalFlowId).then(setModalFlowData);
            } else {
                setModalFlowData(null);
            }
        }, [modalFlowId]);

        // Sync internal selection with parent prop
        const handleSelectionChange = useCallback(
            (nodeId: string | null) => {
                setSelectedNodeId(nodeId);
                if (onNodeSelect) {
                    onNodeSelect(nodeId);
                }
            },
            [onNodeSelect]
        );

        // Helper: Convert Screen (Mouse) Coordinates to World (Canvas) Coordinates
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

        // Expose methods to parent
        useImperativeHandle(
            ref,
            () => ({
                addNode: (type: string) => {
                    if (readOnly) return;
                    saveCheckpoint(); // Save before adding

                    const newDef = blockRegistry[type];
                    if (!newDef) return;

                    // --- Auto Connect Logic ---
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

                    // --- Position ---
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

                    // Snap
                    const snappedX = Math.round(startX / GRID_SIZE) * GRID_SIZE;
                    const snappedY = Math.round(startY / GRID_SIZE) * GRID_SIZE;

                    const newNode: NodeData = {
                        id: generateId(),
                        type,
                        position: {
                            x: snappedX,
                            y: snappedY,
                        },
                        config: { ...blockRegistry[type].defaultConfig },
                        status: 'IDLE',
                        inputData: {},
                        outputData: {},
                        autoExecutionEnabled: true,
                    };

                    // --- Connect ---
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

                    // --- Update State ---
                    setNodes(prev => [...prev, newNode]);
                    if (newConnection) {
                        setConnections(prev => [...prev, newConnection!]);
                    }

                    handleSelectionChange(newNode.id);
                    setSelectedConnectionId(null);
                },
                getWorkflow: () => ({ nodes, connections }),
                loadWorkflow: (state: WorkflowState) => {
                    setNodes(state.nodes);
                    setConnections(state.connections);
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

                    // Simple Layered Layout
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
                },
            }),
            [nodes, connections, viewport, readOnly, undo, redo, saveCheckpoint, selectedNodeId, handleSelectionChange]
        );

        // --- ENGINE LOGIC ---
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
            [connections]
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
                            n.id === nodeId ? { ...n, status: 'ERROR', errorMessage: 'Unknown Block Type' } : n
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

                    // Store input hash to prevent re-execution with same inputs
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
                    const errorMessage = e instanceof Error ? e.message : 'Unknown error';

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
            [nodes, propagateOutputs, readOnly, blockRegistry]
        );

        // Reactive Trigger
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

        // --- UI HANDLERS ---
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

        // --- PAN & ZOOM HANDLERS ---
        const handleWheel = (e: React.WheelEvent) => {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return;
            const delta = -e.deltaY * 0.001;
            const newZoom = Math.min(Math.max(viewport.zoom + delta, 0.1), 5);

            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const worldX = (mouseX - viewport.x) / viewport.zoom;
            const worldY = (mouseY - viewport.y) / viewport.zoom;

            const newX = mouseX - worldX * newZoom;
            const newY = mouseY - worldY * newZoom;

            setViewport({ x: newX, y: newY, zoom: newZoom });
        };

        const handleCanvasMouseDown = (e: React.MouseEvent) => {
            if (e.button === 0 || e.button === 1) {
                setIsPanning(true);
                lastMousePosRef.current = { x: e.clientX, y: e.clientY };
                handleSelectionChange(null);
                setSelectedConnectionId(null);
            }
        };

        const handleDoubleClick = (_e: React.MouseEvent) => {
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
                    prev.map(n =>
                        n.id === dragState.nodeId
                            ? {
                                  ...n,
                                  position: { x: snappedX, y: snappedY },
                              }
                            : n
                    )
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
                    if (sourceNode.outputData[connectionDraft.sourcePortId]) {
                        setNodes(prev =>
                            prev.map(n =>
                                n.id === targetNodeId
                                    ? {
                                          ...n,
                                          inputData: {
                                              ...n.inputData,
                                              [targetPortId]: sourceNode.outputData[connectionDraft.sourcePortId],
                                          },
                                      }
                                    : n
                            )
                        );
                    }
                }
            }
            setConnectionDraft(null);
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
            const yOffset = 87 + safeIndex * 32;
            const xOffset = type === 'input' ? 14 : 210;
            return { x: node.position.x + xOffset, y: node.position.y + yOffset };
        };

        // --- SHORTCUTS EFFECT ---
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
                        let x = 100;
                        let y = 100;
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

                                const handleClick = (_e: React.MouseEvent) => {
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
                                            isSelected={selectedNodeId === node.id}
                                            isHighlighted={!!isConnected}
                                            highlightedPortIds={highlightedPorts}
                                            onMouseDown={e => handleNodeMouseDown(e, node.id)}
                                            onPortMouseDown={handlePortMouseDown}
                                            onPortMouseUp={handlePortMouseUp}
                                            onConfigChange={(k, v) => handleConfigChange(node.id, k, v)}
                                            onLabelChange={label => handleLabelChange(node.id, label)}
                                            onDelete={() => deleteNode(node.id)}
                                            onTrigger={() => executeNode(node.id)}
                                            onToggleAuto={() => handleToggleAuto(node.id)}
                                            onViewComponent={id => setModalFlowId(id)}
                                            onViewLogs={() => setLogViewerNodeId(node.id)}
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
                                <TooltipImage src={tooltip.content} />
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
                        <div className="absolute bottom-4 right-4 bg-popover/80 p-2 rounded text-xs text-muted-foreground pointer-events-none">
                            {t('canvas.zoom')}: {Math.round(viewport.zoom * 100)}% | {t('canvas.position')}:{' '}
                            {Math.round(viewport.x)}, {Math.round(viewport.y)}
                        </div>
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
