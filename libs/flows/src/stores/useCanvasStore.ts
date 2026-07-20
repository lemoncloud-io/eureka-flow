import { create } from 'zustand';
import { createStore } from 'zustand/vanilla';

import type { EdgeView, RunContext, RunPortUpdate, TraceEntry } from '../types';
import type { Connection, DataPacket, NodeData, WorkflowState } from '@lemoncloud/eureka-flows-api';
import type { StateCreator } from 'zustand';

const MAX_TRACE_ENTRIES = 500;
const MAX_RUNS_PER_NODE = 20;

const createRunContext = (
    runId: string,
    nodeId: string,
    startedAt: number,
    seed: Partial<Pick<RunContext, 'traces' | 'portUpdates' | 'state' | 'completedAt' | 'error'>> = {}
): RunContext => ({
    runId,
    nodeId,
    state: 'RUNNING',
    startedAt,
    traces: [],
    portUpdates: [],
    ...seed,
});

export interface Viewport {
    x: number;
    y: number;
    zoom: number;
}

export interface DragState {
    nodeId: string;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
}

export interface ConnectionDraft {
    sourceNodeId: string;
    sourcePortId: string;
    sourceType: string;
    mouseX: number;
    mouseY: number;
}

export interface Tooltip {
    x: number;
    y: number;
    content: unknown;
    type: string;
}

interface CanvasState {
    // Core Data
    nodes: NodeData[];
    connections: Connection[];

    // Flow Context
    flowId: string | null;

    // Clipboard
    clipboard: NodeData | null;

    // Viewport
    viewport: Viewport;
    isPanning: boolean;

    // Selection
    selectedNodeId: string | null;
    selectedConnectionId: string | null;
    hoveredConnectionId: string | null;

    // Drag & Drop
    dragState: DragState | null;

    // Connection Draft
    connectionDraft: ConnectionDraft | null;

    // UI State
    tooltip: Tooltip | null;
    modalFlowId: string | null;

    // Port Update Highlight (portId format: "nodeId:portName")
    updatedPortIds: Set<string>;

    // Agent Trace Logs (nodeId → trace entries)
    traceLogs: Map<string, TraceEntry[]>;

    // Execution Stack (Run Context)
    nodeRuns: Record<string, RunContext[]>;

    // Node Collapse State
    collapsedNodeIds: Set<string>;

    // Tutorial Hint (set by TutorialPage, read by NodeBlock)
    tutorialHint: 'output-port' | 'run-button' | null;

    // Actions - Core Data
    setNodes: (nodes: NodeData[] | ((prev: NodeData[]) => NodeData[])) => void;
    setConnections: (connections: Connection[] | ((prev: Connection[]) => Connection[])) => void;
    setFlowId: (flowId: string | null) => void;
    setClipboard: (node: NodeData | null) => void;

    // Actions - Viewport
    setViewport: (viewport: Viewport | ((prev: Viewport) => Viewport)) => void;
    setIsPanning: (isPanning: boolean) => void;

    // Actions - Selection
    setSelectedNodeId: (id: string | null) => void;
    setSelectedConnectionId: (id: string | null) => void;
    setHoveredConnectionId: (id: string | null) => void;

    // Actions - Drag
    setDragState: (state: DragState | null) => void;

    // Actions - Connection Draft
    setConnectionDraft: (
        draft: ConnectionDraft | ((prev: ConnectionDraft | null) => ConnectionDraft | null) | null
    ) => void;

    // Actions - UI
    setTooltip: (tooltip: Tooltip | null) => void;
    setModalFlowId: (id: string | null) => void;

    // Actions - Port Update Highlight
    setUpdatedPort: (portId: string) => void;
    clearUpdatedPort: (portId: string) => void;

    // Actions - Agent Trace Logs
    appendTraceLog: (nodeId: string, entry: TraceEntry) => void;
    clearTraceLogs: (nodeId: string) => void;

    // Actions - Execution Stack
    beginRun: (runId: string, nodeId: string, timestamp: number) => void;
    appendRunTrace: (runId: string, nodeId: string, trace: TraceEntry) => void;
    appendRunPortUpdate: (runId: string, nodeId: string, portUpdate: RunPortUpdate) => void;
    finalizeRun: (
        runId: string,
        nodeId: string,
        state: 'COMPLETED' | 'ERROR',
        timestamp: number,
        error?: string
    ) => void;

