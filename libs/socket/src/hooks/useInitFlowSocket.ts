import { useCallback, useEffect } from 'react';

import { useWebCoreStore } from '@flows/web-core';

import { useWebSocketWorker } from './useWebSocketWorker';
import { useWebSocketStore } from '../stores/useWebSocketStore';

import type { ExecutionStats, FlowNodeMessage, WebSocketMessage } from '../types';

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

    // Handle wrapped message format: { action: 'message', data: {...} }
    const payload =
        'action' in msg && msg['action'] === 'message' && 'data' in msg && msg['data']
            ? (msg['data'] as Record<string, unknown>)
            : msg;

    // Check for id field (node ID) or nodeId field
    const messageId = (payload['id'] as string) || (payload['nodeId'] as string);

    if (messageId) {
        return {
            id: messageId,
            data: payload,
        };
    }

    return null;
};

/**
 * Parse execution stats from JSON string
 */
export const parseExecutionStats = (statsString?: string): ExecutionStats | undefined => {
    if (!statsString) return undefined;
    try {
        return JSON.parse(statsString) as ExecutionStats;
    } catch {
        console.warn('[FlowSocket] Failed to parse executionStats:', statsString);
        return undefined;
    }
};

/**
 * Type guard for FlowNodeMessage
 */
export const isFlowNodeMessage = (data: unknown): data is FlowNodeMessage => {
    if (typeof data !== 'object' || data === null) return false;
    const msg = data as Record<string, unknown>;
    return msg['type'] === 'node' && typeof msg['nodeId'] === 'string';
};

export interface UseInitFlowSocketOptions {
    /** Channel ID to subscribe to (from flow load response) */
    channelId?: string | null;
    /** Callback when node status update is received */
    onNodeUpdate?: (message: FlowNodeMessage) => void;
}

/**
 * Flow-specific WebSocket initialization hook
 * - Connects to WebSocket with flow channel ID
 * - Broadcasts all messages to subscribers via store
 * - Provides node update callback for direct handling
 *
 * @param options - Configuration options
 * @returns WebSocket control functions
 *
 * @example
 * const { connect, disconnect, isConnected } = useInitFlowSocket({
 *   channelId: '1000011',
 *   onNodeUpdate: (message) => {
 *     updateNodeData(message.nodeId, {
 *       status: message.status,
 *       errorMessage: message.errorMessage,
 *       executionStats: parseExecutionStats(message.executionStats),
 *     });
 *   },
 * });
 */
export const useInitFlowSocket = (options: UseInitFlowSocketOptions = {}) => {
    const { channelId, onNodeUpdate } = options;

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
        enabled: !!channelId && !!apiKey,
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

    // Broadcast messages to all subscribers and handle node updates
    useEffect(() => {
        if (lastMessage) {
            broadcastMessage(lastMessage);

            // Direct callback for node updates
            if (onNodeUpdate && isFlowNodeMessage(lastMessage.data)) {
                onNodeUpdate(lastMessage.data);
            }
        }
    }, [lastMessage, broadcastMessage, onNodeUpdate]);

    // Cleanup on unmount - intentionally empty deps for mount/unmount only
    useEffect(() => {
        return () => {
            disconnect();
            reset();
        };
    }, []);

    // Reconnect when channelId changes - intentionally excludes connect/disconnect to avoid loops
    useEffect(() => {
        if (channelId && apiKey) {
            void connect();
        } else {
            disconnect();
        }
    }, [channelId, apiKey]);

    return {
        connect,
        disconnect,
        reconnect,
        send,
        isConnected,
        connectionStatus,
        reconnectAttempts,
        maxReconnectReached,
    };
};
