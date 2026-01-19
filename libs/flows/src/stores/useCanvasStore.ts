import { create } from 'zustand';

import type { Connection, DataPacket, NodeData, WorkflowState } from '@lemoncloud/eureka-flows-api';

// --- Types ---
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

// --- State Interface ---
interface CanvasState {
    // Core Data
    nodes: NodeData[];
    connections: Connection[];

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
    logViewerNodeId: string | null;
    modalFlowId: string | null;

    // Actions - Core Data
    setNodes: (nodes: NodeData[] | ((prev: NodeData[]) => NodeData[])) => void;
    setConnections: (connections: Connection[] | ((prev: Connection[]) => Connection[])) => void;
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
    setLogViewerNodeId: (id: string | null) => void;
    setModalFlowId: (id: string | null) => void;

    // Compound Actions
    clearSelection: () => void;
    loadWorkflow: (state: WorkflowState) => void;
    clearWorkflow: () => void;
    resetCanvas: () => void;

    // Node Actions
    updateNodeData: (nodeId: string, updates: Partial<NodeData>) => void;
    updateNodeInputData: (nodeId: string, portId: string, data: DataPacket) => void;
    deleteNode: (nodeId: string) => void;

    // Connection Actions
    deleteConnection: (connectionId: string) => void;
}

const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };

export const useCanvasStore = create<CanvasState>((set, _get) => ({
    // Initial State
    nodes: [],
    connections: [],
    clipboard: null,
    viewport: DEFAULT_VIEWPORT,
    isPanning: false,
    selectedNodeId: null,
    selectedConnectionId: null,
    hoveredConnectionId: null,
    dragState: null,
    connectionDraft: null,
    tooltip: null,
    logViewerNodeId: null,
    modalFlowId: null,

    // Core Data Actions
    setNodes: nodes =>
        set(state => ({
            nodes: typeof nodes === 'function' ? nodes(state.nodes) : nodes,
        })),

    setConnections: connections =>
        set(state => ({
            connections: typeof connections === 'function' ? connections(state.connections) : connections,
        })),

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
    setLogViewerNodeId: logViewerNodeId => set({ logViewerNodeId }),
    setModalFlowId: modalFlowId => set({ modalFlowId }),

    // Compound Actions
    clearSelection: () =>
        set({
            selectedNodeId: null,
            selectedConnectionId: null,
        }),

    loadWorkflow: workflowState =>
        set({
            nodes: workflowState.nodes,
            connections: workflowState.connections,
            selectedNodeId: null,
            selectedConnectionId: null,
        }),

    clearWorkflow: () =>
        set({
            nodes: [],
            connections: [],
            selectedNodeId: null,
            selectedConnectionId: null,
        }),

    resetCanvas: () =>
        set({
            nodes: [],
            connections: [],
            viewport: DEFAULT_VIEWPORT,
            selectedNodeId: null,
            selectedConnectionId: null,
            clipboard: null,
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
    deleteConnection: connectionId =>
        set(state => ({
            connections: state.connections.filter(c => c.id !== connectionId),
            selectedConnectionId: state.selectedConnectionId === connectionId ? null : state.selectedConnectionId,
        })),
}));

// Selector hooks for better performance
export const useCanvasNodes = () => useCanvasStore(state => state.nodes);
export const useCanvasConnections = () => useCanvasStore(state => state.connections);
export const useCanvasViewport = () => useCanvasStore(state => state.viewport);
export const useCanvasSelectedNodeId = () => useCanvasStore(state => state.selectedNodeId);
export const useCanvasSelectedConnectionId = () => useCanvasStore(state => state.selectedConnectionId);
export const useCanvasClipboard = () => useCanvasStore(state => state.clipboard);
export const useCanvasDragState = () => useCanvasStore(state => state.dragState);
export const useCanvasConnectionDraft = () => useCanvasStore(state => state.connectionDraft);
