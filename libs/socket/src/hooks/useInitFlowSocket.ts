import { useCallback, useEffect } from 'react';

import { useWebCoreStore } from '@flows/web-core';

import { useWebSocketWorker } from './useWebSocketWorker';
import { useWebSocketStore } from '../stores/useWebSocketStore';

import type { ExecutionStats, FlowNodeMessage, FlowUpdateMessage, NodeUpdateMessage, WebSocketMessage } from '../types';

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
 * Type guard for FlowNodeMessage (legacy format with nodeId and status)
 */
export const isFlowNodeMessage = (data: unknown): data is FlowNodeMessage => {
    if (typeof data !== 'object' || data === null) return false;
    const msg = data as Record<string, unknown>;
    return msg['type'] === 'node' && typeof msg['nodeId'] === 'string';
};

/**
 * Type guard for FlowUpdateMessage (new format)
 */
export const isFlowUpdateMessage = (data: unknown): data is FlowUpdateMessage => {
    if (typeof data !== 'object' || data === null) return false;
    const msg = data as Record<string, unknown>;
    return msg['type'] === 'flow' && typeof msg['id'] === 'string' && !('nodeId' in msg);
};

/**
 * Type guard for NodeUpdateMessage (new format)
 */
export const isNodeUpdateMessage = (data: unknown): data is NodeUpdateMessage => {
    if (typeof data !== 'object' || data === null) return false;
    const msg = data as Record<string, unknown>;
    return (
        msg['type'] === 'node' &&
        typeof msg['id'] === 'string' &&
        typeof msg['flowId'] === 'string' &&
        !('nodeId' in msg)
    );
};

export interface UseInitFlowSocketOptions {
    /** Channel ID to subscribe to (from flow load response) */
    channelId?: string | null;
    /** Current flow ID for filtering messages */
    currentFlowId?: string | null;
    /** Last local update timestamp - messages with timestamp <= this are ignored (prevents self-echo) */
    lastLocalUpdateTimestamp?: number | null;
    /** Callback when flow update notification is received (new format) */
    onFlowUpdate?: (flowId: string) => void;
    /** Callback when node update notification is received (new format) */
    onNodeReload?: (nodeId: string, flowId: string) => void;
    /** @deprecated Callback when node status update is received (legacy format with status) */
    onNodeUpdate?: (message: FlowNodeMessage) => void;
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
 *   onNodeReload: (nodeId, flowId) => {
 *     // Reload node: GET /nodes/:id
 *   },
 * });
 */
export const useInitFlowSocket = (options: UseInitFlowSocketOptions = {}) => {
    const { channelId, currentFlowId, lastLocalUpdateTimestamp, onFlowUpdate, onNodeReload, onNodeUpdate } = options;

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

    // Broadcast messages to all subscribers and handle updates
    useEffect(() => {
        if (lastMessage) {
            broadcastMessage(lastMessage);

            const data = lastMessage.data;

            // Self-echo prevention: ignore messages within 3 seconds of our last save
            const DEBOUNCE_MS = 3000;
            const now = Date.now();
            const isRecentLocalUpdate = lastLocalUpdateTimestamp && now - lastLocalUpdateTimestamp < DEBOUNCE_MS;

            // Handle new format: flow update notification
            // NOTE: Disabled - flow updates are too frequent and cause UI flicker
            // Flow-level changes (node add/remove) trigger this, but we handle nodes individually
            if (isFlowUpdateMessage(data)) {
                return; // Skip flow reload entirely
            }

            // Handle new format: node update notification
            if (isNodeUpdateMessage(data)) {
                // Skip if we just saved (self-echo prevention)
                if (isRecentLocalUpdate) {
                    return;
                }
                // Only process if it's for the current flow
                if (currentFlowId && data.flowId === currentFlowId && onNodeReload) {
                    onNodeReload(data.id, data.flowId);
                }
                return;
            }

            // Handle legacy format: node status update with status field
            if (onNodeUpdate && isFlowNodeMessage(data)) {
                onNodeUpdate(data);
            }
        }
    }, [
        lastMessage,
        broadcastMessage,
        currentFlowId,
        lastLocalUpdateTimestamp,
        onFlowUpdate,
        onNodeReload,
        onNodeUpdate,
    ]);

    // Cleanup on unmount - intentionally empty deps for mount/unmount only
    useEffect(() => {
        return () => {
            disconnect();
            reset();
        };
    }, []);

    // Reconnect when channelId changes - intentionally excludes connect/disconnect to avoid loops
    useEffect(() => {
        if (apiKey) {
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
