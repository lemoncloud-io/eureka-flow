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

// `ProgressEvent` is aliased because the DOM declares one too, and this file is read in a
// browser context where that is the name a reader expects.
import type {
    LogFrameEntry,
    NodeEvent,
    PortEvent,
    ProgressEvent as ProgressFrameData,
    TraceFrameData,
} from '@flows/engine';
import type { SocketEvent, SocketNodeEvent, SocketTraceEvent, TraceStage } from '@flows/flows';
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
 * Extends `SocketEvent` for consistent field naming (`ts` instead of `timestamp`).
 *
 * @example
 * {
 *   "type": "node/port",
 *   "id": "1000637:in@in",
 *   "flowId": "1000088",
 *   "ts": 1771810838212,
 *   "no": 42
 * }
 *
 * ID format: "nodeId:direction@portName"
 * - nodeId: parent node ID (e.g., "1000637")
 * - direction: "in" or "out"
 * - portName: port identifier (e.g., "in", "out", "data")
 */
export interface PortUpdateMessage extends SocketEvent {
    type: 'node/port';
    /** (optional) id of flow */
    flowId?: string;
    /** Run correlation ID — links port update to a specific execution run */
    runId?: string;
}

/**
 * Product progress notification streamed from codes-goods-api via eureka-sockets-api.
 * Wrapped on the wire as { action: 'progress', id, data: ProductProgressMessage }.
 *
 * @example
 * {
 *   "type": "product-progress",
 *   "productId": "p-1234",
 *   "progress$": { "upload": 100, "refactor": 60, "build": 20, "deploy": 0 },
 *   "state": "building",
 *   "timestamps": [1771810800000, 1771810820000, 1771810838212]
 * }
 */
export interface ProductProgressMessage {
    type: 'product-progress';
    productId: string;
    progress$: Record<string, number>;
    state: string;
    timestamps?: number[];
}

export interface ProgressEnvelopeMessage extends SocketEvent {
    type: `progress:${string}`;
    data?: {
        status?: string;
        percent?: number;
        step?: number;
        totalSteps?: number;
        label?: string;
        error?: string;
        seq?: number;
        ts?: number;
        /** service-defined extras — `product$` carries the live product view from codes-goods-api */
        meta?: { product$?: Record<string, unknown> } & Record<string, unknown>;
    };
}

export interface LogEnvelopeMessage extends SocketEvent {
    type: `log:${string}`;
    data?: {
        /** reporter identity (per-invocation on server side) */
        source?: string;
        entries?: {
            level?: string;
            message?: string;
            ts?: number;
            seq?: number;
            json?: Record<string, unknown>;
        }[];
    };
}

/**
 * Union type for socket data messages
 */
export type SocketDataMessage =
    | FlowUpdateMessage
    | SocketNodeEvent
    | PortUpdateMessage
    | SocketTraceEvent
    | ProductProgressMessage;

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

// ============================================================================
// Parsed frame payloads handed to subscribers
// ============================================================================
// Moved out of `useInitFlowSocket` so the dispatcher can be tested without React.
//
// Each of these is the engine's event plus what only a subscriber needs. They extend
// rather than restate it because they are handed straight to the reducer — `NodeEvent`
// is literally what `reduceNodeEvent` takes — and a field added to an engine event has
// to reach the callback that carries it. Restating the shapes made that a hand-sync.

/**
 * Trace update info parsed from WebSocket message
 * Used by onTraceUpdate callback for agent block trace display
 */
export interface TraceUpdateInfo extends TraceFrameData {
    /** Execution stage (from SocketTraceEvent.stage), narrowed to the stages the UI knows */
    stage?: TraceStage;
}

export interface NodeUpdateInfo extends NodeEvent {
    timestamp?: number;
    /** Computed: true if id contains ':' (port update piggybacked on node event) */
    isPort: boolean;
}

/**
 * Port update info parsed from WebSocket message
 * Used by onPortUpdate callback for port data synchronization
 */
export interface PortUpdateInfo extends PortEvent {
    /** Port name/key (e.g., "in", "out", "data") — always resolved by the parser */
    portName: string;
    /** Port direction (from @suffix: "in" or "out") */
    direction?: 'in' | 'out';
}

/**
 * Progress snapshot info parsed from a lemon-model `progress:*` envelope.
 * Emitted by eureka-flows-api processors and codes-goods-api deploy steps.
 */
export interface ProgressUpdateInfo extends ProgressFrameData {
    label?: string;
    error?: string;
    ts?: number;
    /** Live product view from codes-goods-api (merge into block out data) */
    product$?: Record<string, unknown>;
}

/**
 * One log line parsed from a lemon-model `log:*` envelope batch.
 */
export interface LogTraceEntryInfo extends LogFrameEntry {
    /** Node ID of the traced block */
    nodeId: string;
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
