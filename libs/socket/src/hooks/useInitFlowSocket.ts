import { useCallback, useEffect } from 'react';

import { useWebCoreStore } from '@flows/web-core';

import { useWebSocketWorker } from './useWebSocketWorker';
import { useWebSocketStore } from '../stores/useWebSocketStore';

import type { FlowUpdateMessage, NodeUpdateMessage, WebSocketMessage } from '../types';

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

export interface NodeUpdateInfo {
    nodeId: string;
    flowId: string;
    timestamp: number;
    status?: string;
    prevStatus?: string;
    /** True if this is a port update (id contains ':') */
    isPort: boolean;
    /** Parent node ID (extracted from port ID like 'nodeId:5' -> 'nodeId') */
    parentNodeId?: string;
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
 *     // info contains: nodeId, flowId, timestamp, status, prevStatus
 *   },
 * });
 */
export const useInitFlowSocket = (options: UseInitFlowSocketOptions = {}) => {
    const { channelId, currentFlowId, getLastLocalUpdateTimestamp, onFlowUpdate, onNodeReload } = options;

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

            // Handle node update notification (includes status changes)
            // Socket message is just a notification - actual data is fetched via API
            // NOTE: Node updates do NOT use self-echo prevention because:
            // - Node run results come via socket and must be processed
            // - Self-echo prevention is only for flow save operations
            if (isNodeUpdateMessage(data)) {
                // Skip history nodes (format: nodeId@N like 'ywb8c99z3@2')
                // History nodes are snapshots and don't need to trigger updates
                const isHistoryNode = data.id.includes('@');
                if (isHistoryNode) return;

                // Only process if it's for the current flow
                if (currentFlowId && data.flowId === currentFlowId && onNodeReload) {
                    // Check if this is a port update (id contains ':' like 'nodeId:5')
                    const isPort = data.id.includes(':');
                    const parentNodeId = isPort ? data.id.split(':')[0] : undefined;

                    onNodeReload({
                        nodeId: data.id,
                        flowId: data.flowId,
                        timestamp: data.timestamp,
                        status: data.status,
                        prevStatus: data.prevStatus,
                        isPort,
                        parentNodeId,
                    });
                }
            }
        }
    }, [lastMessage, broadcastMessage, currentFlowId, getLastLocalUpdateTimestamp, onFlowUpdate, onNodeReload]);

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
