import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { X } from 'lucide-react';

import { createFlowEngine, mergeNodeView, propagateAlongEdges } from '@flows/engine';
import {
    COLLAPSED_PORT_Y,
    EXECUTE_FUNCTIONS,
    EXECUTION_FALLBACK_TIMEOUT_MS,
    LAYOUT_CONFIG,
    PORT_LAYOUT,
    estimateNodeHeight,
    findNodeAtPoint,
    flowStorage,
    getEffectiveState,
    getNode,
    getNodeWidth,
    getPermissions,
    getPortData,
    hydrateInputsFromUpstream,
    loadFlow,
    nodesInRect,
    pasteOffsetTo,
    runFlow,
    runNode,
    shouldUpdateState,
    toDataPacket,
    toPortVariantData,
    translateField,
    upsertPortNode,
    useBlockRegistry,
    useCanvasConnections,
    useCanvasNodes,
    useCanvasStore,
    useCollapsedNodeIds,
    useFlowsStore,
    useUpdatedPortIds,
} from '@flows/flows';

import { CanvasContextMenu } from './CanvasContextMenu';
import { ConnectionLine } from './ConnectionLine';
import { DataTooltip } from './DataTooltip';
import { DetailPanel } from './DetailPanel';
import { EmptyStateGuide } from './EmptyStateGuide';
import { Minimap } from './Minimap';
import { MobileControls } from './MobileControls';
import { NodeBlock } from './NodeBlock';
import { ZoomControls } from './ZoomControls';
import { TOUCH_GESTURE_THRESHOLD, useEngineMirror, useTouchCanvas } from '../hooks';
import {
    arePortTypesCompatible,
    captureCanvasAsDataUrl,
    captureCanvasForThumbnail,
    exportCanvasAsPng,
    getVisiblePorts,
} from '../utils';

import type { FlowEngine } from '@flows/engine';
import type { FlowRole, GraphNode, GraphSnapshot, LoadFlowPortData, NodeState } from '@flows/flows';
import type { NodeData, WorkflowState } from '@lemoncloud/eureka-flows-api';

const PORT_HIGHLIGHT_MS = 300;

/** Stable empty array to avoid new references in render loop */
const EMPTY_STRING_ARRAY: string[] = [];

/** Extended WorkflowState with optional ports array from LoadFlowResult */
interface WorkflowStateWithPorts extends WorkflowStateWithLegacyEdges {
    ports?: LoadFlowPortData[];
}

/**
 * A graph that may still name its edges `connections`.
 *
 * Flows saved before the field was renamed load with the old key, and the canvas has to
 * take either. Declared here so reading it is not a type error at every call site.
 */
interface WorkflowStateWithLegacyEdges extends WorkflowState {
    connections?: WorkflowState['edges'];
}

/** The output port a new node should be wired to, when the caller already knows it. */
export interface LinkSource {
    nodeId: string;
    portId: string;
    portType: string;
}

export interface WorkflowCanvasRef {
    addNode: (type: string, position?: { x: number; y: number }, source?: LinkSource) => void;
    getWorkflow: () => GraphSnapshot;
    /** Load workflow from server data. Fetches missing port data (data: null) via API. */
    loadWorkflow: (state: WorkflowStateWithPorts) => Promise<void>;
    clearWorkflow: () => void;
    newWorkflow: () => void;
    undo: () => void;
    redo: () => void;
    autoLayout: () => void;
    selectNode: (nodeId: string | null) => void;
    /** Select every node on the canvas. */
    selectAll: () => void;
    /** Execute a specific node by ID */
    executeNode: (nodeId: string) => Promise<void>;
    /** Update node from server data (used for socket node update notifications) */
    updateNodeFromServer: (nodeId: string, serverData: Partial<NodeData>, options?: { force?: boolean }) => void;
    /** Export canvas as PNG image */
    exportAsImage: (fileName: string) => Promise<void>;
    /** Capture canvas as data URL without downloading */
    captureAsDataUrl: () => Promise<string | null>;
    /** Lightweight capture for thumbnail (skips CORS inlining, uses pixelRatio 1) */
    captureForThumbnail: () => Promise<string | null>;
    /** Collapse all nodes */
    collapseAll: () => void;
    /** Expand all nodes */
    expandAll: () => void;
    /** Run all input nodes with auto-execution enabled */
    runAll: () => Promise<void>;
}

interface WorkflowCanvasProps {
    /** User role for permission-based access control (defaults to 'owner') */
    role?: FlowRole;
    initialData?: WorkflowState;
    /** Flow ID for syncing node changes to backend */
    flowId?: string | null;
    /** WebSocket connection ID for streaming execution results */
    connectionId?: string;
    onNodeSelect?: (nodeId: string | null) => void;
    onChange?: () => void;
    /**
     * Clears a user-initiated run, saving first if the server has not seen the graph yet.
     * Returning false stops the run. Runs continuing on a socket message skip this — the
     * server sending them is proof it already knows the node.
     */
    onBeforeRun?: () => Promise<boolean>;
    /** Called when user clicks "Add Node" from empty state */
    onOpenLibrary?: () => void;
    /** Called when a connection is rejected due to validation error */
    onConnectionError?: (error: 'cycle' | 'invalid_type') => void;
    /** Called to show notification message (dev only, for touch debug) */
    onShowNotification?: (message: string, type: 'success' | 'error') => void;
    /** Called when AI key is required but missing */
    onAiKeyRequired?: () => void;
    /**
     * The engine that owns this canvas's graph.
     *
     * Optional so the secondary canvases — the component-viewer modal, the tutorial —
     * keep working without one being threaded down to them; each falls back to an engine
     * of its own. The editor passes its own so the page can reach the same graph.
     */
    engine?: FlowEngine;
}

const GRID_SIZE = 20;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;

/** Mouse movement threshold (px) to distinguish click from drag */
const CLICK_THRESHOLD = 5;

/** World-space gap left between a node and one inserted beside it */
const NEW_NODE_GAP = 80;

const snapToGrid = (point: { x: number; y: number }) => ({
    x: Math.round(point.x / GRID_SIZE) * GRID_SIZE,
    y: Math.round(point.y / GRID_SIZE) * GRID_SIZE,
});

/** Touch port hit detection threshold in world coordinates */
const TOUCH_PORT_HIT_THRESHOLD = 50;

/** Port position constants for touch hit detection */
const TOUCH_PORT_LAYOUT = {
    /** Input port X offset from node left edge */
    INPUT_X_OFFSET: -6,
    /** First port Y offset from node top */
    FIRST_PORT_Y: 45,
    /** Vertical spacing between ports */
    PORT_SPACING: 16,
    /** Port center offset */
    PORT_CENTER_OFFSET: 6,
} as const;

/**
 * Find the closest input port to a given world position (for touch connection drop)
 */
const findClosestInputPort = (
    worldPos: { x: number; y: number },
    nodes: GraphNode[],
    blockRegistry: Record<string, { inputs: Array<{ id: string; type?: string }> }>,
    sourceNodeId: string
): { nodeId: string; portId: string; portType: string; distance: number } | null => {
    let closestPort: { nodeId: string; portId: string; portType: string; distance: number } | null = null;

    for (const node of nodes) {
        // Skip source node
        if (node.id === sourceNodeId) continue;

        const def = blockRegistry[node.type];
        if (!def) continue;

        // Calculate input port positions (left side of node)
        const portX = node.position.x + TOUCH_PORT_LAYOUT.INPUT_X_OFFSET;
        for (let index = 0; index < def.inputs.length; index++) {
            const input = def.inputs[index];
            const portY =
                node.position.y +
                TOUCH_PORT_LAYOUT.FIRST_PORT_Y +
                index * TOUCH_PORT_LAYOUT.PORT_SPACING +
                TOUCH_PORT_LAYOUT.PORT_CENTER_OFFSET;
            const distance = Math.hypot(worldPos.x - portX, worldPos.y - portY);

            if (distance < TOUCH_PORT_HIT_THRESHOLD && (!closestPort || distance < closestPort.distance)) {
                closestPort = {
                    nodeId: node.id,
                    portId: input.id,
                    portType: input.type ?? 'any',
                    distance,
                };
            }
        }
    }

    return closestPort;
};

// EmptyState is now provided by EmptyStateGuide component

