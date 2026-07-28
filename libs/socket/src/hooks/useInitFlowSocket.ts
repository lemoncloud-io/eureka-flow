import { useCallback, useEffect } from 'react';

import { unwrapSocketEnvelope } from '@flows/engine';
import { useWebCoreStore } from '@flows/web-core';

import { dispatchSocketFrame } from './dispatchSocketFrame';
import { useWebSocketWorker } from './useWebSocketWorker';
import { useWebSocketStore } from '../stores/useWebSocketStore';

import type {
    LogTraceEntryInfo,
    NodeUpdateInfo,
    PortUpdateInfo,
    ProductProgressInfo,
    ProgressUpdateInfo,
    TraceUpdateInfo,
    WebSocketMessage,
} from '../types';

const WS_ENDPOINT = import.meta.env.VITE_WS_ENDPOINT || '';

/**
 * The socket's default channel, as the server names it.
 *
 * This used to arrive as a `channelId` threaded down from the flow load response, but the
 * server has never sent that field — so the value was always this literal. It is not a
 * fallback: the server's opening frame reports `channel$$: [{ name: '#default', id: '0000' }]`,
 * and this is that channel. Run frames do not travel by channel anyway; the server streams
 * them to a `connectionId` (see `useWebSocketWorker`), which is what a run request carries.
 */
const DEFAULT_CHANNEL = '0000';

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

export interface UseInitFlowSocketOptions {
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
 * - Connects to WebSocket on the default channel
 * - Broadcasts all messages to subscribers via store
 * - Handles new message format: { type: 'flow'|'node', id, flowId?, timestamp }
 * - Provides callbacks for flow and node update notifications
 *
 * @param options - Configuration options
 * @returns WebSocket control functions
 *
 * @example
 * const { connect, disconnect, isConnected } = useInitFlowSocket({
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
        channels: DEFAULT_CHANNEL,
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
            dispatchSocketFrame(message, {
                currentFlowId,
                getLastLocalUpdateTimestamp,
                onFlowUpdate,
                onNodeReload,
                onPortUpdate,
                onTraceUpdate,
                onProgressUpdate,
                onLogTrace,
                onProductProgress,
            });
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

    // Follow the key: connect once there is one, drop the socket when it goes away.
    // Note: connect/disconnect intentionally excluded to prevent infinite loops
    useEffect(() => {
        if (apiKey) {
            void connect();
        } else {
            disconnect();
        }
    }, [apiKey]);

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
