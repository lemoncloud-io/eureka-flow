import { useCallback, useEffect } from 'react';

import { useWebCoreStore } from '@flows/web-core';

import { useWebSocketWorker } from './useWebSocketWorker';
import { useWebSocketStore } from '../stores/useWebSocketStore';

import type {
    FlowUpdateMessage,
    NodeState,
    NodeUpdateMessage,
    PortUpdateMessage,
    TraceMessage,
    TraceStage,
    TraceType,
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
    const action = 'action' in msg ? (msg['action'] as string) : undefined;
    const payload =
        (action === 'message' || action === 'trace') && 'data' in msg && msg['data']
            ? (msg['data'] as Record<string, unknown>)
            : msg;

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

/**
 * Type guard for TraceMessage payload
 * Matches: { traceId: '...', seq: N, stage: '...', runId: '...' }
 */
export const isTraceMessage = (data: unknown): data is TraceMessage => {
    if (typeof data !== 'object' || data === null) return false;
    const msg = data as Record<string, unknown>;
    return (
        typeof msg['traceId'] === 'string' &&
        typeof msg['seq'] === 'number' &&
        typeof msg['stage'] === 'string' &&
        typeof msg['runId'] === 'string' &&
        typeof msg['type'] === 'string'
    );
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
    /** Trace correlation ID */
    traceId: string;
    /** Sequence number for ordering */
    seq: number;
    /** Timestamp */
    ts: number;
    /** Execution stage */
    stage: TraceStage;
    /** Log message */
    message: string;
    /** Run correlation ID */
    runId: string;
    /** Specific event type (e.g., 'run_start', 'tool_start', 'error') */
    type: TraceType;
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
    /**
     * Stereotype indicator for message content completeness
     * - 0 or '': Socket message contains all necessary data - no API fetch needed
     * - Other values or undefined: Additional data may be needed via API
     */
    stereo?: number | string;
    /**
     * Error message when state is 'ERROR'
     * Available when stereo indicates message completeness (0 or '')
     */
    errorMessage?: string;
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
    /**
     * Message sequence number (monotonically increasing)
     * Higher values indicate more recent updates - used for ordering
     */
    no?: number;
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
    const {
        channelId,
        currentFlowId,
        getLastLocalUpdateTimestamp,
        onFlowUpdate,
        onNodeReload,
        onPortUpdate,
        onTraceUpdate,
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

                // Skip if flowId is missing or doesn't match current flow
                // All node updates should have flowId - reject those without it
                const isForCurrentFlow = data.flowId && data.flowId === currentFlowId;
                if (!isForCurrentFlow) {
                    return;
                }

                // Log state transitions with data (e.g., "1004310: IDLE→RUNNING {...}")
                const stateChange = data.prevState ? `${data.prevState}→${data.state}` : data.state;
                console.log(`[WS] ${data.id}: ${stateChange}`, data);

                if (onNodeReload) {
                    // Prefer state over status (backward compatibility)
                    const effectiveState = (data.state ?? data.status) as NodeState | undefined;
                    const effectivePrevState = (data.prevState ?? data.prevStatus) as NodeState | undefined;

                    onNodeReload({
                        nodeId: data.id,
                        flowId: data.flowId,
                        timestamp: data.timestamp,
                        no: data.no,
                        // Deprecated fields (kept for backward compatibility)
                        status: data.status,
                        prevStatus: data.prevStatus,
                        isPort,
                        parentNodeId,
                        // Preferred fields
                        state: effectiveState,
                        prevState: effectivePrevState,
                        progress: data.progress,
                        stereo: data.stereo,
                        errorMessage: data.errorMessage,
                    });
                }
                return;
            }

            // Handle trace message (action: 'trace')
            // Received during agent block execution with stage/message updates
            if (lastMessage.action === 'trace' && isTraceMessage(data)) {
                // Skip if flowId is present and doesn't match current flow
                // Note: flowId may be absent if server doesn't include it in trace wrapper
                if (data.flowId && data.flowId !== currentFlowId) {
                    return;
                }

                if (onTraceUpdate) {
                    onTraceUpdate({
                        nodeId: lastMessage.id,
                        flowId: data.flowId,
                        traceId: data.traceId,
                        seq: data.seq,
                        ts: data.ts,
                        stage: data.stage,
                        message: data.message,
                        runId: data.runId,
                        type: data.type,
                        data: data.data,
                    });
                }
                return;
            }

            // Handle port update notification (type: 'node/port')
            // Triggered when port data (input/output) changes
            // Used for real-time data synchronization between browser tabs
            if (isPortUpdateMessage(data)) {
                // Skip if flowId is missing or doesn't match current flow
                const isForCurrentFlow = data.flowId && data.flowId === currentFlowId;
                if (!isForCurrentFlow) {
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
                        timestamp: data.timestamp,
                        no: data.no,
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
        onTraceUpdate,
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
        connectionId,
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
