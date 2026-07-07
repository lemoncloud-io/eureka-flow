import { useCallback, useEffect } from 'react';

import { isNodeState } from '@flows/flows';
import { useWebCoreStore } from '@flows/web-core';

import { useWebSocketWorker } from './useWebSocketWorker';
import { useWebSocketStore } from '../stores/useWebSocketStore';

import type {
    FlowUpdateMessage,
    LogEnvelopeMessage,
    NodeState,
    PortUpdateMessage,
    ProductProgressMessage,
    ProgressEnvelopeMessage,
    SocketNodeEvent,
    SocketTraceEvent,
    TraceStage,
    WebSocketMessage,
} from '../types';

const WS_ENDPOINT = import.meta.env.VITE_WS_ENDPOINT || '';

/**
 * Parse raw WebSocket message data into WebSocketMessage
 * Only extracts the ID for routing - feature-specific parsing happens in subscribers
 */
const parseWebSocketMessage = (data: unknown): WebSocketMessage | null => {
    if (typeof data !== 'object' || data === null) {
        return null;
    }
    const msg = data as Record<string, unknown>;

    // Handle wrapped message format: { action: 'message'|'trace', data: {...} }
    // Trace messages use SocketResponseTrace format where seq/ts/stage/message
    // are at top level and data.id contains nodeId — merge for uniform access.
    const action = 'action' in msg ? (msg['action'] as string) : undefined;
    let payload: Record<string, unknown>;

    if (action === 'trace' && 'data' in msg && msg['data']) {
        const nestedData = msg['data'] as Record<string, unknown>;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructuring to separate action/data from top-level fields
        const { action: _a, data: _d, ...topLevelFields } = msg;
        payload = { ...topLevelFields, ...nestedData };
    } else if (action === 'message' && 'data' in msg && msg['data']) {
        payload = msg['data'] as Record<string, unknown>;
    } else {
        payload = msg;
    }

    // Check for id field (node ID) or nodeId field
    const messageId = (payload['id'] as string) || (payload['nodeId'] as string);

    if (messageId) {
        return {
            id: messageId,
            data: payload,
            action,
        };
    }

    // Warn when trace message is dropped due to missing id (nodeId)
    if (action === 'trace') {
        console.warn('[WS] Trace message dropped: missing id (nodeId). Server must include id field.', payload);
    }

    return null;
};

/**
 * Type guard for FlowUpdateMessage (new format)
 */
export const isFlowUpdateMessage = (data: unknown): data is FlowUpdateMessage => {
    if (typeof data !== 'object' || data === null) return false;
    const msg = data as Record<string, unknown>;
    return msg['type'] === 'flow' && typeof msg['id'] === 'string' && !('nodeId' in msg);
};

export const isNodeUpdateMessage = (data: unknown): data is SocketNodeEvent => {
    if (typeof data !== 'object' || data === null) return false;
    const msg = data as Record<string, unknown>;
    return msg['type'] === 'node' && typeof msg['id'] === 'string' && !('nodeId' in msg);
};

/**
 * Type guard for PortUpdateMessage
 * Matches: { type: 'node/port', id: 'nodeId:direction@portName', ... }
 */
export const isPortUpdateMessage = (data: unknown): data is PortUpdateMessage => {
    if (typeof data !== 'object' || data === null) return false;
    const msg = data as Record<string, unknown>;
    return msg['type'] === 'node/port' && typeof msg['id'] === 'string';
};

export const isProgressEnvelopeMessage = (data: unknown): data is ProgressEnvelopeMessage => {
    if (typeof data !== 'object' || data === null) return false;
    const msg = data as Record<string, unknown>;
    return typeof msg['type'] === 'string' && msg['type'].startsWith('progress:') && typeof msg['id'] === 'string';
};

export const isLogEnvelopeMessage = (data: unknown): data is LogEnvelopeMessage => {
    if (typeof data !== 'object' || data === null) return false;
    const msg = data as Record<string, unknown>;
    return typeof msg['type'] === 'string' && msg['type'].startsWith('log:') && typeof msg['id'] === 'string';
};

/**
 * Parse port ID into components
 * Format: "nodeId:portName@direction" (e.g., "1000637:in@in")
 *
 * - Full ID with @: "1000637:in@in" → nodeId=1000637, portName=in, direction=in
 * - ID without @: "1000637:in" → nodeId=1000637, portName=in, direction from API
 */
