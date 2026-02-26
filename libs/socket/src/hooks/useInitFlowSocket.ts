import { useCallback, useEffect } from 'react';

import { useWebCoreStore } from '@flows/web-core';

import { useWebSocketWorker } from './useWebSocketWorker';
import { useWebSocketStore } from '../stores/useWebSocketStore';

import type { FlowUpdateMessage, NodeState, NodeUpdateMessage, PortUpdateMessage, WebSocketMessage } from '../types';

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

export const isNodeUpdateMessage = (data: unknown): data is NodeUpdateMessage => {
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

export interface NodeUpdateInfo {
    nodeId: string;
    flowId?: string;
    timestamp?: number;
    /**
     * @deprecated Use `state` instead. Kept for backward compatibility.
     */
    status?: string;
    /**
     * @deprecated Use `prevState` instead. Kept for backward compatibility.
     */
    prevStatus?: string;
    isPort: boolean;
    parentNodeId?: string;
    /**
     * Node execution state (preferred field)
     * Values: 'IDLE' | 'READY' | 'RUNNING' | 'COMPLETED' | 'ERROR'
     */
    state?: NodeState;
    /**
     * Previous execution state before this update
     */
    prevState?: NodeState;
    progress?: number;
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
    timestamp?: number;
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
    const { channelId, currentFlowId, getLastLocalUpdateTimestamp, onFlowUpdate, onNodeReload, onPortUpdate } = options;

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

                // Progress-only messages may not have flowId
                // Process if: has matching flowId OR is a progress update without flowId
                const isProgressOnlyMessage = data.progress !== undefined && !data.flowId;
                const isForCurrentFlow = data.flowId === currentFlowId;

                if (onNodeReload && (isForCurrentFlow || isProgressOnlyMessage)) {
                    // Prefer state over status (backward compatibility)
                    const effectiveState = (data.state ?? data.status) as NodeState | undefined;
                    const effectivePrevState = (data.prevState ?? data.prevStatus) as NodeState | undefined;

                    onNodeReload({
                        nodeId: data.id,
                        flowId: data.flowId,
                        timestamp: data.timestamp,
                        // Deprecated fields (kept for backward compatibility)
                        status: data.status,
                        prevStatus: data.prevStatus,
                        isPort,
                        parentNodeId,
                        // Preferred fields
                        state: effectiveState,
                        prevState: effectivePrevState,
                        progress: data.progress,
                    });
                }
                return;
            }

            // Handle port update notification (type: 'node/port')
            // Triggered when port data (input/output) changes
            // Used for real-time data synchronization between browser tabs
            if (isPortUpdateMessage(data)) {
                // Only process if it's for the current flow
                if (data.flowId && data.flowId !== currentFlowId) return;

                // Parse port ID to extract nodeId, direction, portName
                const parsed = parsePortId(data.id);
                if (!parsed) return;

                if (onPortUpdate) {
                    onPortUpdate({
                        portId: parsed.portId, // "nodeId:portName" without @direction
                        nodeId: parsed.nodeId,
                        portName: parsed.portName,
                        direction: parsed.direction, // from @suffix
                        flowId: data.flowId,
                        timestamp: data.timestamp,
                    });
                }
            }
        }
    }, [
        lastMessage,
        broadcastMessage,
        currentFlowId,
        getLastLocalUpdateTimestamp,
        onFlowUpdate,
        onNodeReload,
        onPortUpdate,
    ]);

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
