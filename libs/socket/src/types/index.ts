/**
 * WebSocket types for flow execution updates
 * @packageDocumentation
 */

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
}

/**
 * Flow node status update message from WebSocket
 *
 * @example
 * {
 *   "type": "node",
 *   "id": "isff9fs10",
 *   "flowId": "1000036",
 *   "nodeId": "isff9fs10",
 *   "status": "COMPLETED",
 *   "errorMessage": "",
 *   "executionStats": "{\"startTime\":1769582605128,\"duration\":1009,\"progress\":100}",
 *   "activeRunId": "",
 *   "timestamp": 1769582611407
 * }
 */
export interface FlowNodeMessage {
    type: 'node';
    id: string;
    flowId: string;
    nodeId: string;
    status: 'IDLE' | 'RUNNING' | 'COMPLETED' | 'ERROR';
    errorMessage?: string;
    /** JSON string of ExecutionStats */
    executionStats?: string;
    activeRunId?: string;
    timestamp: number;
    /** Output data from backend execution */
    outputData$$?: Array<{
        portId: string;
        packet: { value: unknown; type: string; timestamp?: number };
    }>;
}

/**
 * Parsed execution stats from FlowNodeMessage
 */
export interface ExecutionStats {
    startTime?: number;
    duration?: number;
    progress?: number;
}

/**
 * Raw WebSocket message wrapper from server
 */
export interface RawSocketMessage {
    action: 'message' | 'info' | 'ping' | 'pong';
    ts?: string;
    data?: FlowNodeMessage | unknown;
    channel?: string;
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
