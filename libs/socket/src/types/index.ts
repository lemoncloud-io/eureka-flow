/**
 * WebSocket types for flow execution updates
 * @packageDocumentation
 */

// Re-export from flows package (single source of truth)
export type { NodeState, TraceStage, TraceType } from '@flows/flows';

// Re-export from sockets API package
export type {
    SocketActionType,
    SocketModelMeta,
    SocketPayload,
    SocketResponse,
    SocketResponseTrace,
} from '@lemoncloud/eureka-sockets-api';

import type { NodeState, TraceStage, TraceType } from '@flows/flows';
import type { SocketResponseTrace } from '@lemoncloud/eureka-sockets-api';

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
 * Node update notification from WebSocket
 */
export interface NodeUpdateMessage {
    type: 'node';
    id: string;
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
    /** Server-side error message (preferred) */
    error?: string;
    /** @deprecated Use `error` instead. */
    errorMessage?: string;
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
}

/**
 * Trace message payload after parsing from WebSocket
 *
 * Server sends `SocketResponseTrace<SocketModelMeta>` format where
 * trace fields (seq, ts, stage, message) are at top level and
 * data.id contains the nodeId. `parseWebSocketMessage` merges
 * top-level fields with nested data for uniform access.
 *
 * @see SocketResponseTrace from `@lemoncloud/eureka-sockets-api`
 *
 * @example Server raw format (SocketResponseTrace):
 * {
 *   "action": "trace",
 *   "seq": 1,
 *   "ts": 1774515799013,
 *   "stage": "planner",
 *   "message": "Planner invoked",
 *   "data": { "id": "1006358", "flowId": "1003299" }
 * }
 */
export interface TraceMessage {
    /** Node ID (from data.id after merge) */
    id?: string;
    flowId?: string;
    traceId?: string;
    seq: number;
    ts: number;
    stage?: TraceStage;
    message?: string;
    runId?: string;
    type?: TraceType;
    data?: Record<string, unknown>;
}

/**
 * Union type for socket data messages
 */
export type SocketDataMessage = FlowUpdateMessage | NodeUpdateMessage | PortUpdateMessage | TraceMessage;

/**
 * Raw WebSocket message wrapper from server
 *
 * @see SocketResponse from `@lemoncloud/eureka-sockets-api`
 * @see SocketResponseTrace for trace-specific extension (adds seq, stage, message)
 */
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