    // Actions - Node Collapse
    toggleNodeCollapsed: (nodeId: string) => void;
    setAllNodesCollapsed: (collapsed: boolean, nodeIds?: string[]) => void;

    // Actions - Tutorial
    setTutorialHint: (hint: 'output-port' | 'run-button' | null) => void;

    // Compound Actions
    clearSelection: () => void;
    loadWorkflow: (state: WorkflowState, flowId?: string) => void;
    clearWorkflow: () => void;
    resetCanvas: () => void;

    // Node Actions
    updateNodeData: (nodeId: string, updates: Partial<NodeData>) => void;
    updateNodeInputData: (nodeId: string, portId: string, data: DataPacket) => void;
    deleteNode: (nodeId: string) => void;

    // Connection Actions
    addConnection: (connection: Connection) => void;
    updateConnection: (connectionId: string, updates: Partial<Connection>) => void;
    deleteConnection: (connectionId: string) => void;
}

const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };

export const canvasStateCreator: StateCreator<CanvasState> = (set, _get) => ({
    // Initial State
    nodes: [],
    connections: [],
    flowId: null,
    clipboard: null,
    viewport: DEFAULT_VIEWPORT,
    isPanning: false,
    selectedNodeId: null,
    selectedConnectionId: null,
    hoveredConnectionId: null,
    dragState: null,
    connectionDraft: null,
    tooltip: null,
    modalFlowId: null,
    updatedPortIds: new Set(),
    traceLogs: new Map(),
    nodeRuns: {},
    collapsedNodeIds: new Set(),
    tutorialHint: null,

    // Core Data Actions
    setNodes: nodes =>
        set(state => ({
            nodes: typeof nodes === 'function' ? nodes(state.nodes) : nodes,
        })),

    setConnections: connections =>
        set(state => ({
            connections: typeof connections === 'function' ? connections(state.connections) : connections,
        })),

    setFlowId: flowId => set({ flowId }),

    setClipboard: clipboard => set({ clipboard }),

    // Viewport Actions
    setViewport: viewport =>
        set(state => ({
            viewport: typeof viewport === 'function' ? viewport(state.viewport) : viewport,
        })),

    setIsPanning: isPanning => set({ isPanning }),

    // Selection Actions
    setSelectedNodeId: selectedNodeId => set({ selectedNodeId }),
    setSelectedConnectionId: selectedConnectionId => set({ selectedConnectionId }),
    setHoveredConnectionId: hoveredConnectionId => set({ hoveredConnectionId }),

    // Drag Actions
    setDragState: dragState => set({ dragState }),

    // Connection Draft Actions
    setConnectionDraft: draft =>
        set(state => ({
            connectionDraft: typeof draft === 'function' ? draft(state.connectionDraft) : draft,
        })),

    // UI Actions
    setTooltip: tooltip => set({ tooltip }),
    setModalFlowId: modalFlowId => set({ modalFlowId }),

    // Port Update Highlight Actions
    setUpdatedPort: portId =>
        set(state => {
            const newSet = new Set(state.updatedPortIds);
            newSet.add(portId);
            return { updatedPortIds: newSet };
        }),

    clearUpdatedPort: portId =>
        set(state => {
            const newSet = new Set(state.updatedPortIds);
            newSet.delete(portId);
            return { updatedPortIds: newSet };
        }),

    // Agent Trace Log Actions
    appendTraceLog: (nodeId, entry) =>
        set(state => {
            const newMap = new Map(state.traceLogs);
            const existing = newMap.get(nodeId) ?? [];
            const entries = [...existing, entry];
            newMap.set(nodeId, entries.length > MAX_TRACE_ENTRIES ? entries.slice(-MAX_TRACE_ENTRIES) : entries);
            return { traceLogs: newMap };
        }),

    clearTraceLogs: nodeId =>
        set(state => {
            const newMap = new Map(state.traceLogs);
            newMap.delete(nodeId);
            return { traceLogs: newMap };
        }),

    // Execution Stack Actions (message order not guaranteed — auto-create RunContext on first event)
    beginRun: (runId, nodeId, timestamp) =>
        set(state => {
            const existing = state.nodeRuns[nodeId] ?? [];
            if (existing.some(r => r.runId === runId)) return state;
            const updated = [createRunContext(runId, nodeId, timestamp), ...existing].slice(0, MAX_RUNS_PER_NODE);
            return { nodeRuns: { ...state.nodeRuns, [nodeId]: updated } };
        }),

    appendRunTrace: (runId, nodeId, trace) =>
        set(state => {
            const runs = state.nodeRuns[nodeId];
            if (!runs || !runs.some(r => r.runId === runId)) {
                const newRun = createRunContext(runId, nodeId, trace.ts, { traces: [trace] });
                return {
                    nodeRuns: { ...state.nodeRuns, [nodeId]: [newRun, ...(runs ?? [])].slice(0, MAX_RUNS_PER_NODE) },
                };
            }
            return {
                nodeRuns: {
                    ...state.nodeRuns,
                    [nodeId]: runs.map(r => (r.runId === runId ? { ...r, traces: [...r.traces, trace] } : r)),
                },
            };
        }),

    appendRunPortUpdate: (runId, nodeId, portUpdate) =>
        set(state => {
            const runs = state.nodeRuns[nodeId];
            if (!runs || !runs.some(r => r.runId === runId)) {
                const newRun = createRunContext(runId, nodeId, portUpdate.timestamp, {
                    portUpdates: [portUpdate],
                });
                return {
                    nodeRuns: { ...state.nodeRuns, [nodeId]: [newRun, ...(runs ?? [])].slice(0, MAX_RUNS_PER_NODE) },
                };
            }
            return {
                nodeRuns: {
                    ...state.nodeRuns,
                    [nodeId]: runs.map(r =>
                        r.runId === runId ? { ...r, portUpdates: [...r.portUpdates, portUpdate] } : r
                    ),
                },
            };
        }),

    finalizeRun: (runId, nodeId, finalState, timestamp, error) =>
        set(state => {
            const runs = state.nodeRuns[nodeId] ?? [];
            if (!runs.some(r => r.runId === runId)) {
                // enter 없이 final만 도착 — 자동 생성 후 즉시 완료 (메시지 순서 미보장 방어)
                const newRun = createRunContext(runId, nodeId, timestamp, {
                    state: finalState,
                    completedAt: timestamp,
                    error,
                });
                return {
                    nodeRuns: { ...state.nodeRuns, [nodeId]: [newRun, ...runs].slice(0, MAX_RUNS_PER_NODE) },
                };
            }
            return {
                nodeRuns: {
                    ...state.nodeRuns,
                    [nodeId]: runs.map(r =>
                        r.runId === runId ? { ...r, state: finalState, completedAt: timestamp, error } : r
                    ),
                },
            };
        }),

    // Node Collapse Actions
    toggleNodeCollapsed: nodeId =>
        set(state => {
            const newSet = new Set(state.collapsedNodeIds);
            if (newSet.has(nodeId)) {
                newSet.delete(nodeId);
            } else {
                newSet.add(nodeId);
            }
            return { collapsedNodeIds: newSet };
        }),

    setAllNodesCollapsed: (collapsed, nodeIds) =>
        set(() => ({
            collapsedNodeIds: collapsed ? new Set(nodeIds ?? []) : new Set<string>(),
        })),

    // Tutorial
    setTutorialHint: hint => set({ tutorialHint: hint }),

    // Compound Actions
    clearSelection: () =>
        set({
            selectedNodeId: null,
            selectedConnectionId: null,
        }),

    loadWorkflow: (workflowState, flowId) => {
        // Support both old (connections) and new (edges) format with fallbacks
        const nodes = workflowState?.nodes || [];
        const connections = workflowState?.connections || workflowState?.edges || [];

        set({
            nodes: nodes as NodeData[],
            connections: connections as Connection[],
            flowId: flowId || null,
            selectedNodeId: null,
            selectedConnectionId: null,
            traceLogs: new Map(),
            nodeRuns: {},
            collapsedNodeIds: new Set(),
        });
    },

    clearWorkflow: () =>
        set({
            nodes: [],
            connections: [],
            flowId: null,
            selectedNodeId: null,
            selectedConnectionId: null,
            traceLogs: new Map(),
            nodeRuns: {},
            collapsedNodeIds: new Set(),
        }),

    resetCanvas: () =>
        set({
            nodes: [],
            connections: [],
            flowId: null,
            viewport: DEFAULT_VIEWPORT,
            selectedNodeId: null,
            selectedConnectionId: null,
            clipboard: null,
            traceLogs: new Map(),
            nodeRuns: {},
            collapsedNodeIds: new Set(),
        }),

    // Node Actions
    updateNodeData: (nodeId, updates) =>
        set(state => ({
            nodes: state.nodes.map(n => (n.id === nodeId ? { ...n, ...updates } : n)),
        })),

    updateNodeInputData: (nodeId, portId, data) =>
        set(state => ({
            nodes: state.nodes.map(n =>
                n.id === nodeId ? { ...n, inputData: { ...n.inputData, [portId]: data } } : n
            ),
        })),

    deleteNode: nodeId =>
        set(state => ({
            nodes: state.nodes.filter(n => n.id !== nodeId),
            connections: state.connections.filter(c => c.sourceNodeId !== nodeId && c.targetNodeId !== nodeId),
            selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId,
        })),

    // Connection Actions
    addConnection: connection =>
        set(state => ({
            connections: [...state.connections, connection],
        })),

    updateConnection: (connectionId, updates) =>
        set(state => ({
            connections: state.connections.map(c => (c.id === connectionId ? { ...c, ...updates } : c)),
        })),

    deleteConnection: connectionId =>
        set(state => ({
            connections: state.connections.filter(c => c.id !== connectionId),
            selectedConnectionId: state.selectedConnectionId === connectionId ? null : state.selectedConnectionId,
        })),
});