const parsePortId = (
    fullId: string
): { nodeId: string; portId: string; portName: string; direction?: 'in' | 'out' } | null => {
    // Check for @ which indicates direction suffix
    const atIndex = fullId.indexOf('@');

    let portId: string;
    let direction: 'in' | 'out' | undefined;

    if (atIndex !== -1) {
        // Format: "nodeId:portName@direction"
        portId = fullId.slice(0, atIndex); // "1000637:in"
        const directionStr = fullId.slice(atIndex + 1); // "in" or "out"
        if (directionStr === 'in' || directionStr === 'out') {
            direction = directionStr;
        }
    } else {
        // Format: "nodeId:portName" (no direction suffix)
        portId = fullId;
    }

    // Parse portId to get nodeId and portName
    const colonIndex = portId.indexOf(':');
    if (colonIndex === -1) return null;

    const nodeId = portId.slice(0, colonIndex); // "1000637"
    const portName = portId.slice(colonIndex + 1); // "in"

    return { nodeId, portId, portName, direction };
};

/**
 * Type guard for ProductProgressMessage.
 * Matches: { type: 'product-progress', productId, progress$, state }.
 */
export const isProductProgressMessage = (data: unknown): data is ProductProgressMessage => {
    if (typeof data !== 'object' || data === null) return false;
    const msg = data as Record<string, unknown>;
    return (
        msg['type'] === 'product-progress' &&
        typeof msg['productId'] === 'string' &&
        typeof msg['progress$'] === 'object' &&
        msg['progress$'] !== null &&
        typeof msg['state'] === 'string'
    );
};

/**
 * Type guard for SocketTraceEvent
 * `seq` (required number) is the discriminant — unique to trace events
 */
export const isTraceMessage = (data: unknown): data is SocketTraceEvent => {
    if (typeof data !== 'object' || data === null) return false;
    const msg = data as Record<string, unknown>;
    return typeof msg['seq'] === 'number';
};

/**
 * Trace update info parsed from WebSocket message
 * Used by onTraceUpdate callback for agent block trace display
 */
export interface TraceUpdateInfo {
    /** Node ID of the agent block (from server `id` field) */
    nodeId: string;
    /** Flow ID */
    flowId?: string;
    /** Sequence number for ordering */
    seq: number;
    /** Timestamp */
    ts: number;
    /** Execution stage (from SocketTraceEvent.stage) */
    stage?: TraceStage;
    /** Log message (from SocketTraceEvent.message) */
    message?: string;
    /** Run state (from SocketTraceEvent.state) */
    state?: string;
    /** Run correlation ID */
    runId?: string;
    /** Structured event data */
    data?: Record<string, unknown>;
}

export interface NodeUpdateInfo {
    nodeId: string;
    flowId?: string;
    timestamp?: number;
    /**
     * Message sequence number (monotonically increasing)
     * Higher values indicate more recent updates - used for ordering
     */
    no?: number;
    /** Computed: true if id contains ':' (port update piggybacked on node event) */
    isPort: boolean;
    /** Computed: parent node ID extracted from port-format id */
    parentNodeId?: string;
    /** Node execution state */
    state?: NodeState;
    progress?: number;
    /**
     * Minor stage of node run (from SocketNodeEvent.stage)
     * - 'enter': node execution started
     * - 'final': node execution completed with full data in socket message
     * - 'progress': intermediate progress update
     */
    stage?: string;
    /** Run correlation ID */
    runId?: string;
    /** Server-side error message */
    error?: string;
}

/**
 * Port update info parsed from WebSocket message
 * Used by onPortUpdate callback for port data synchronization
 */
export interface PortUpdateInfo {
    /** Port ID for API call: "nodeId:portName" (e.g., "1000637:in") */
    portId: string;
    /** Parent node ID (e.g., "1000637") */
    nodeId: string;
    /** Port name/key (e.g., "in", "out", "data") */
    portName: string;
    /** Port direction (from @suffix: "in" or "out") */
    direction?: 'in' | 'out';
    /** Flow ID */
    flowId?: string;
    /** Timestamp when port data changed */
    ts?: number;
    /**
     * Message sequence number (monotonically increasing)
     * Higher values indicate more recent updates - used for ordering
     */
    no?: number;
    /** Run correlation ID — links port update to a specific execution run */
    runId?: string;
}