export const WorkflowCanvas = forwardRef<WorkflowCanvasRef, WorkflowCanvasProps>(
    (
        {
            role: roleProp,
            initialData,
            flowId,
            connectionId,
            onNodeSelect,
            onChange,
            onBeforeRun,
            onOpenLibrary,
            onConnectionError,
            onShowNotification,
            onAiKeyRequired,
            engine: engineProp,
        },
        ref
    ) => {
        const { t } = useTranslation(['flows', 'nodes', 'blocks']);
        const blockRegistry = useBlockRegistry();

        const role: FlowRole = roleProp ?? 'owner';
        const permissions = useMemo(() => getPermissions(role), [role]);
        const updatedPortIds = useUpdatedPortIds();
        const collapsedNodeIds = useCollapsedNodeIds();
        const toggleNodeCollapsed = useCanvasStore(state => state.toggleNodeCollapsed);

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

        // The engine owns the graph; the store is where the rest of the tree reads it from
        // (see useEngineMirror). Reads below come from the store, writes go to the engine.
        const fallbackEngine = useMemo(
            () => createFlowEngine({ getBlockRegistry: () => useFlowsStore.getState().blockRegistry }),
            []
        );
        const engine = engineProp ?? fallbackEngine;

        const nodes = useCanvasNodes();
        const connections = useCanvasConnections();
        const setNodes = useCanvasStore(state => state.setNodes);

        const [resizingNode, setResizingNode] = useState<{ nodeId: string; width: number } | null>(null);

        const executeNodeRef = useRef<(nodeId: string) => Promise<void> | undefined>(undefined);

        const nodesRef = useRef(nodes);
        const connectionsRef = useRef(connections);
        nodesRef.current = nodes;
        connectionsRef.current = connections;

        const canvasRef = useRef<HTMLDivElement>(null);

        // Viewport lives in a ref to avoid re-rendering the entire node tree on every wheel tick.
        // DOM elements (transform container, grid) are updated directly; displayViewport is
        // debounced so ZoomControls/Minimap only re-render after interaction settles.
        const viewportRef = useRef({ x: 0, y: 0, zoom: 1 });
        const transformRef = useRef<HTMLDivElement>(null);
        const gridRef = useRef<HTMLDivElement>(null);
        const [displayViewport, setDisplayViewport] = useState({ x: 0, y: 0, zoom: 1 });
        const displayTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
        const viewportSaveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
        const flowIdRef = useRef(flowId);
        flowIdRef.current = flowId;

        useEffect(() => {
            return () => {
                clearTimeout(displayTimerRef.current);
                clearTimeout(viewportSaveTimerRef.current);
            };
        }, []);

        const updateViewport = useCallback((vp: { x: number; y: number; zoom: number }) => {
            viewportRef.current = vp;
            if (transformRef.current) {
                transformRef.current.style.transform = `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`;
            }
            if (gridRef.current) {
                const size = GRID_SIZE * vp.zoom;
                gridRef.current.style.backgroundSize = `${size}px ${size}px`;
                gridRef.current.style.backgroundPosition = `${vp.x}px ${vp.y}px`;
            }
            clearTimeout(displayTimerRef.current);
            displayTimerRef.current = setTimeout(() => {
                setDisplayViewport(vp);
            }, 150);
            clearTimeout(viewportSaveTimerRef.current);
            viewportSaveTimerRef.current = setTimeout(() => {
                if (flowIdRef.current) {
                    flowStorage.saveViewport(flowIdRef.current, vp);
                }
            }, 500);
        }, []);

        const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
        const [isPanning, setIsPanning] = useState(false);
        const lastMousePosRef = useRef({ x: 0, y: 0 });

        // Node drag state - declared before useTouchCanvas so it can check isNodeDragging
        const [dragState, setDragState] = useState<{
            nodeId: string;
            startX: number;
            startY: number;
            /** Initial positions of all dragged nodes (for multi-select) */
            initialPositions: Map<string, { x: number; y: number }>;
        } | null>(null);

        // Ref for tracking touch drag position
        const lastTouchPosRef = useRef<{ x: number; y: number } | null>(null);

        // Project the engine's graph into the store the rest of the tree reads from. Paused
        // mid-drag and mid-resize, where the store deliberately runs ahead with a preview
        // the engine has not been told about yet.
        useEngineMirror(engine, { paused: dragState !== null || resizingNode !== null });

        // Touch gesture handling for mobile
        const {
            handleTouchStart: handleCanvasTouchStart,
            handleTouchMove: handleCanvasTouchMove,
            handleTouchEnd: handleCanvasTouchEnd,
        } = useTouchCanvas({
            viewportRef,
            updateViewport,
            minZoom: MIN_ZOOM,
            maxZoom: MAX_ZOOM,
            canvasRef,
            isNodeDragging: dragState !== null,
            onPanStart: () => setIsPanning(true),
            onPanEnd: () => setIsPanning(false),
        });

        const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
        const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
        const [hoveredConnectionId, setHoveredConnectionId] = useState<string | null>(null);

        // For single-node operations (detail panel, etc.), use the first selected node
        const selectedNodeId = selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] : null;

        const [tooltip, setTooltip] = useState<{ x: number; y: number; content: unknown; type: string } | null>(null);

        const [modalFlowId, setModalFlowId] = useState<string | null>(null);
        const [modalFlowData, setModalFlowData] = useState<WorkflowState | null>(null);

        const [connectionDraft, setConnectionDraft] = useState<{
            sourceNodeId: string;
            sourcePortId: string;
            sourceType: string;
            mouseX: number;
            mouseY: number;
            clickMode?: boolean;
        } | null>(null);

        const [contextMenu, setContextMenu] = useState<{
            screenX: number;
            screenY: number;
            worldX: number;
            worldY: number;
            // Set when the menu came from a link dropped on empty canvas: the block list is
            // filtered to what this port can feed, and picking one wires it up on the spot.
            fromDraft?: { sourceNodeId: string; sourcePortId: string; sourceType: string };
            // "Show all blocks" widens the list only. The draft stays, so a block picked
            // afterwards is still wired to the port the user dragged from.
            filterCleared?: boolean;
        } | null>(null);

        // Shift-drag selection box, in world coordinates so it stays put while zooming.
        // Shift is also what adds a node to the selection by click, so the box adds too.
        const [marquee, setMarquee] = useState<{
            startX: number;
            startY: number;
            currentX: number;
            currentY: number;
        } | null>(null);

        // Where the pointer last was over the canvas, in world coordinates. Null while it
        // is elsewhere, which is what tells paste to fall back instead of guessing.
        const lastCanvasPointRef = useRef<{ x: number; y: number } | null>(null);

        const portMouseDownPosRef = useRef<{ x: number; y: number } | null>(null);

        // Ref to track latest connectionDraft for touch events (avoids stale closure)
        const connectionDraftRef = useRef(connectionDraft);
        connectionDraftRef.current = connectionDraft;

        // Measure canvas container size for minimap
        useEffect(() => {
            const el = canvasRef.current;
            if (!el) return;
            const observer = new ResizeObserver(([entry]) => {
                setCanvasSize({ width: entry.contentRect.width, height: entry.contentRect.height });
            });
            observer.observe(el);
            return () => observer.disconnect();
        }, []);

        // Auto-save and the draft hang off this. Only committed edits count: a run rewrites
        // node status continuously and none of that is work anyone needs saved, which the
        // store-watching version of this could not tell apart.
        const onChangeRef = useRef(onChange);
        onChangeRef.current = onChange;
        useEffect(() => {
            if (!permissions.canSave) return;
            return engine.subscribe(event => {
                if (event.type === 'graph:changed') onChangeRef.current?.();
            });
        }, [engine, permissions.canSave]);

        /**
         * One edit, one undo step.
         *
         * The permission check stays here rather than moving into the engine: the engine
         * has no idea who is driving it, and every UI path into it already knows.
         */
        const commit = useCallback(
            (label: string, edit: Parameters<FlowEngine['transact']>[1]) => {
                if (!permissions.canModifyCanvas) return;
                engine.transact(label, edit);
            },
            [engine, permissions.canModifyCanvas]
        );

        const undo = useCallback(() => {
            if (!permissions.canModifyCanvas) return;
            engine.undo();
        }, [engine, permissions.canModifyCanvas]);

        const redo = useCallback(() => {
            if (!permissions.canModifyCanvas) return;
            engine.redo();
        }, [engine, permissions.canModifyCanvas]);

        useEffect(() => {
            if (initialData) {
                // loadGraph fills in the config and position the wire leaves off — a
                // position-less node crashes desktop render at node.position.x (see
                // NodeBlock/Minimap) — drops legacy duplicate edges, and clears history.
                const source = initialData as WorkflowStateWithLegacyEdges;
                engine.loadGraph({ nodes: source.nodes ?? [], edges: source.edges ?? source.connections ?? [] });
            }
        }, [initialData, blockRegistry, engine]);

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

        /**
         * Select a whole set at once (marquee, select-all). The detail panel follows a
         * single selection only, so it is told about the node just when there is one.
         */
        const selectNodeIds = useCallback(
            (ids: string[]) => {
                setSelectedNodeIds(new Set(ids));
                setSelectedConnectionId(null);
                onNodeSelect?.(ids.length === 1 ? ids[0] : null);
            },
            [onNodeSelect, setSelectedConnectionId]
        );

        const screenToWorld = useCallback((clientX: number, clientY: number) => {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return { x: 0, y: 0 };
            const vp = viewportRef.current;
            return {
                x: (clientX - rect.left - vp.x) / vp.zoom,
                y: (clientY - rect.top - vp.y) / vp.zoom,
            };
        }, []);

        /** A node's on-canvas box, measured the same way the canvas draws it. */
        const nodeBounds = useCallback(
            (node: GraphNode) => ({
                width: getNodeWidth(node),
                height: estimateNodeHeight(node, blockRegistry[node.type]),
            }),
            [blockRegistry]
        );

        // eslint-disable-next-line @typescript-eslint/no-empty-function -- initialized before useImperativeHandle sets the real function
        const addNodeRef = useRef<WorkflowCanvasRef['addNode']>(() => {});

        useImperativeHandle(ref, () => {
            const addNode = (type: string, position?: { x: number; y: number }, source?: LinkSource) => {
                if (!permissions.canModifyCanvas) return;

                const newDef = blockRegistry[type];
                if (!newDef) return;

                let sourceNode: GraphNode | undefined;
                let sourcePortId: string | undefined;
                let targetPortId: string | undefined;

                // A link dropped on empty canvas already says which port feeds the new node,
                // so there is nothing to infer — the guesswork below is for the other paths.
                if (source) {
                    sourceNode = nodes.find(n => n.id === source.nodeId);
                    const input = newDef.inputs.find(i => arePortTypesCompatible(source.portType, i.type));
                    if (sourceNode && input) {
                        sourcePortId = source.portId;
                        targetPortId = input.id;
                    }
                }

                // Auto-connect only when intent is clear:
                // - 0-1 nodes: always auto-connect (obvious target)
                // - 2+ nodes: only if a node is selected (explicit intent)
                const shouldAutoConnect = !source && (nodes.length <= 1 || !!selectedNodeId);

                if (shouldAutoConnect && newDef.inputs.length > 0) {
                    const firstInput = newDef.inputs[0];
                    targetPortId = firstInput.id;

                    const findCompatibleOutput = (n: GraphNode) => {
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

                if (position) {
                    startX = position.x;
                    startY = position.y;
                } else if (sourceNode) {
                    startX = sourceNode.position.x + 300;
                    startY = sourceNode.position.y;
                } else {
                    const rect = canvasRef.current?.getBoundingClientRect();
                    const vp = viewportRef.current;
                    const centerX = rect ? (rect.width / 2 - vp.x) / vp.zoom : 100;
                    const centerY = rect ? (rect.height / 2 - vp.y) / vp.zoom : 100;
                    startX = centerX - 100 + (Math.random() * 40 - 20);
                    startY = centerY - 50 + (Math.random() * 40 - 20);
                }

                const snappedX = Math.round(startX / GRID_SIZE) * GRID_SIZE;
                const snappedY = Math.round(startY / GRID_SIZE) * GRID_SIZE;

                const feedsNewNode = !!(sourceNode && sourcePortId && targetPortId);

                let targetNode: GraphNode | undefined;
                let targetInputPortId: string | undefined;
                let sourceOutputPortId: string | undefined;

                if (shouldAutoConnect && !feedsNewNode && newDef.outputs.length > 0) {
                    const firstOutput = newDef.outputs[0];

                    for (const existingNode of nodes) {
                        const existingDef = blockRegistry[existingNode.type];
                        if (!existingDef || existingDef.inputs.length === 0) continue;

                        const compatibleInput = existingDef.inputs.find(inp => {
                            const isConnected = connections.some(
                                c => c.targetNodeId === existingNode.id && c.targetPortId === inp.id
                            );
                            if (isConnected) return false;
                            return inp.type === firstOutput.type || inp.type === 'any' || firstOutput.type === 'any';
                        });

                        if (compatibleInput) {
                            targetNode = existingNode;
                            targetInputPortId = compatibleInput.id;
                            sourceOutputPortId = firstOutput.id;
                            break;
                        }
                    }
                }

                // The node and the edge that comes with it are one edit, so one undo
                // removes both rather than leaving an edge pointing at nothing.
                let nodeId = '';
                commit('node:add', ops => {
                    nodeId = ops.addNode({
                        type,
                        position: { x: snappedX, y: snappedY },
                        config: { ...blockRegistry[type].defaultConfig },
                    });

                    if (sourceNode && sourcePortId && targetPortId) {
                        ops.connect({
                            sourceNodeId: sourceNode.id,
                            sourcePortId,
                            targetNodeId: nodeId,
                            targetPortId,
                        });
                    } else if (targetNode && targetInputPortId && sourceOutputPortId) {
                        ops.connect({
                            sourceNodeId: nodeId,
                            sourcePortId: sourceOutputPortId,
                            targetNodeId: targetNode.id,
                            targetPortId: targetInputPortId,
                        });
                    }
                });
                if (!nodeId) return;

                // Whatever the upstream node already produced flows straight in. That is
                // run output, not an edit, so it lands after the commit — inside it, every
                // node added downstream of a finished node would read as unsaved work.
                if (sourceNode && sourcePortId && targetPortId) {
                    const packet = sourceNode.outputData?.[sourcePortId];
                    if (packet) engine.applyRuntime(nodeId, { inputData: { [targetPortId]: packet } });
                }

                handleSelectionChange(nodeId);
                setSelectedConnectionId(null);
            };

            addNodeRef.current = addNode;

            return {
                addNode,
                // Straight from the engine, not from the render this handle closed over.
                // `captureBaseline(getWorkflow())` runs immediately after `loadWorkflow`,
                // before React has re-rendered with the loaded graph — reading the closure
                // there hands back the previous flow, and a baseline taken from the wrong
                // graph makes every flow read dirty from the moment it opens.
                getWorkflow: () => engine.getGraph(),
                loadWorkflow: async (state: WorkflowStateWithPorts) => {
                    const ports = state.ports ?? [];

                    // Rows the server left undefined are fetched below; only what it
                    // actually answered goes in now.
                    // loadGraph replaces the document and clears history: undoing into the
                    // flow that was open before this one would put a different flow on screen.
                    engine.loadGraph(state, { ports: ports.filter(p => p.data !== undefined) });
                    const loadedConnections = engine.getGraph().edges;
                    handleSelectionChange(null);
                    setSelectedConnectionId(null);

                    // Restore saved viewport for this flow
                    if (flowIdRef.current) {
                        const savedVp = flowStorage.getViewport(flowIdRef.current);
                        if (savedVp) {
                            updateViewport(savedVp);
                        }
                    }

                    // null = server confirmed empty; undefined = server omitted, fetch now
                    const undefinedDataPorts = ports.filter(p => p.data === undefined && p.portId);

                    if (undefinedDataPorts.length > 0) {
                        undefinedDataPorts.forEach(p => {
                            const direction = p.direction ?? (p.portId === 'out' ? 'out' : 'in');
                            getPortData(p.id, direction)
                                .then(portData => {
                                    const { portId } = p;
                                    if (!portData.data || !portId) return;

                                    // Port data is what a previous run produced, so it goes
                                    // in as runtime: no checkpoint, and the flow does not
                                    // read as edited just because a load finished arriving.
                                    const owner = engine.getGraph().nodes.find(n => n.id === p.nodeId);
                                    if (!owner) return;
                                    engine.applyRuntime(
                                        p.nodeId,
                                        portId === 'out'
                                            ? {
                                                  outputData: {
                                                      ...owner.outputData,
                                                      [portId]: toDataPacket(portData.data),
                                                  },
                                              }
                                            : {
                                                  inputData: {
                                                      ...owner.inputData,
                                                      [portId]: toDataPacket(portData.data),
                                                  },
                                              }
                                    );

                                    // Re-propagate after new data, touching only what moved.
                                    const before = engine.getGraph().nodes;
                                    propagateAlongEdges(before, loadedConnections).forEach((node, i) => {
                                        if (node !== before[i] && node.id) {
                                            engine.applyRuntime(node.id, { inputData: node.inputData });
                                        }
                                    });
                                })
                                .catch(() => {
                                    console.warn('[WorkflowCanvas] Failed to fetch port:', p.id);
                                });
                        });
                    }
                },
                clearWorkflow: () => {
                    // Emptying the open flow is an edit, and an undoable one — unlike
                    // starting a new flow, which is a different document entirely.
                    commit('workflow:clear', ops => ops.removeNodes(engine.getGraph().nodes.map(n => n.id ?? '')));
                    handleSelectionChange(null);
                },
                newWorkflow: () => {
                    if (!permissions.canCreate) return;
                    engine.reset();
                    updateViewport({ x: 0, y: 0, zoom: 1 });
                    handleSelectionChange(null);
                },
                undo,
                redo,
                selectNode: (nodeId: string | null) => {
                    handleSelectionChange(nodeId);
                    if (nodeId) setSelectedConnectionId(null);
                },
                selectAll: () => selectNodeIds(nodes.map(n => n.id)),
                autoLayout: () => {
                    if (!permissions.canModifyCanvas) return;
                    if (nodes.length === 0) return;

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

                    const levelGroups: Record<number, GraphNode[]> = {};
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

                    commit('layout:auto', ops =>
                        positionedNodes.forEach(node => {
                            if (node.id) ops.updateNode(node.id, { position: node.position });
                        })
                    );
                    updateViewport({ x: 20, y: 20, zoom: 1 });
                },
                executeNode: async (nodeId: string) => {
                    if (executeNodeRef.current) {
                        await executeNodeRef.current(nodeId);
                    }
                },
                updateNodeFromServer: (
                    nodeId: string,
                    serverData: Partial<NodeData>,
                    options?: { force?: boolean }
                ) => {
                    const n = engine.getGraph().nodes.find(node => node.id === nodeId);
                    if (n) {
                        {
                            // What the server sends and what the graph holds disagree about
                            // shape — see `mergeNodeView` in @flows/engine for which field
                            // replaces and which merges, and why they differ.
                            const {
                                config: transformedConfig,
                                inputData: transformedInputData,
                                outputData: transformedOutputData,
                            } = mergeNodeView(n, serverData);

                            // State priority: only update if server state is more "final"
                            // EXCEPTION: If RUNNING with progress AND not already terminal, force update
                            // Use getEffectiveState for backward compatibility (state preferred, status fallback)
                            const serverState = getEffectiveState(serverData.state, serverData.status);
                            const currentState = getEffectiveState(n.state, n.status);
                            const isTerminalCurrent = currentState === 'COMPLETED' || currentState === 'ERROR';
                            const isActiveExecution =
                                serverState === 'RUNNING' &&
                                serverData.executionStats?.progress !== undefined &&
                                !isTerminalCurrent;
                            const finalState =
                                options?.force || isActiveExecution || shouldUpdateState(currentState, serverState)
                                    ? serverState
                                    : currentState;

                            engine.applyRuntime(nodeId, {
                                config: transformedConfig,
                                inputData: transformedInputData,
                                outputData: transformedOutputData,
                                state: finalState ?? n.state,
                                status: finalState ?? n.status, // Deprecated: kept for backward compatibility
                                errorMessage: serverData.error ?? serverData.errorMessage,
                                // Merge executionStats to preserve existing values (startTime, duration)
                                // when only progress is being updated.
                                // Auto-calculate duration for terminal states when startTime exists
                                // but duration wasn't provided (e.g., COMPLETED via WebSocket)
                                executionStats: (() => {
                                    if (!serverData.executionStats) return n.executionStats;
                                    const merged = { ...n.executionStats, ...serverData.executionStats };
                                    const isTerminal = finalState === 'COMPLETED' || finalState === 'ERROR';
                                    if (isTerminal && merged.startTime && !serverData.executionStats.duration) {
                                        merged.duration = Date.now() - merged.startTime;
                                    }
                                    return merged;
                                })(),
                                position: serverData.position ?? n.position,
                            } as Partial<NodeData>);
                        }
                    }

                    // Note: Output propagation to downstream nodes is handled by the server
                    // via propagateDownstreamV2. Socket notifications will update downstream
                    // nodes' inputData separately, so we don't need to propagate here.
                },
                exportAsImage: async (fileName: string) => {
                    const element = canvasRef.current;
                    if (!element) return;
                    await exportCanvasAsPng(element, fileName);
                },
                captureAsDataUrl: async () => {
                    const element = canvasRef.current;
                    if (!element) return null;
                    return captureCanvasAsDataUrl(element);
                },
                captureForThumbnail: async () => {
                    const element = canvasRef.current;
                    if (!element) return null;
                    return captureCanvasForThumbnail(element);
                },
                collapseAll: () => {
                    const nodeIds = nodesRef.current.map(n => n.id);
                    useCanvasStore.getState().setAllNodesCollapsed(true, nodeIds);
                },
                expandAll: () => {
                    useCanvasStore.getState().setAllNodesCollapsed(false);
                },
                runAll: async () => {
                    // Read the id now rather than trusting the one this handle closed
                    // over: a flow with no id yet gets one from the save that runs
                    // immediately before this, and that store write has not re-rendered
                    // us by the time it returns. The stale id here is null, so the run
                    // would silently do nothing on exactly the new-flow path.
                    const runFlowId = useFlowsStore.getState().currentFlowId;
                    if (!permissions.canRun || !runFlowId) return;

                    const inputNodeIdSet = new Set(
                        nodesRef.current
                            .filter(n => {
                                const def = blockRegistry[n.type];
                                return def?.stereo === 'input' && n.autoExecutionEnabled !== false;
                            })
                            .map(n => n.id)
                    );

                    if (inputNodeIdSet.size === 0) return;

                    const setInputNodeStates = (state: NodeState) => {
                        // status: deprecated, kept for backward compatibility
                        inputNodeIdSet.forEach(id =>
                            engine.applyRuntime(id, { state, status: state } as Partial<NodeData>)
                        );
                    };

                    setInputNodeStates('RUNNING' as NodeState);

                    try {
                        await runFlow(runFlowId, [...inputNodeIdSet], { connection: connectionId });
                    } catch (error) {
                        setInputNodeStates('IDLE' as NodeState);
                        throw error;
                    }
                },
            };
        }, [
            nodes,
            connections,
            permissions,
            flowId,
            undo,
            redo,
            engine,
            commit,
            selectedNodeId,
            handleSelectionChange,
            blockRegistry,
        ]);

        const executeNode = useCallback(
            async (nodeId: string, options?: { propagate?: boolean }) => {
                if (!permissions.canRun) return;

                const startTime = Date.now();

                engine.applyRuntime(nodeId, {
                    state: 'RUNNING' as NodeState,
                    status: 'RUNNING', // Deprecated: kept for backward compatibility
                    errorMessage: undefined,
                    executionStats: { startTime, progress: 0, duration: 0 },
                } as Partial<NodeData>);

                const currentNode = nodesRef.current.find(n => n.id === nodeId);
                if (!currentNode) return;

                const inputs = currentNode.inputData;
                const nodeDef = blockRegistry[currentNode.type];

                if (!nodeDef) {
                    engine.applyRuntime(nodeId, {
                        state: 'ERROR' as NodeState,
                        status: 'ERROR', // Deprecated: kept for backward compatibility
                        errorMessage: t('nodes:errors.unknownBlockType'),
                    } as Partial<NodeData>);
                    return;
                }

                const incomingConnections = connectionsRef.current
                    .filter(c => c.targetNodeId === nodeId)
                    // Normalize: hydrateInputsFromUpstream re-filters by exact targetNodeId
                    .map(c => (c.targetNodeId === nodeId ? c : { ...c, targetNodeId: nodeId }));
                const hydratedInputs = hydrateInputsFromUpstream(
                    nodeId,
                    incomingConnections,
                    nodesRef.current,
                    inputs ?? {}
                );

                const missingInputs = nodeDef.inputs.filter(inputPort => {
                    if (hydratedInputs[inputPort.id]) return false;
                    const hasConnection = incomingConnections.some(c => c.targetPortId === inputPort.id);
                    return hasConnection || inputPort.required === true;
                });

                if (missingInputs.length > 0) {
                    const missingLabels = missingInputs.map(p => translateField(t, p, 'label') || p.id).join(', ');
                    engine.applyRuntime(nodeId, {
                        state: 'ERROR' as NodeState,
                        status: 'ERROR', // Deprecated: kept for backward compatibility
                        errorMessage: t('nodes:errors.missingInputs', { inputs: missingLabels }),
                        executionStats: { startTime, duration: 0, progress: 0 },
                    } as Partial<NodeData>);
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

                // Config edits stay local until a save, so the server's copy may be stale —
                // always run against what the canvas is showing.
                const runBody = { config: (currentNode.config || {}) as Record<string, string> };

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
                            const running = engine.getGraph().nodes.find(n => n.id === nodeId);
                            engine.applyRuntime(nodeId, {
                                executionStats: { ...(running?.executionStats || {}), progress },
                            });
                        };

                        // Execute frontend function with hydrated inputs
                        const outputs = await executeFunc(hydratedInputs, currentNode.config || {}, onProgress);
                        const duration = Date.now() - startTime;

                        // Update local state with outputs and propagate to downstream nodes
                        engine.applyRuntime(nodeId, {
                            state: 'COMPLETED' as NodeState,
                            status: 'COMPLETED' as const, // Deprecated: kept for backward compatibility
                            outputData: outputs,
                            executionStats: { startTime, duration, progress: 100 },
                        } as Partial<NodeData>);

                        // Then, propagate outputs to downstream nodes' inputData
                        engine.getGraph().nodes.forEach(n => {
                            // Find connections where this node receives data from the executed node
                            const incomingFromExecuted = connections.filter(
                                c => c.targetNodeId === n.id && c.sourceNodeId === nodeId
                            );
                            if (incomingFromExecuted.length === 0 || !n.id) return;

                            // Build propagated inputData
                            const propagatedInputData = { ...n.inputData };
                            incomingFromExecuted.forEach(conn => {
                                const packet = outputs[conn.sourcePortId];
                                if (packet) {
                                    propagatedInputData[conn.targetPortId] = packet;
                                }
                            });

                            engine.applyRuntime(n.id, { inputData: propagatedInputData });
                        });

                        // Send outputs to server and trigger propagation
                        if (flowId) {
                            await runNode(nodeId, runBody, {
                                force: true,
                                propagate: options?.propagate,
                                connection: connectionId,
                            });
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

                        if (permissions.canModifyCanvas && flowId && Object.keys(hydratedInputs).length > 0) {
                            await Promise.all(
                                Object.entries(hydratedInputs).map(([portName, packet]) =>
                                    upsertPortNode(flowId, {
                                        stereo: 'port',
                                        parentId: nodeId,
                                        direction: 'in',
                                        name: portName,
                                        dataType: packet.type,
                                        data$: toPortVariantData(packet),
                                    })
                                )
                            );
                        }

                        // Step 3: Run the node
                        const result = await runNode(nodeId, runBody, {
                            propagate: options?.propagate,
                            connection: connectionId,
                        });

                        // Use state from result if available, fallback to status for backward compatibility
                        const resultState = getEffectiveState(result?.state, result?.status);
                        const isTerminalState = resultState === 'COMPLETED' || resultState === 'ERROR';

                        if (resultState) {
                            const duration = Date.now() - startTime;

                            const n = engine.getGraph().nodes.find(node => node.id === nodeId);
                            if (n) {
                                // Compare priorities: only update if API state >= current state
                                const currentState = getEffectiveState(n.state, n.status);
                                if (shouldUpdateState(currentState, resultState)) {
                                    engine.applyRuntime(nodeId, {
                                        state: resultState as NodeState,
                                        status: resultState, // Deprecated: kept for backward compatibility
                                        errorMessage:
                                            resultState === 'ERROR' ? (result.error ?? result.errorMessage) : undefined,
                                        // Terminal: finalize with progress 100
                                        // Non-terminal (RUNNING): keep existing stats, WebSocket delivers progress
                                        executionStats: isTerminalState
                                            ? { startTime, duration, progress: 100 }
                                            : n.executionStats,
                                    } as Partial<NodeData>);
                                } else if (isTerminalState) {
                                    // API state is lower priority (e.g., WebSocket already delivered COMPLETED)
                                    // Only update executionStats for terminal states
                                    engine.applyRuntime(nodeId, {
                                        executionStats: { startTime, duration, progress: 100 },
                                    });
                                }
                            }
                        }

                        // Fallback: if API returned non-terminal state, poll after timeout
                        // in case WebSocket doesn't deliver the final state
                        if (!isTerminalState) {
                            setTimeout(async () => {
                                const current = nodesRef.current.find(n => n.id === nodeId);
                                const currentState = getEffectiveState(current?.state, current?.status);
                                if (currentState !== 'RUNNING') return; // Already resolved

                                try {
                                    const nodeData = await getNode(nodeId);
                                    const serverState = getEffectiveState(nodeData.state, nodeData.status);
                                    if (serverState === 'COMPLETED' || serverState === 'ERROR') {
                                        const duration = Date.now() - startTime;
                                        engine.applyRuntime(nodeId, {
                                            state: serverState as NodeState,
                                            status: serverState,
                                            executionStats: { startTime, duration, progress: 100 },
                                            errorMessage:
                                                serverState === 'ERROR'
                                                    ? (nodeData.error ?? nodeData.errorMessage)
                                                    : undefined,
                                        } as Partial<NodeData>);
                                    }
                                } catch {
                                    // API failed, node stays in current state
                                }
                            }, EXECUTION_FALLBACK_TIMEOUT_MS);
                        }
                    }
                } catch (e: unknown) {
                    console.error('[executeNode] Execution failed:', e);
                    const duration = Date.now() - startTime;
                    const errorMessage = e instanceof Error ? e.message : t('flows:detailPanel.unknownError');

                    engine.applyRuntime(nodeId, {
                        state: 'ERROR' as NodeState,
                        status: 'ERROR', // Deprecated: kept for backward compatibility
                        errorMessage,
                        executionStats: { startTime, duration, progress: 0 },
                    } as Partial<NodeData>);
                }
            },
            [permissions, blockRegistry, t, flowId, connectionId, connections, engine]
        );

        executeNodeRef.current = executeNode;

        // The run button's entry point. `executeNode` itself stays ungated because the
        // socket path shares it, and a run already under way must not stop to ask.
        const triggerNode = useCallback(
            async (nodeId: string, options?: { propagate?: boolean }) => {
                if (onBeforeRun && !(await onBeforeRun())) return;
                await executeNode(nodeId, options);
            },
            [executeNode, onBeforeRun]
        );

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
            // Owner + Editor may edit any node config; Viewer/Anonymous are blocked. This is
            // its own grant, so it does not go through `commit`, which asks about the canvas.
            if (!permissions.canEditConfig) return;

            // Handle node-level properties separately from config
            if (NODE_LEVEL_PROPERTIES.includes(key as NodeLevelProperty)) {
                const numericValue = typeof value === 'number' && value > 0 ? value : undefined;
                engine.transact('node:config', ops => ops.updateNode(nodeId, { [key]: numericValue }));
                return;
            }

            const current = engine.getGraph().nodes.find(n => n.id === nodeId);
            engine.transact('node:config', ops =>
                // `config` is typed Record<string, string> but holds whatever a control
                // produces — booleans from switches, numbers from steppers. Coercing here
                // would change what is stored and what every reader gets back, so the
                // mismatch is named rather than papered over.
                ops.updateNode(nodeId, {
                    config: { ...(current?.config || {}), [key]: value } as NodeData['config'],
                })
            );
        };

        const handleLabelChange = (nodeId: string, label: string) => {
            commit('node:label', ops => ops.updateNode(nodeId, { customLabel: label || undefined }));
        };

        const handleDescriptionChange = (nodeId: string, description: string) => {
            commit('node:description', ops => ops.updateNode(nodeId, { description: description || undefined }));
        };

        const handleToggleAuto = (nodeId: string) => {
            const current = engine.getGraph().nodes.find(n => n.id === nodeId);
            commit('node:auto', ops =>
                ops.updateNode(nodeId, { autoExecutionEnabled: !current?.autoExecutionEnabled })
            );
        };

        const handleNodeResize = (nodeId: string, width: number, height: number) => {
            const updates: Partial<{ width: number; height: number }> = {};
            if (width > 0) updates.width = width;
            if (height > 0) updates.height = height;
            commit('node:resize', ops => ops.updateNode(nodeId, updates));
        };

        const deleteNode = useCallback(
            (id: string) => {
                // Deleting is local: save sends the whole graph, and what it leaves out is
                // what the server drops. The incident edges go with the node.
                commit('node:delete', ops => ops.removeNodes([id]));
                handleSelectionChange(null);
            },
            [commit, handleSelectionChange]
        );

        const deleteConnection = useCallback(
            (id: string) => {
                commit('edge:delete', ops => ops.disconnect([id]));
                setSelectedConnectionId(null);
            },
            [commit]
        );

        const duplicateNode = useCallback(
            (nodeId: string) => {
                const node = nodes.find(n => n.id === nodeId);
                if (!node) return;

                // One transaction, so one undo takes the copy away again. Runtime state is
                // not carried over: a duplicate has never run, whatever the original did.
                let id = '';
                commit('node:duplicate', ops => {
                    id = ops.addNode({
                        type: node.type,
                        position: {
                            x: Math.round((node.position.x + 40) / GRID_SIZE) * GRID_SIZE,
                            y: Math.round((node.position.y + 40) / GRID_SIZE) * GRID_SIZE,
                        },
                        config: node.config,
                        customLabel: node.customLabel ? `${node.customLabel} (copy)` : undefined,
                    });
                    // The rest of what a save stores about a node.
                    ops.updateNode(id, {
                        blockId: node.blockId,
                        description: node.description,
                        width: node.width,
                        height: node.height,
                        autoExecutionEnabled: node.autoExecutionEnabled ?? true,
                    });
                });
                if (id) handleSelectionChange(id);
            },
            [commit, nodes, handleSelectionChange]
        );

        const handleWheel = (e: React.WheelEvent) => {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return;
            const vp = viewportRef.current;
            const delta = -e.deltaY * 0.001;
            const newZoom = Math.min(Math.max(vp.zoom + delta, MIN_ZOOM), MAX_ZOOM);

            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const worldX = (mouseX - vp.x) / vp.zoom;
            const worldY = (mouseY - vp.y) / vp.zoom;

            const newX = mouseX - worldX * newZoom;
            const newY = mouseY - worldY * newZoom;

            updateViewport({ x: newX, y: newY, zoom: newZoom });
        };

        const handleZoomIn = useCallback(() => {
            const vp = viewportRef.current;
            updateViewport({ ...vp, zoom: Math.min(vp.zoom * 1.2, MAX_ZOOM) });
        }, [updateViewport]);

        const handleZoomOut = useCallback(() => {
            const vp = viewportRef.current;
            updateViewport({ ...vp, zoom: Math.max(vp.zoom / 1.2, MIN_ZOOM) });
        }, [updateViewport]);

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

            updateViewport({ x: newX, y: newY, zoom: newZoom });
        }, [nodes, updateViewport]);

        const handleResetView = useCallback(() => {
            updateViewport({ x: 0, y: 0, zoom: 1 });
        }, [updateViewport]);

        const handleCanvasMouseDown = (e: React.MouseEvent) => {
            portMouseDownPosRef.current = null;

            if (connectionDraft?.clickMode) {
                setConnectionDraft(null);
                return;
            }

            // Shift-drag draws a selection box. Plain drag keeps panning, so the gesture
            // people already have in their hands does not change under them.
            if (e.button === 0 && e.shiftKey) {
                setContextMenu(null);
                const world = screenToWorld(e.clientX, e.clientY);
                setMarquee({ startX: world.x, startY: world.y, currentX: world.x, currentY: world.y });
                return;
            }

            if (e.button === 0 || e.button === 1) {
                setContextMenu(null);
                setIsPanning(true);
                lastMousePosRef.current = { x: e.clientX, y: e.clientY };
                handleSelectionChange(null);
                setSelectedConnectionId(null);
            }
        };

        const handleCloseContextMenu = useCallback(() => setContextMenu(null), []);

        const handleCanvasContextMenu = (e: React.MouseEvent) => {
            e.preventDefault();
            if (!permissions.canModifyCanvas) return;
            const worldPos = screenToWorld(e.clientX, e.clientY);
            setContextMenu({ screenX: e.clientX, screenY: e.clientY, worldX: worldPos.x, worldY: worldPos.y });
        };

        const handleDoubleClick = () => {
            handleSelectionChange(null);
            setSelectedConnectionId(null);
        };

        const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
            e.stopPropagation();
            setContextMenu(null);

            if (connectionDraft) {
                if (connectionDraft.clickMode) setConnectionDraft(null);
                return;
            }

            // Skip selection and drag for interactive elements (buttons, inputs, etc.)
            // This must be checked BEFORE selection logic to prevent node selection
            // when clicking delete button or other controls
            // Use closest() to also catch clicks on icons inside buttons (SVG, path, etc.)
            const target = e.target as HTMLElement;
            if (
                ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'LABEL'].includes(target.tagName) ||
                target.isContentEditable ||
                target.closest('button')
            ) {
                return;
            }

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

            // Selection is allowed for all roles above; dragging requires permission
            if (!permissions.canDragNodes) return;

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

        // Touch version of node drag start
        // Note: Selection happens on touch END (tap), not start, to distinguish tap vs drag
        // Runs for all roles so tap-to-select works without drag permission;
        // actual movement is gated by canDragNodes in handleNodeTouchMove
        const handleNodeTouchStart = (e: React.TouchEvent, nodeId: string) => {
            e.stopPropagation();

            // Don't start drag during port connection
            if (connectionDraft) return;

            setSelectedConnectionId(null);

            // Skip drag for interactive elements (buttons, inputs, etc.)
            // Use closest() to also catch touches on icons inside buttons (SVG, path, etc.)
            const target = e.target as HTMLElement;
            if (
                ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'LABEL'].includes(target.tagName) ||
                target.isContentEditable ||
                target.closest('button')
            ) {
                return;
            }

            const touch = e.touches[0];
            lastTouchPosRef.current = { x: touch.clientX, y: touch.clientY };

            const isAlreadySelected = selectedNodeIds.has(nodeId);

            // Determine which nodes will be dragged
            const nodesToDrag = isAlreadySelected ? new Set([...selectedNodeIds]) : new Set([nodeId]);

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
                startX: touch.clientX,
                startY: touch.clientY,
                initialPositions,
            });
        };

        // Touch move handler for node dragging
        const handleNodeTouchMove = useCallback(
            (e: React.TouchEvent) => {
                if (!dragState || !permissions.canDragNodes) return;

                e.preventDefault(); // Prevent scroll while dragging node
                const touch = e.touches[0];

                const screenDx = touch.clientX - dragState.startX;
                const screenDy = touch.clientY - dragState.startY;
                const dx = screenDx / viewportRef.current.zoom;
                const dy = screenDy / viewportRef.current.zoom;

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

                lastTouchPosRef.current = { x: touch.clientX, y: touch.clientY };
            },
            [dragState, permissions.canDragNodes]
        );

        /**
         * Turn a finished drag into one undoable move.
         *
         * Dragging moves the preview in the store only; the engine still holds the
         * positions from before the gesture started, which is exactly the checkpoint this
         * wants. Nothing is committed for a drag that ended where it began.
         */
        const commitDrag = useCallback(
            (initialPositions: Map<string, { x: number; y: number }>) => {
                const moved = [...initialPositions.entries()].flatMap(([id, from]) => {
                    const node = nodesRef.current.find(n => n.id === id);
                    if (!node || (node.position.x === from.x && node.position.y === from.y)) return [];
                    return [{ id, position: node.position }];
                });
                if (moved.length === 0) return;
                commit('node:move', ops => moved.forEach(({ id, position }) => ops.updateNode(id, { position })));
            },
            [commit]
        );

        // Touch end handler for node dragging
        const handleNodeTouchEnd = useCallback(() => {
            if (dragState) {
                // Check if this was a tap (no significant movement)
                const endX = lastTouchPosRef.current?.x ?? dragState.startX;
                const endY = lastTouchPosRef.current?.y ?? dragState.startY;
                const moveDistance = Math.hypot(endX - dragState.startX, endY - dragState.startY);
                const wasTap = moveDistance < TOUCH_GESTURE_THRESHOLD;

                if (wasTap) {
                    // It was a tap - select the node (opens DetailPanel)
                    handleSelectionChange(dragState.nodeId);
                } else {
                    commitDrag(dragState.initialPositions);
                }
            }

            setDragState(null);
            lastTouchPosRef.current = null;
        }, [dragState, commitDrag, handleSelectionChange]);

        const handleMouseMove = (e: React.MouseEvent) => {
            lastCanvasPointRef.current = screenToWorld(e.clientX, e.clientY);

            if (marquee) {
                const world = screenToWorld(e.clientX, e.clientY);
                setMarquee(prev => (prev ? { ...prev, currentX: world.x, currentY: world.y } : prev));
                return;
            }

            if (isPanning) {
                const dx = e.clientX - lastMousePosRef.current.x;
                const dy = e.clientY - lastMousePosRef.current.y;
                const vp = viewportRef.current;
                updateViewport({ ...vp, x: vp.x + dx, y: vp.y + dy });
                lastMousePosRef.current = { x: e.clientX, y: e.clientY };
                return;
            }

            if (dragState && permissions.canDragNodes) {
                const screenDx = e.clientX - dragState.startX;
                const screenDy = e.clientY - dragState.startY;
                const dx = screenDx / viewportRef.current.zoom;
                const dy = screenDy / viewportRef.current.zoom;

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

            if (connectionDraft && permissions.canModifyCanvas) {
                const worldPos = screenToWorld(e.clientX, e.clientY);
                setConnectionDraft(prev => (prev ? { ...prev, mouseX: worldPos.x, mouseY: worldPos.y } : null));
            }
        };

        const handleMouseUp = (e: React.MouseEvent) => {
            setIsPanning(false);

            if (marquee) {
                const covered = nodesInRect(
                    nodes,
                    {
                        x: marquee.startX,
                        y: marquee.startY,
                        width: marquee.currentX - marquee.startX,
                        height: marquee.currentY - marquee.startY,
                    },
                    nodeBounds
                );
                setMarquee(null);
                // A box that caught nothing leaves the selection alone — treating it as
                // "deselect everything" would punish a misaimed drag.
                if (covered.length > 0) selectNodeIds([...new Set([...selectedNodeIds, ...covered])]);
                return;
            }

            if (dragState) commitDrag(dragState.initialPositions);

            setDragState(null);

            if (connectionDraft?.clickMode) return;

            if (connectionDraft && portMouseDownPosRef.current) {
                const dx = e.clientX - portMouseDownPosRef.current.x;
                const dy = e.clientY - portMouseDownPosRef.current.y;

                if (Math.hypot(dx, dy) < CLICK_THRESHOLD) {
                    setConnectionDraft(prev => (prev ? { ...prev, clickMode: true } : null));
                    portMouseDownPosRef.current = null;
                    return;
                }
            }

            // Reaching here means the link was dragged past the click threshold and released
            // outside any port — a port release never gets this far, PortItem stops it. Offer
            // the blocks this port can feed instead of dropping the link on the floor.
            if (connectionDraft && permissions.canModifyCanvas) {
                const worldPos = screenToWorld(e.clientX, e.clientY);
                // Released over a node's body rather than empty canvas: place the new node
                // clear of it, or it would be born underneath the one it was dropped on.
                const covered = findNodeAtPoint(nodes, worldPos, nodeBounds);
                const insertAt = covered
                    ? { x: covered.position.x + nodeBounds(covered).width + NEW_NODE_GAP, y: covered.position.y }
                    : worldPos;
                setContextMenu({
                    screenX: e.clientX,
                    screenY: e.clientY,
                    worldX: insertAt.x,
                    worldY: insertAt.y,
                    fromDraft: {
                        sourceNodeId: connectionDraft.sourceNodeId,
                        sourcePortId: connectionDraft.sourcePortId,
                        sourceType: connectionDraft.sourceType,
                    },
                });
            }

            portMouseDownPosRef.current = null;
            setConnectionDraft(null);
        };

        const handlePortDoubleClick = async (
            nodeId: string,
            portId: string,
            type: 'input' | 'output',
            _portType: string
        ) => {
            // Double-click fires after mouseDown already started a connection draft — cancel it
            if (connectionDraft) setConnectionDraft(null);

            const fullPortId = `${nodeId}:${portId}`;
            const direction = type === 'output' ? 'out' : 'in';

            useCanvasStore.getState().setUpdatedPort(fullPortId);

            try {
                const portData = await getPortData(fullPortId, direction);
                if (portData?.data) {
                    // Port data is what a run produced, so it goes in as runtime.
                    const owner = engine.getGraph().nodes.find(n => n.id === nodeId);
                    engine.applyRuntime(
                        nodeId,
                        direction === 'out'
                            ? { outputData: { ...owner?.outputData, [portId]: toDataPacket(portData.data) } }
                            : { inputData: { ...owner?.inputData, [portId]: toDataPacket(portData.data) } }
                    );
                }
            } catch (err) {
                console.warn('[Canvas] Port data fetch failed:', fullPortId, err);
            } finally {
                setTimeout(() => useCanvasStore.getState().clearUpdatedPort(fullPortId), PORT_HIGHLIGHT_MS);
            }
        };

        const handlePortMouseDown = (
            nodeId: string,
            portId: string,
            type: 'input' | 'output',
            portType: string,
            e: React.MouseEvent
        ) => {
            if (!permissions.canModifyCanvas) return;

            if (connectionDraft?.clickMode && type === 'input') {
                handlePortMouseUp(nodeId, portId, type, portType);
                return;
            }

            setSelectedConnectionId(null);
            if (type === 'output') {
                portMouseDownPosRef.current = { x: e.clientX, y: e.clientY };
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

        // Touch version of port drag start for mobile
        const handlePortTouchStart = (
            nodeId: string,
            portId: string,
            type: 'input' | 'output',
            portType: string,
            e: React.TouchEvent
        ) => {
            if (!permissions.canModifyCanvas) return;
            e.stopPropagation();
            setSelectedConnectionId(null);
            if (type === 'output') {
                const touch = e.touches[0];
                const worldPos = screenToWorld(touch.clientX, touch.clientY);
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
            if (!permissions.canModifyCanvas) return;

            // Mouseup on the same output port that started the draft → enter click-connect mode
            if (
                connectionDraft &&
                !connectionDraft.clickMode &&
                type === 'output' &&
                targetNodeId === connectionDraft.sourceNodeId &&
                targetPortId === connectionDraft.sourcePortId &&
                portMouseDownPosRef.current
            ) {
                setConnectionDraft(prev => (prev ? { ...prev, clickMode: true } : null));
                portMouseDownPosRef.current = null;
                return;
            }

            if (connectionDraft && type === 'input') {
                const sourceNode = nodes.find(n => n.id === connectionDraft.sourceNodeId);
                const targetNode = nodes.find(n => n.id === targetNodeId);
                if (
                    sourceNode &&
                    targetNode &&
                    sourceNode.id !== targetNode.id &&
                    arePortTypesCompatible(connectionDraft.sourceType, targetType)
                ) {
                    // The engine refuses a cycle, a duplicate and a type mismatch itself; the
                    // canvas turns the refusal into something the user can see. Connecting a
                    // second source to an occupied input replaces what was there.
                    try {
                        commit('edge:connect', ops =>
                            ops.connect({
                                sourceNodeId: connectionDraft.sourceNodeId,
                                sourcePortId: connectionDraft.sourcePortId,
                                targetNodeId,
                                targetPortId,
                            })
                        );
                    } catch (error) {
                        onConnectionError?.((error as { code?: string }).code === 'CYCLE' ? 'cycle' : 'invalid_type');
                        setConnectionDraft(null);
                        return;
                    }

                    const packet = sourceNode.outputData?.[connectionDraft.sourcePortId];
                    if (packet) {
                        // Copy existing output data to the new connection's target input.
                        // Run output, so it lands outside the checkpoint the edge just took.
                        const target = engine.getGraph().nodes.find(n => n.id === targetNodeId);
                        engine.applyRuntime(targetNodeId, {
                            inputData: { ...target?.inputData, [targetPortId]: packet },
                        });
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

            const isNodeCollapsed = collapsedNodeIds.has(nodeId);
            const yOffset = isNodeCollapsed
                ? COLLAPSED_PORT_Y
                : PORT_LAYOUT.FIRST_PORT_Y + safeIndex * PORT_LAYOUT.PORT_SPACING;
            // Use dynamic node width for output port position
            // If node is being resized, use the resizing width for real-time edge updates
            const nodeWidth = resizingNode?.nodeId === nodeId ? resizingNode.width : getNodeWidth(node);
            const xOffset = type === 'input' ? PORT_LAYOUT.INPUT_X : nodeWidth + 3;
            return { x: node.position.x + xOffset, y: node.position.y + yOffset };
        };

        useEffect(() => {
            const handleKeyDown = (e: KeyboardEvent) => {
                const target = e.target as HTMLElement;
                const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
                if (isInput) return;

                // Escape only lets go of what is selected, so a viewer gets it too —
                // gating it behind edit permission left them with no way to close a panel.
                if (e.key === 'Escape') {
                    if (connectionDraft) {
                        setConnectionDraft(null);
                        return;
                    }
                    if (marquee) {
                        setMarquee(null);
                        return;
                    }
                    handleSelectionChange(null);
                    setSelectedConnectionId(null);
                    return;
                }

                if (!permissions.canModifyCanvas) return;

                const isCtrlOrCmd = e.ctrlKey || e.metaKey;

                if (isCtrlOrCmd && e.key.toLowerCase() === 'c') {
                    // The payload carries the edges running between the copied nodes, so a
                    // pasted copy of a wired-up selection arrives wired up. It goes to the
                    // store rather than a local ref so it survives the canvas unmounting.
                    if (selectedNodeIds.size > 0) {
                        useCanvasStore.getState().setClipboard(engine.copy([...selectedNodeIds]));
                    }
                }

                if (isCtrlOrCmd && e.key.toLowerCase() === 'v') {
                    // Read through getState: subscribing would put the clipboard in this
                    // effect's deps and re-register the listener on every copy.
                    const payload = useCanvasStore.getState().clipboard;
                    if (payload && payload.nodes.length > 0) {
                        // Land the copy under the pointer. Off-canvas (keyboard-only paste,
                        // or the pointer over a panel) falls back to a visible nudge.
                        const cursor = lastCanvasPointRef.current;
                        const offset = cursor
                            ? snapToGrid(pasteOffsetTo(payload.nodes, cursor))
                            : { x: GRID_SIZE * 2, y: GRID_SIZE * 2 };
                        const pasted = engine.paste(payload, offset);
                        selectNodeIds(pasted);
                    }
                }

                if (e.key === 'Delete' || e.key === 'Backspace') {
                    if (selectedNodeIds.size > 0) {
                        // Delete all selected nodes; their edges go with them.
                        commit('selection:delete', ops => ops.removeNodes([...selectedNodeIds]));
                        handleSelectionChange(null);
                    } else if (selectedConnectionId || hoveredConnectionId) {
                        const targetId = selectedConnectionId || hoveredConnectionId;
                        if (targetId) commit('edge:delete', ops => ops.disconnect([targetId]));
                        setSelectedConnectionId(null);
                        setHoveredConnectionId(null);
                        setTooltip(null);
                    }
                }
            };

            window.addEventListener('keydown', handleKeyDown);
            return () => window.removeEventListener('keydown', handleKeyDown);
        }, [
            engine,
            selectedNodeIds,
            selectedConnectionId,
            hoveredConnectionId,
            connectionDraft,
            marquee,
            permissions.canModifyCanvas,
            commit,
            handleSelectionChange,
            selectNodeIds,
        ]);

        // Pre-compute connected ports per node — avoids O(connections) per node per render
        const connectedPortsByNodeId = useMemo(() => {
            const map = new Map<string, string[]>();
            connections.forEach(c => {
                const src = map.get(c.sourceNodeId) ?? [];
                src.push(c.sourcePortId);
                map.set(c.sourceNodeId, src);

                const tgt = map.get(c.targetNodeId) ?? [];
                tgt.push(c.targetPortId);
                map.set(c.targetNodeId, tgt);
            });
            return map;
        }, [connections]);

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
                    className={`relative flex-1 bg-canvas overflow-hidden outline-none ${role === 'anonymous' ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={() => (lastCanvasPointRef.current = null)}
                    onMouseDown={handleCanvasMouseDown}
                    onContextMenu={handleCanvasContextMenu}
                    onTouchStart={handleCanvasTouchStart}
                    onTouchMove={e => {
                        if (dragState) {
                            handleNodeTouchMove(e);
                        } else {
                            handleCanvasTouchMove(e);
                        }
                        // Update connection draft position during touch drag
                        if (connectionDraft && permissions.canModifyCanvas && e.touches.length > 0) {
                            const touch = e.touches[0];
                            const worldPos = screenToWorld(touch.clientX, touch.clientY);
                            setConnectionDraft(prev =>
                                prev ? { ...prev, mouseX: worldPos.x, mouseY: worldPos.y } : null
                            );
                        }
                    }}
                    onTouchEnd={e => {
                        // Use ref to get latest connectionDraft (avoids stale closure issue)
                        const currentDraft = connectionDraftRef.current;

                        // Handle connection drop on touch end
                        if (currentDraft && e.changedTouches.length > 0) {
                            const touch = e.changedTouches[0];
                            const worldPos = screenToWorld(touch.clientX, touch.clientY);

                            const closestPort = findClosestInputPort(
                                worldPos,
                                nodes,
                                blockRegistry,
                                currentDraft.sourceNodeId
                            );

                            if (closestPort) {
                                handlePortMouseUp(
                                    closestPort.nodeId,
                                    closestPort.portId,
                                    'input',
                                    closestPort.portType
                                );
                            }

                            setConnectionDraft(null);
                            return;
                        }

                        if (dragState) {
                            handleNodeTouchEnd();
                        } else {
                            handleCanvasTouchEnd(e);
                        }
                    }}
                    tabIndex={0}
                >
                    {/* Background Grid - always visible with subtle opacity */}
                    <div
                        ref={gridRef}
                        className="absolute inset-0 pointer-events-none transition-opacity duration-300 ease-in-out z-0"
                        style={{
                            opacity: dragState ? 0.4 : 0.15,
                            backgroundImage: 'radial-gradient(hsl(var(--muted-foreground) / 0.5) 1px, transparent 1px)',
                            backgroundSize: `${GRID_SIZE * viewportRef.current.zoom}px ${GRID_SIZE * viewportRef.current.zoom}px`,
                            backgroundPosition: `${viewportRef.current.x}px ${viewportRef.current.y}px`,
                        }}
                    />

                    {/* Empty State */}
                    {nodes.length === 0 && permissions.canModifyCanvas && onOpenLibrary && (
                        <EmptyStateGuide onAddBlock={onOpenLibrary} />
                    )}

                    <div
                        ref={transformRef}
                        className="absolute origin-top-left w-full h-full pointer-events-none z-10"
                        style={{
                            transform: `translate(${viewportRef.current.x}px, ${viewportRef.current.y}px) scale(${viewportRef.current.zoom})`,
                        }}
                    >
                        {marquee && (
                            <div
                                className="absolute border border-primary bg-primary/10 pointer-events-none z-30"
                                style={{
                                    left: Math.min(marquee.startX, marquee.currentX),
                                    top: Math.min(marquee.startY, marquee.currentY),
                                    width: Math.abs(marquee.currentX - marquee.startX),
                                    height: Math.abs(marquee.currentY - marquee.startY),
                                }}
                            />
                        )}

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

                                // Resolve source output port type for edge coloring
                                const sourceNodeDef = blockRegistry[sourceNode?.type ?? ''];
                                const sourcePort = sourceNodeDef?.outputs.find(p => p.id === conn.sourcePortId);
                                const portType = sourcePort?.type ?? 'any';

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
                                        portType={portType}
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
                                            portType={connectionDraft.sourceType}
                                        />
                                    );
                                })()}
                        </svg>

                        <div className={`pointer-events-auto ${role === 'anonymous' ? 'pointer-events-none' : ''}`}>
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

                                const connectedPorts = connectedPortsByNodeId.get(node.id) ?? EMPTY_STRING_ARRAY;

                                return (
                                    <div key={node.id} className="relative hover:z-50">
                                        {role === 'anonymous' && (
                                            <div
                                                className="absolute inset-0 z-10 pointer-events-auto cursor-pointer"
                                                onClick={() => onNodeSelect?.(node.id)}
                                                onTouchEnd={() => onNodeSelect?.(node.id)}
                                            />
                                        )}
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
                                                onPortTouchStart: handlePortTouchStart,
                                                onPortDoubleClick: handlePortDoubleClick,
                                            }}
                                            configHandlers={{
                                                onConfigChange: (k, v) => handleConfigChange(node.id, k, v),
                                                onLabelChange: label => handleLabelChange(node.id, label),
                                                onToggleAuto: () => handleToggleAuto(node.id),
                                            }}
                                            actions={{
                                                onDelete: () => deleteNode(node.id),
                                                onTrigger: opts => triggerNode(node.id, opts),
                                                onDuplicate: () => duplicateNode(node.id),
                                                onOpenAiKeyDialog: onAiKeyRequired,

                                                onResize: (w, h) => handleNodeResize(node.id, w, h),
                                                onResizing: w =>
                                                    setResizingNode(w !== null ? { nodeId: node.id, width: w } : null),
                                            }}
                                            onMouseDown={e => handleNodeMouseDown(e, node.id)}
                                            onTouchStart={e => handleNodeTouchStart(e, node.id)}
                                            isDragging={dragState?.initialPositions.has(node.id) ?? false}
                                            isCollapsed={collapsedNodeIds.has(node.id)}
                                            onToggleCollapsed={() => toggleNodeCollapsed(node.id)}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {tooltip && (
                        <div data-canvas-overlay>
                            <DataTooltip tooltip={tooltip} />
                        </div>
                    )}

                    {/* Desktop Zoom Controls - hidden on mobile */}
                    <div data-canvas-overlay>
                        <ZoomControls
                            zoom={displayViewport.zoom}
                            onZoomIn={handleZoomIn}
                            onZoomOut={handleZoomOut}
                            onFitToScreen={handleFitToScreen}
                            onReset={handleResetView}
                            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 hidden sm:flex"
                        />
                    </div>

                    {/* Minimap - hidden on mobile */}
                    {nodes.length > 0 && (
                        <div data-canvas-overlay>
                            <Minimap
                                nodes={nodes}
                                connections={connections}
                                viewport={displayViewport}
                                canvasWidth={canvasSize.width}
                                canvasHeight={canvasSize.height}
                                onViewportChange={updateViewport}
                            />
                        </div>
                    )}

                    {/* Mobile Zoom Controls */}
                    <div data-canvas-overlay>
                        <MobileControls
                            onZoomIn={handleZoomIn}
                            onZoomOut={handleZoomOut}
                            onFitToScreen={handleFitToScreen}
                            onReset={handleResetView}
                        />
                    </div>

                    {modalFlowId && modalFlowData && (
                        <div
                            className="absolute inset-0 z-50 bg-background/80 flex items-center justify-center p-10 backdrop-blur-sm"
                            onMouseDown={e => e.stopPropagation()}
                            onWheel={e => e.stopPropagation()}
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
                                    <WorkflowCanvas initialData={modalFlowData} role="anonymous" />
                                </div>
                            </div>
                        </div>
                    )}

                    <div data-canvas-overlay>
                        <DetailPanel
                            role={role}
                            selectedNode={detailNode}
                            selectedConnection={detailConnection}
                            nodes={nodes}
                            connections={connections}
                            onConfigChange={handleConfigChange}
                            onDescriptionChange={handleDescriptionChange}
                            onLabelChange={handleLabelChange}
                            onToggleAuto={handleToggleAuto}
                            onDeleteNode={deleteNode}
                            onDeleteConnection={deleteConnection}
                            onTriggerNode={(nodeId, opts) => triggerNode(nodeId, opts)}
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
                            onOpenAiKeyDialog={onAiKeyRequired}
                        />
                    </div>

                    {contextMenu && (
                        <CanvasContextMenu
                            screenX={contextMenu.screenX}
                            screenY={contextMenu.screenY}
                            onSelect={type => {
                                const draft = contextMenu.fromDraft;
                                addNodeRef.current(
                                    type,
                                    { x: contextMenu.worldX, y: contextMenu.worldY },
                                    draft && {
                                        nodeId: draft.sourceNodeId,
                                        portId: draft.sourcePortId,
                                        portType: draft.sourceType,
                                    }
                                );
                                setContextMenu(null);
                            }}
                            onClose={handleCloseContextMenu}
                            portTypeFilter={contextMenu.filterCleared ? undefined : contextMenu.fromDraft?.sourceType}
                            onClearFilter={() =>
                                setContextMenu(prev => (prev ? { ...prev, filterCleared: true } : prev))
                            }
                        />
                    )}
                </div>
            </div>
        );
    }
);
