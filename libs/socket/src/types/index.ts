/**
 * WebSocket types for flow execution updates
 * @packageDocumentation
 */

// Re-export from flows package (single source of truth)
export type {
    CodexTraceStage,
    NodeState,
    RunNodeStage,
    SocketEvent,
    SocketNodeEvent,
    SocketTraceEvent,
    TraceStage,
    TraceType,
} from '@flows/flows';

// Re-export from sockets API package
export type { SocketActionType, SocketModelMeta, SocketPayload, SocketResponse } from '@lemoncloud/eureka-sockets-api';

import type { SocketNodeEvent, SocketTraceEvent } from '@flows/flows';
import type { SocketResponse } from '@lemoncloud/eureka-sockets-api';

/**
 * WebSocket connection status
 */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

/**
 * Base interface for WebSocket messages
 */
export interface BaseWebSocketMessage {
    id?: string;
    action?: string;
    data?: unknown;
}

/**
 * Generic WebSocket message structure for pub/sub routing
 */
export interface WebSocketMessage {
    id: string;
    data: unknown;
    /** Original action from raw socket message (e.g., 'message', 'trace') */
    action?: string;
}

/**
 * Flow update notification from WebSocket
 * When received, client should reload the flow via GET /flows/:id/load
 *
 * @example
 * {
 *   "type": "flow",
 *   "id": "1000051",
 *   "timestamp": 1770361729831
 * }
 */
export interface FlowUpdateMessage {
    type: 'flow';
    id: string;
    timestamp: number;
}

/**
 * Port update notification from WebSocket
 * Received when port data (input/output) changes
 *
 * @example
 * {
 *   "type": "node/port",
 *   "id": "1000637:in@in",
 *   "flowId": "1000088",
 *   "timestamp": 1771810838212,
 *   "no": 42
 * }
 *
 * ID format: "nodeId:direction@portName"
 * - nodeId: parent node ID (e.g., "1000637")
 * - direction: "in" or "out"
 * - portName: port identifier (e.g., "in", "out", "data")
 */
export interface PortUpdateMessage {
    type: 'node/port';
    id: string;
    flowId?: string;
    timestamp?: number;
    /**
     * Message sequence number (monotonically increasing)
     * Higher values indicate more recent updates - used for ordering
     */
    no?: number;
    /** Run correlation ID — links port update to a specific execution run */
    runId?: string;
    /** Always empty string for node/port messages (server sends uniformly) */
    stage?: string;
    /** Always empty string for node/port messages (server sends uniformly) */
    state?: string;
}

/**
 * Union type for socket data messages
 */
export type SocketDataMessage = FlowUpdateMessage | SocketNodeEvent | PortUpdateMessage | SocketTraceEvent;

/**
 * Raw WebSocket message wrapper from server
 *
 * Extends `SocketResponse` with trace-specific fields (seq, stage, message)
 * that the server includes at top level for trace events.
 *
 * @see SocketResponse from `@lemoncloud/eureka-sockets-api`
 */
export interface SocketResponseTrace<T = unknown> extends SocketResponse<T> {
    /** trace sequence number */
    seq?: number;
    /** trace stage */
    stage?: string;
    /** trace message */
    message?: string;
}

export type RawSocketMessage = SocketResponseTrace<SocketDataMessage | unknown>;

/**
 * Configuration for WebSocket worker
 */
export interface WebSocketWorkerConfig {
    endpoint: string;
    token: string;
    authQueryParam?: string;
    sessionId?: string;
    channels?: string;
}

/**
 * Callback function types
 */
export type MessageCallback<T = BaseWebSocketMessage> = (message: T) => void;
export type StatusCallback = (status: ConnectionStatus) => void;
export type ConnectionIdCallback = (id: string, connectionId: string | null) => void;
export type ErrorCallback = (error: Error) => void;

/**
 * Hook configuration for useWebSocketWorker
 */
export interface UseWebSocketWorkerConfig<TMessage extends BaseWebSocketMessage> {
    endpoint: string;
    tokenProvider?: () => Promise<string | null>;
    messageParser?: (data: unknown) => TMessage | null;
    enabled?: boolean;
    authQueryParam?: string;
    logPrefix?: string;
    sessionId?: string;
    channels?: string;
}

/**
 * Return type for useWebSocketWorker hook
 */
export interface UseWebSocketWorkerReturn<TMessage extends BaseWebSocketMessage> {
    id: string | null;
    connectionId: string | null;
    isConnected: boolean;
    connectionStatus: ConnectionStatus;
    lastMessage: TMessage | null;
    reconnectAttempts: number;
    maxReconnectReached: boolean;
    connect: () => Promise<void>;
    disconnect: () => void;
    reconnect: () => void;
    send: (data: unknown) => void;
}