/**
 * Progress snapshot info parsed from a lemon-model `progress:*` envelope.
 * Emitted by eureka-flows-api processors and codes-goods-api deploy steps.
 */
export interface ProgressUpdateInfo {
    /** Task ID — the node ID of the block being traced */
    nodeId: string;
    /** 'pending' | 'running' | 'done' | 'error' */
    status?: string;
    percent?: number;
    step?: number;
    totalSteps?: number;
    label?: string;
    error?: string;
    /** Reporter sequence — last-write-wins dedup key (epoch-based across server invocations) */
    seq: number;
    ts?: number;
    /** Live product view from codes-goods-api (merge into block out data) */
    product$?: Record<string, unknown>;
}

/**
 * One log line parsed from a lemon-model `log:*` envelope batch.
 */
export interface LogTraceEntryInfo {
    /** Node ID of the traced block */
    nodeId: string;
    level?: string;
    message?: string;
    ts?: number;
    seq?: number;
    json?: Record<string, unknown>;
    /** Reporter identity (per server invocation) */
    source?: string;
}

/**
 * Product deployment progress info parsed from WebSocket message.
 * Emitted for `action: 'progress'` payloads from codes-goods-api.
 */
export interface ProductProgressInfo {
    /** Product ID from codes-goods-api */
    productId: string;
    /** Phase → percent map (e.g., { upload: 100, refactor: 60, build: 20, deploy: 0 }) */
    progress$: Record<string, number>;
    /** Current phase state (e.g., 'uploading', 'building', 'done', 'error') */
    state: string;
    /** Last few ms-epoch timestamps for ETA computation */
    timestamps: number[];
}

export interface UseInitFlowSocketOptions {
    /** Channel ID to subscribe to (from flow load response) */
    channelId?: string | null;
    /** Current flow ID for filtering messages */
    currentFlowId?: string | null;
    /** Getter for last local update timestamp - messages within 3s of this are ignored (prevents self-echo) */
    getLastLocalUpdateTimestamp?: () => number | null;
    /** Callback when flow update notification is received - should reload entire flow */
    onFlowUpdate?: (flowId: string) => void;
    /** Callback when node update notification is received - should reload single node */
    onNodeReload?: (info: NodeUpdateInfo) => void;
    /** Callback when port update notification is received - should fetch port data */
    onPortUpdate?: (info: PortUpdateInfo) => void;
    /** Callback when trace message is received - for agent block execution logs */
    onTraceUpdate?: (info: TraceUpdateInfo) => void;
    /** Callback when a lemon-model progress snapshot is received - live node state/data updates */
    onProgressUpdate?: (info: ProgressUpdateInfo) => void;
    /** Callback per log line from a lemon-model log batch - live server logs in trace panel */
    onLogTrace?: (info: LogTraceEntryInfo) => void;
    /** Callback when product progress message is received - for deployment progress UI */
    onProductProgress?: (info: ProductProgressInfo) => void;
    /** Observer for all parsed messages (dev tools, replay recording) */
    onMessage?: (message: WebSocketMessage) => void;
}

/**
 * Flow-specific WebSocket initialization hook
 * - Connects to WebSocket with flow channel ID
 * - Broadcasts all messages to subscribers via store
 * - Handles new message format: { type: 'flow'|'node', id, flowId?, timestamp }
 * - Provides callbacks for flow and node update notifications
 *
 * @param options - Configuration options
 * @returns WebSocket control functions
 *
 * @example
 * const { connect, disconnect, isConnected } = useInitFlowSocket({
 *   channelId: '1000011',
 *   currentFlowId: '1000011',
 *   onFlowUpdate: (flowId) => {
 *     // Reload entire flow: GET /flows/:id/load
 *   },
 *   onNodeReload: (info) => {
 *     // Reload node: GET /nodes/:id
 *     // info contains: nodeId, flowId, state, stage, runId, error
 *   },
 * });
 */
