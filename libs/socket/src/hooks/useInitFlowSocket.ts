import { useCallback, useEffect } from 'react';

import { parseSocketFrame, unwrapSocketEnvelope } from '@flows/engine';
import { useWebCoreStore } from '@flows/web-core';

import { useWebSocketWorker } from './useWebSocketWorker';
import { useWebSocketStore } from '../stores/useWebSocketStore';

import type { NodeState, ProductProgressMessage, SocketTraceEvent, TraceStage, WebSocketMessage } from '../types';

const WS_ENDPOINT = import.meta.env.VITE_WS_ENDPOINT || '';

/** A save made here comes back as a reload notice; reloading on it discards work. */
const SELF_ECHO_MS = 3000;

/**
 * Address a raw message, without deciding what it says.
 *
 * This layer only needs an id, because the store broadcasts to subscribers by id. What
 * the frame *means* is `parseSocketFrame`'s call, and unwrapping the envelope is shared
 * with it so the two can never disagree about which payload they are looking at.
 */
const parseWebSocketMessage = (data: unknown): WebSocketMessage | null => {
    if (typeof data !== 'object' || data === null) return null;

    const { payload, action } = unwrapSocketEnvelope(data as Record<string, unknown>);
    const messageId = (payload['id'] as string) || (payload['nodeId'] as string);

    if (messageId) return { id: messageId, data: payload, action };

    if (action === 'trace') {
        console.warn('[WS] Trace message dropped: missing id (nodeId). Server must include id field.', payload);
    }
    return null;
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

            // What a frame *is* — envelopes, the trace merge, port ids, history snapshots —
            // is the engine's to decide, and is under test there. What is left here is what
            // to do about it, which needs the callbacks this hook was given.
            const frame = parseSocketFrame(data);
            if (!frame) return;

            // Messages for another flow are not this canvas's business. They may omit
            // `flowId` — the channel subscription already filters by flow — so only a
            // stated mismatch is a reason to drop.
            const isOtherFlow = (flowId?: string): boolean => !!flowId && flowId !== currentFlowId;

            switch (frame.kind) {
                case 'trace':
                    if (isOtherFlow(frame.trace.flowId)) return;
                    onTraceUpdate?.({ ...frame.trace, ts: frame.trace.ts || Date.now() });
                    return;

                case 'progress':
                    onProgressUpdate?.({
                        nodeId: frame.event.nodeId,
                        status: frame.event.status,
                        percent: frame.event.percent,
                        step: frame.event.step,
                        totalSteps: frame.event.totalSteps,
                        label: frame.label,
                        error: frame.error,
                        seq: frame.event.seq,
                        ts: frame.ts,
                        product$: frame.product$,
                    });
                    return;

                case 'log':
                    frame.log.entries.forEach(entry =>
                        onLogTrace?.({ nodeId: frame.log.nodeId, source: frame.log.source, ...entry })
                    );
                    return;

                case 'flow': {
                    // Self-echo prevention: a save made here comes back as a reload notice,
                    // and reloading on it would throw away whatever was typed since.
                    const lastUpdate = getLastLocalUpdateTimestamp?.();
                    if (lastUpdate && Date.now() - lastUpdate < SELF_ECHO_MS) return;
                    if (currentFlowId && frame.flowId === currentFlowId) onFlowUpdate?.(frame.flowId);
                    return;
                }

                case 'node':
                    // No self-echo debounce here: run results arrive this way, and dropping
                    // them for three seconds after a save loses the start of every run.
                    if (isOtherFlow(frame.event.flowId)) return;
                    console.log(`[WS] ${frame.event.nodeId}: ${frame.event.state}`, data);
                    onNodeReload?.({
                        ...frame.event,
                        isPort: frame.event.isPort ?? false,
                        timestamp: frame.ts,
                    });
                    return;

                case 'port':
                    if (isOtherFlow(frame.event.flowId)) return;
                    console.log(`[WS] ${frame.event.nodeId}:${frame.event.portName} updated`, data);
                    onPortUpdate?.({
                        ...frame.event,
                        portName: frame.event.portName ?? '',
                        direction: frame.direction,
                    });
                    return;
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