/** Live singleton: the canvas the user sees. */
export const useCanvasStore = create<CanvasState>(canvasStateCreator);

/**
 * Headless instance sharing the live store's behavior but none of its state.
 * Edit a graph off-screen (agent draft, working copy) without touching the canvas.
 */
export const createCanvasStore = () => createStore<CanvasState>(canvasStateCreator);

// Selector hooks for better performance
export const useCanvasNodes = () => useCanvasStore(state => state.nodes);
export const useCanvasConnections = () => useCanvasStore(state => state.connections);
export const useCanvasFlowId = () => useCanvasStore(state => state.flowId);
export const useCanvasViewport = () => useCanvasStore(state => state.viewport);
export const useCanvasSelectedNodeId = () => useCanvasStore(state => state.selectedNodeId);
export const useCanvasSelectedConnectionId = () => useCanvasStore(state => state.selectedConnectionId);
export const useCanvasClipboard = () => useCanvasStore(state => state.clipboard);
export const useCanvasDragState = () => useCanvasStore(state => state.dragState);
export const useCanvasConnectionDraft = () => useCanvasStore(state => state.connectionDraft);
export const useUpdatedPortIds = () => useCanvasStore(state => state.updatedPortIds);
export const useCollapsedNodeIds = () => useCanvasStore(state => state.collapsedNodeIds);

const EMPTY_TRACE_ENTRIES: TraceEntry[] = [];
export const useNodeTraceLogs = (nodeId: string) =>
    useCanvasStore(state => state.traceLogs.get(nodeId) ?? EMPTY_TRACE_ENTRIES);

const EMPTY_RUNS: RunContext[] = [];
export const useNodeRuns = (nodeId: string) => useCanvasStore(state => state.nodeRuns[nodeId] ?? EMPTY_RUNS);

/**
 * Selector to get connections as EdgeView format (for API compatibility)
 */
export const useCanvasEdges = (): EdgeView[] =>
    useCanvasStore(state =>
        state.connections.map(c => ({
            id: c.id,
            sourceNodeId: c.sourceNodeId,
            sourcePortId: c.sourcePortId,
            targetNodeId: c.targetNodeId,
            targetPortId: c.targetPortId,
            label: c.label,
        }))
    );