export const useInitFlowSocket = (options: UseInitFlowSocketOptions = {}) => {
    const {
        channelId,
        currentFlowId,
        getLastLocalUpdateTimestamp,
        onFlowUpdate,
        onNodeReload,
        onPortUpdate,
        onTraceUpdate,
        onProgressUpdate,
        onLogTrace,
        onProductProgress,
        onMessage,
    } = options;

    const apiKey = useWebCoreStore(state => state.apiKey);
    const setId = useWebSocketStore(state => state.setId);
    const setConnectionStatus = useWebSocketStore(state => state.setConnectionStatus);
    const broadcastMessage = useWebSocketStore(state => state.broadcastMessage);
    const reset = useWebSocketStore(state => state.reset);

    const tokenProvider = useCallback(async (): Promise<string | null> => {
        return apiKey || null;
    }, [apiKey]);

    const {
        id,
        connectionId,
        connectionStatus,
        lastMessage,
        disconnect,
        connect,
        reconnect,
        send,
        isConnected,
        reconnectAttempts,
        maxReconnectReached,
    } = useWebSocketWorker<WebSocketMessage>({
        endpoint: WS_ENDPOINT,
        tokenProvider,
        messageParser: parseWebSocketMessage,
        enabled: !!apiKey,
        logPrefix: '[FlowSocket]',
        channels: channelId || undefined,
    });

    // Sync WebSocket state to store
    useEffect(() => {
        setId(id);
    }, [id, setId]);

    useEffect(() => {
        setConnectionStatus(connectionStatus);
    }, [connectionStatus, setConnectionStatus]);

    const dispatchMessage = useCallback(
        (message: WebSocketMessage) => {
            const data = message.data;

            // Handle product progress streaming (codes-goods-api → eureka-sockets-api).
            // Emitted with action='progress' wrapping a product-progress payload.
            if (message.action === 'progress' && isProductProgressMessage(data)) {
                onProductProgress?.({
                    productId: data.productId,
                    progress$: data.progress$,
                    state: data.state,
                    timestamps: data.timestamps ?? [],
                });
                return;
            }

            // Handle trace message FIRST (before node/flow handlers)
            // Merged trace payload contains type: "node" from nested data,
            // which would incorrectly match isNodeUpdateMessage if checked later.
            if (message.action === 'trace' && isTraceMessage(data)) {
                // Skip completion signals with no stage and no message
                if (!data.stage && !data.message) {
                    return;
                }

                // flowId comes from merged nested data, not from SocketTraceEvent directly
                const tracePayload = data as Record<string, unknown>;
                const traceFlowId = tracePayload.flowId as string | undefined;

                // Skip if flowId is present and doesn't match current flow
                if (traceFlowId && traceFlowId !== currentFlowId) {
                    return;
                }

                if (onTraceUpdate) {
                    onTraceUpdate({
                        nodeId: message.id,
                        flowId: traceFlowId,
                        seq: data.seq,
                        ts: data.ts ?? Date.now(),
                        stage: data.stage,
                        message: data.message,
                        state: data.state,
                        runId: data.runId,
                        data: data.data,
                    });
                }
                return;
            }

            // Handle lemon-model progress snapshot (progress:*) — live node state/data updates.
            // Emitted by flows-api processors (runWithProcessTrace) and codes-goods-api deploy steps.
            if (isProgressEnvelopeMessage(data)) {
                const state = data.data;
                if (state) {
                    onProgressUpdate?.({
                        nodeId: message.id,
                        status: state.status,
                        percent: state.percent,
                        step: state.step,
                        totalSteps: state.totalSteps,
                        label: state.label,
                        error: state.error,
                        seq: state.seq ?? 0,
                        ts: state.ts,
                        product$: state.meta?.product$,
                    });
                }
                return;
            }

            // Handle lemon-model log batch (log:*) — unpack entries in batch order.
            if (isLogEnvelopeMessage(data)) {
                const batch = data.data;
                (batch?.entries ?? []).forEach(entry =>
                    onLogTrace?.({
                        nodeId: message.id,
                        level: entry.level,
                        message: entry.message,
                        ts: entry.ts,
                        seq: entry.seq,
                        json: entry.json,
                        source: batch?.source,
                    })
                );
                return;
            }

            // Self-echo prevention: ignore messages within 3 seconds of our last local change
            const DEBOUNCE_MS = 3000;
            const now = Date.now();
            const lastUpdate = getLastLocalUpdateTimestamp?.();
            const isRecentLocalUpdate = lastUpdate && now - lastUpdate < DEBOUNCE_MS;

            // Handle new format: flow update notification
            if (isFlowUpdateMessage(data)) {
                // Skip if we just made local changes (self-echo prevention)
                if (isRecentLocalUpdate) {
                    return;
                }
                // Only process if it's for the current flow
                if (currentFlowId && data.id === currentFlowId && onFlowUpdate) {
                    onFlowUpdate(data.id);
                }
                return;
            }

            // Handle node update notification (includes status changes and progress)
            // Socket message is just a notification - actual data is fetched via API
            // NOTE: Node updates do NOT use self-echo prevention because:
            // - Node run results come via socket and must be processed
            // - Self-echo prevention is only for flow save operations
            if (isNodeUpdateMessage(data)) {
                // Skip history nodes (format: nodeId@N like 'ywb8c99z3@2')
                // History nodes are snapshots and don't need to trigger updates
                const isHistoryNode = data.id.includes('@');
                if (isHistoryNode) return;

                // Check if this is a port update (id contains ':' like 'nodeId:5')
                const isPort = data.id.includes(':');
                const parentNodeId = isPort ? data.id.split(':')[0] : undefined;

                // Skip if flowId is present but doesn't match current flow
                // Node messages may omit flowId — channel subscription already filters by flow
                if (data.flowId && data.flowId !== currentFlowId) {
                    return;
                }

                // Log state transitions with data (e.g., "1004310: IDLE→RUNNING {...}")
                const stateChange = data.state;
                console.log(`[WS] ${data.id}: ${stateChange}`, data);

                if (onNodeReload) {
                    onNodeReload({
                        nodeId: data.id,
                        flowId: data.flowId,
                        timestamp: data.ts,
                        no: data.no,
                        isPort,
                        parentNodeId,
                        state: isNodeState(data.state) ? data.state : undefined,
                        progress: data.progress,
                        stage: data.stage,
                        runId: data.runId,
                        error: data.error,
                    });
                }
                return;
            }

            // Handle port update notification (type: 'node/port')
            // Triggered when port data (input/output) changes
            // Used for real-time data synchronization between browser tabs
            if (isPortUpdateMessage(data)) {
                // Skip if flowId is present but doesn't match current flow
                // Port messages may omit flowId — channel subscription already filters by flow
                if (data.flowId && data.flowId !== currentFlowId) {
                    return;
                }

                // Parse port ID to extract nodeId, direction, portName
                const parsed = parsePortId(data.id);
                if (!parsed) return;

                // Log port updates with data (e.g., "1004310:out updated {...}")
                console.log(`[WS] ${parsed.nodeId}:${parsed.portName} updated`, data);

                if (onPortUpdate) {
                    onPortUpdate({
                        portId: parsed.portId, // "nodeId:portName" without @direction
                        nodeId: parsed.nodeId,
                        portName: parsed.portName,
                        direction: parsed.direction, // from @suffix
                        flowId: data.flowId,
                        ts: data.ts,
                        no: data.no,
                        runId: data.runId,
                    });
                }
            }
        },
        [
            currentFlowId,
            getLastLocalUpdateTimestamp,
            onFlowUpdate,
            onNodeReload,
            onPortUpdate,
            onTraceUpdate,
            onProgressUpdate,
            onLogTrace,
            onProductProgress,
        ]
    );

    // Broadcast messages to all subscribers and handle updates
    useEffect(() => {
        if (lastMessage) {
            broadcastMessage(lastMessage);
            onMessage?.(lastMessage);
            dispatchMessage(lastMessage);
        }
    }, [lastMessage, broadcastMessage, onMessage, dispatchMessage]);

    // Cleanup on unmount
    // Note: Empty deps intentional - runs only on unmount
    useEffect(() => {
        return () => {
            disconnect();
            reset();
        };
    }, []);

    // Reconnect when channelId changes
    // Note: connect/disconnect intentionally excluded to prevent infinite loops
    useEffect(() => {
        if (apiKey) {
            void connect();
        } else {
            disconnect();
        }
    }, [channelId, apiKey]);

    return {
        connectionId,
        connect,
        disconnect,
        reconnect,
        send,
        isConnected,
        connectionStatus,
        reconnectAttempts,
        maxReconnectReached,
        replayMessage: dispatchMessage,
    };
};
