export * from './apps';
export * from './graph';
export * from './permissions';
export * from './process';
export * from './uploadHtml';

export type {
    BlockDefinition,
    BlockView,
    ConfigField,
    ConfigFieldModel,
    ConfigFieldWithDefault,
    ConfigOption,
    DataPacket,
    DataType,
    doGetImageParam,
    doGetImageV2Param,
    doPostRunBody,
    doPostRunParam,
    doPostStopParam,
    EdgeData,
    EdgeStereo,
    ExecutionStats,
    FlowExecutionStatus,
    FlowState,
    FlowStereo,
    ListResult,
    LogEntry,
    NodeConfigItem,
    NodeData,
    NodeDataPacketItem,
    NodeStereo,
    NodeStatus,
    NodeStatusType,
    PortDefinition,
    PortVariant,
    Position,
    ProcessBody,
    ProcessResult,
    WorkflowState,
} from '@lemoncloud/eureka-flows-api';

// ============================================================================
// Socket Event Types (will move to @lemoncloud/eureka-flows-api in next release)
// ============================================================================

/**
 * Common event type for WebSocket messages
 */
export interface SocketEvent {
    /** type of node (ex: node, node/port, trace) */
    type: string;
    /** id of node */
    id: string;
    /** message sequence (as no) */
    no?: number;
    /** (optional) timestamp value */
    ts?: number;
}

/**
 * type: `SocketNodeEvent`
 * - event from web-socket service
 */
export interface SocketNodeEvent extends SocketEvent {
    /** (optional) id of flow */
    flowId?: string;
    /** (optional) id of run in current */
    runId?: string;
    /** major state (ex: READY, ERROR, RUNNING) */
    state: NodeStatusType;
    /** minor stage (ex: enter, final, progress) */
    stage?: RunNodeStage;
    /** (optional) the percentage progress to show */
    progress?: number;
    /** (optional) error message if `state=ERROR` */
    error?: string;
}

/**
 * type: `SocketTraceEvent`
 * - event to notify internal trace event.
 */
export interface SocketTraceEvent extends SocketEvent {
    /** trace sequence no */
    seq: number;
    /** run state */
    state?: string;
    /** stage of trace */
    stage: CodexTraceStage;
    /** detailed message */
    message: string;
    /** (optional) running id */
    runId?: string;
    /** additional data to info */
    data?: Record<string, unknown>;
}

/** Stages for structured tracing. */
export type CodexTraceStage =
    | 'run'
    | 'planner'
    | 'step'
    | 'tool'
    | 'approval'
    | 'reflector'
    | 'finalizer'
    | 'trace'
    | 'error'
    | 'runtime';

/** state of run condition */
export type CodexRunStatus = 'idle' | 'running' | 'waiting_for_approval' | 'completed' | 'failed';

/** minor stage of node run */
export type RunNodeStage = 'enter' | 'final' | 'progress' | (string & {});

import type { NodeState, PortRow } from '@flows/engine';
import type {
    EdgeData,
    EdgeStereo,
    FlowState,
    FlowStereo,
    NodeConfigItem,
    NodeData,
    NodeDataPacketItem,
    NodeStatusType,
    NodeStereo,
    Position,
} from '@lemoncloud/eureka-flows-api';

// ============================================================================
// Graph Core Types (owned by @flows/engine)
// ============================================================================

// Node execution state and the block-definition extension live in the engine, which is
// where the graph rules that read them live. Re-exported so `@flows/flows` keeps the same
// surface it had before the engine existed.
export { isNodeState } from '@flows/engine';

export type {
    BlockDefinitionWithFrontend,
    BlockStereo,
    GraphEdge,
    GraphLike,
    GraphNode,
    GraphSnapshot,
    NodeState,
} from '@flows/engine';

/**
 * TraceStage - agent block execution stages for trace messages
 * Extends CodexTraceStage with open string fallback for forward compatibility
 */
export type TraceStage = CodexTraceStage | (string & {});

/**
 * TraceType - specific event types within agent trace logs
 * Known types are listed explicitly; string fallback allows forward compatibility
 */
export type TraceType =
    | 'run_start'
    | 'run_end'
    | 'skill_selected'
    | 'planner_call'
    | 'step_start'
    | 'step_end'
    | 'tool_start'
    | 'tool_end'
    | 'error'
    | (string & {});

/**
 * TraceEntry - a single trace log entry from agent block execution
 *
 * @example
 * {
 *   "traceId": "f6684e2b-...",
 *   "seq": 1,
 *   "ts": 1774517002827,
 *   "stage": "run",
 *   "message": "Run started",
 *   "runId": "f6684e2b-...",
 *   "type": "run_start",
 *   "data": { "userInput": "customer check" }
 * }
 */
export interface TraceEntry {
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
 * FlowModel - flow model for CRUD operations
 *
 * NOTE: Uses FlowStereo and FlowState from @lemoncloud/eureka-flows-api.
 * Execution state (running/completed/error) is managed at NODE level,
 * not flow level. Each node has its own `status` field.
 * Flow only stores lifecycle state (draft/active/archived).
 */
export interface FlowModel {
    id?: string;
    stereo?: FlowStereo;
    name?: string;
    state?: FlowState;
    description?: string;
    isPublic?: boolean;
    /** Thumbnail image URL (s3:// or http) */
    thumbnail?: string;
    seq?: number;
    meta?: unknown;
    /** Node IDs associated with this flow (populated in list responses) */
    nodeIds$$?: string[];
    /** Edge IDs associated with this flow (populated in list responses) */
    edgeIds$$?: string[];
    createdAt?: string;
    updatedAt?: string;
}

/**
 * FlowView - view representation of flow model
 *
 * @see eureka-flows-api v0.26.618 — list/load responses include per-flow permission flags.
 */
export interface FlowView extends Partial<FlowModel> {
    /** Whether the current user owns this flow (sid+uid match). Only Owners may change structure/metadata. */
    hasOwned?: boolean;
    /** Whether the current user has edit permission (true for Owner AND same-workspace Editor). */
    isEditable?: boolean;
}

/**
 * FlowBody - body for flow creation/update
 */
export interface FlowBody extends Partial<FlowView> {}

/**
 * EdgeModel - model for edge (connection) info
 *
 * Uses EdgeStereo and Position from @lemoncloud/eureka-flows-api.
 */
export interface EdgeModel {
    id?: string;
    stereo?: EdgeStereo;
    label?: string;
    flowId?: string;
    sourceNodeId?: string;
    sourcePortId?: string;
    targetNodeId?: string;
    targetPortId?: string;
    condition?: string;
    priority?: number;
    position?: Position;
    disabled?: boolean;
    meta?: unknown;
    createdAt?: string;
    updatedAt?: string;
}

/**
 * EdgeView - view representation of edge model
 */
export interface EdgeView extends Partial<EdgeModel> {}

/**
 * PortVariantData - DynamoDB-style typed values for port data storage
 *
 * NOTE: This is the frontend version of API's PortVariant.
 * Difference: uses `timestamp` field (frontend convention) vs API's `ts` field.
 * Server accepts both field names.
 *
 * @see PortVariant from @lemoncloud/eureka-flows-api for the server model version
 */
export interface PortVariantData {
    /** String value (for text, image types) */
    S?: string;
    /** Number value (integer) */
    N?: number;
    /** Float value */
    F?: number;
    /** Stringified JSON (for json, any types) */
    M?: string;
    /** Timestamp when data was produced */
    timestamp?: number;
}

/**
 * PortDataResponse - response from GET /nodes/:portId/port API
 *
 * @example
 * {
 *   "id": "1000882:in@in",
 *   "nodeId": "1000882",
 *   "portId": "in",
 *   "direction": "in",
 *   "data": {
 *     "value": "Hello World",
 *     "type": "text",
 *     "timestamp": 1771898187560
 *   }
 * }
 */
export interface PortDataResponse {
    /** Full port ID (e.g., "1000882:in@in") */
    id: string;
    /** Parent node ID (e.g., "1000882") */
    nodeId: string;
    /** Port name/key (e.g., "in") */
    portId: string;
    /** Port direction */
    direction: 'in' | 'out';
    /** Port data in DataPacket-like format */
    data: {
        value: unknown;
        type: string;
        timestamp?: number;
    };
}

/**
 * NodeModel - extended node model for backend
 *
 * Uses NodeStereo, NodeConfigItem, NodeDataPacketItem from @lemoncloud/eureka-flows-api.
 *
 * Execution state is managed at node level:
 * - state: IDLE → READY → RUNNING → COMPLETED/ERROR (new field)
 * - status: IDLE → RUNNING → COMPLETED/ERROR (deprecated, use state)
 * - autoExecutionEnabled: auto-trigger on inputData change
 */
export interface NodeModel {
    id?: string;
    stereo?: NodeStereo;
    name?: string;
    url?: string;
    image?: string;
    thumb?: string;
    tags?: string[];
    meta?: unknown;
    blockId?: string;
    block$?: BlockHead;
    input$$?: Array<{ id: string; label: string; type: string; required?: boolean }>;
    output$$?: Array<{ id: string; label: string; type: string; required?: boolean }>;
    position?: Position;
    config$$?: NodeConfigItem[];
    customLabel?: string;
    description?: string;
    /**
     * Node execution state (new field - preferred)
     * Values: 'IDLE' | 'READY' | 'RUNNING' | 'COMPLETED' | 'ERROR'
     */
    state?: NodeState;
    /**
     * @deprecated Use `state` instead. Kept for backward compatibility.
     */
    status?: string;
    /** Server-side error message (preferred) */
    error?: string;
    /** @deprecated Use `error` instead. */
    errorMessage?: string;
    inputData$$?: NodeDataPacketItem[];
    outputData$$?: NodeDataPacketItem[];
    executionStats?: {
        startTime?: number;
        duration?: number;
        progress?: number;
    };
    flowId?: string;
    runId?: string;
    lastGoodOutput$$?: NodeDataPacketItem[];
    /**
     * If true, node auto-executes when inputData.timestamp changes
     * This enables reactive chain execution
     */
    autoExecutionEnabled?: boolean;
    createdAt?: string;
    updatedAt?: string;

    // ============================================================================
    // Port-specific fields (when stereo === 'port')
    // ============================================================================
    /** Parent node ID (for port nodes) */
    parentId?: string;
    /** Port direction */
    direction?: 'in' | 'out';
    /** Data type of the port */
    dataType?: string;
    /** Port data (for port nodes) */
    data$?: PortVariantData;
    /** Child number for port node */
    childNo?: number;

    // ============================================================================
    // isFrontend flag (from server response)
    // ============================================================================
    /**
     * If 1, this is a frontend node (executes on client)
     * If 0 or undefined, this is a backend node (executes on server)
     */
    isFrontend?: 0 | 1;
}

/**
 * BlockHead - common head of block model
 */
export interface BlockHead {
    id?: string;
    name?: string;
}

/**
 * NodeView - view representation of node model
 */
export interface NodeView extends Partial<NodeModel> {}

/**
 * InputOverrideItem - input override item for execution
 */
export interface InputOverrideItem {
    portId: string;
    packet: {
        value: unknown;
        type: string;
        timestamp?: number;
    };
}

/**
 * doPostRunParam - parameters for flow run endpoint
 */
export interface RunFlowParams {
    nodeId: string;
    propagate?: boolean;
}

/**
 * doPostRunBody - body for flow run endpoint
 */
export interface RunFlowBody {
    inputOverrides?: InputOverrideItem[];
}

/**
 * doPostStopParam - parameters for flow stop endpoint
 */
export interface StopFlowParams {
    nodeId?: string;
}

/**
 * SaveFlowBody - body for saving flow snapshot
 * Extends WorkflowState format: { nodes: NodeData[], edges: EdgeData[] }
 *
 * @see eureka-flows-api POST /flows/:id/save
 */
export interface SaveFlowBody {
    nodes: NodeData[];
    edges: EdgeData[];
    /** @deprecated Use edges instead */
    connections?: EdgeData[];
}

/**
 * SaveFlowView - response from save flow snapshot
 *
 * Server v0.26.213+ returns both formats:
 * - `nodes`, `edges`, `ports` (preferred)
 * - `nodes$$`, `edges$$`, `ports$$` (deprecated)
 *
 * @see eureka-flows-api POST /flows/:id/save, /upsert, /load response
 */
export interface SaveFlowView extends FlowView {
    /** List of nodes (preferred) */
    nodes?: NodeData[];
    /** List of edges (preferred) */
    edges?: EdgeData[];
    /** List of ports (preferred) */
    ports?: NodeView[];

    /** @deprecated use `nodes` instead */
    nodes$$?: NodeView[];
    /** @deprecated use `edges` instead */
    edges$$?: EdgeView[];
    /** @deprecated use `ports` instead */
    ports$$?: NodeView[];
}

/**
 * UpsertNodeResult - response from node upsert endpoint
 * POST /nodes/:id/upsert?flowId=<flowId>
 *
 * Response uses SaveFlowView format (no $$ suffix):
 * - nodes: NodeData[] (created/updated nodes with server-assigned IDs)
 * - edges: EdgeData[] (created/updated edges with server-assigned IDs)
 *
 * @see eureka-flows-api POST /nodes/:id/upsert response
 */
export interface UpsertNodeResult {
    nodes: NodeData[];
    edges?: EdgeData[];
}

/**
 * LoadFlowPortData - port data from GET /flows/:id/load response
 *
 * Three-state data field:
 * - `DataPacket` — port has data (e.g., `{ value: "Hello", type: "text", timestamp: ... }`)
 * - `null` — server confirms port is empty (no fetch needed)
 * - `undefined` (absent) — server didn't include data; fetch via `getPortData()` in background
 *
 * @example
 * {
 *   "id": "1008730:out",
 *   "nodeId": "1008730",
 *   "portId": "out",
 *   "direction": "out",
 *   "data": { "value": "Hello Eureka", "type": "text", "timestamp": 1776746792954 }
 * }
 */
export interface LoadFlowPortData extends PortRow {
    /** Full port ID (e.g., "1008730:out") */
    id: string;
    /** Port direction from server response */
    direction?: 'in' | 'out';
}

/**
 * LoadFlowResult - result of loading flow snapshot
 * GET /flows/:id/load returns SaveFlowBody format
 *
 * Uses NodeData/EdgeData from API package to match backend response format.
 * - NodeData: uses object format for config, inputData, outputData
 * - EdgeData: connection data between nodes
 * - LoadFlowPortData: port data with current values (may be null)
 * - channelId: WebSocket channel for real-time updates
 */
export interface LoadFlowResult extends FlowModel {
    nodes: NodeData[];
    edges: EdgeData[];
    /** Port data with current values for input/output ports (data may be null) */
    ports?: LoadFlowPortData[];
    /** WebSocket channel ID for real-time node status updates */
    channelId?: string;
    /** Whether the current user has edit permission (true for Owner AND same-workspace Editor) */
    isEditable?: boolean;
    /** Whether the current user owns this flow (sid+uid match). Only Owners may change structure/metadata. */
    hasOwned?: boolean;
}

/**
 * ApiListResult - generic list result from API
 */
export interface ApiListResult<T> {
    list: T[];
    total?: number;
    page?: number;
    limit?: number;
}

/**
 * API error codes
 */
export type ApiErrorCode =
    | 'NETWORK_ERROR'
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'VALIDATION_ERROR'
    | 'SERVER_ERROR'
    | 'TIMEOUT'
    | 'UNKNOWN';

/**
 * Structured API error
 */
export interface ApiError {
    code: ApiErrorCode;
    message: string;
    status?: number;
    details?: Record<string, unknown>;
}

/**
 * Flow-specific error codes
 */
export type FlowErrorCode =
    | 'FLOW_NOT_FOUND'
    | 'NODE_NOT_FOUND'
    | 'EDGE_NOT_FOUND'
    | 'EXECUTION_FAILED'
    | 'EXECUTION_TIMEOUT'
    | 'INVALID_CONNECTION'
    | 'CIRCULAR_DEPENDENCY';

/**
 * Flow execution error
 */
export interface FlowExecutionError {
    code: FlowErrorCode;
    message: string;
    nodeId?: string;
    flowId?: string;
    details?: Record<string, unknown>;
}

/**
 * Type guard for ApiError
 */
export const isApiError = (error: unknown): error is ApiError => {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        'message' in error &&
        typeof (error as ApiError).code === 'string' &&
        typeof (error as ApiError).message === 'string'
    );
};

/**
 * Type guard for FlowExecutionError
 */
export const isFlowExecutionError = (error: unknown): error is FlowExecutionError => {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        'message' in error &&
        typeof (error as FlowExecutionError).code === 'string' &&
        typeof (error as FlowExecutionError).message === 'string'
    );
};

// ============================================================================
// Flow Metadata API Types (v0.26.126)
// ============================================================================

/**
 * UpdateFlowBody - body for updating flow metadata
 * POST /flows/:id
 *
 * @see eureka-flows-api v0.26.126
 */
export interface UpdateFlowBody {
    name?: string;
    description?: string;
    isPublic?: boolean;
    /** Base64 data URL for thumbnail image */
    thumbnail?: string;
}

// ============================================================================
// Image API Types (v0.26.126)
// ============================================================================

/**
 * S3ImageInfo - parsed S3 URL information
 * GET /nodes/0/image-info response
 *
 * @see eureka-flows-api v0.26.126
 */
export interface S3ImageInfo {
    s3Url: string;
    parsed: {
        bucket: string;
        key: string;
        md5: string;
        sizeKb: number;
        ext: string;
        prefix?: string;
    };
    allowed: boolean;
}

/**
 * BinaryImageResponse - response from image proxy endpoint
 * GET /nodes/0/image response
 *
 * @see eureka-flows-api v0.26.126
 */
export interface BinaryImageResponse {
    $binary: true;
    statusCode: number;
    headers: {
        'Content-Type': string;
        'Content-Length': string;
        'Cache-Control': string;
        ETag: string;
    };
    body: string; // base64 encoded
    isBase64Encoded: true;
}

// ============================================================================
// System Info API Types
// ============================================================================

/**
 * SystemComponent - component version info from backend
 * GET / (root endpoint) response
 */
export interface SystemComponent {
    name: string;
    version: string;
}

/**
 * SystemInfo - system information response
 * GET / (root endpoint)
 */
export interface SystemInfo {
    components: SystemComponent[];
}

// ============================================================================
// Execution Stack (Run Context)
// ============================================================================

/** Port update recorded within a run context */
export interface RunPortUpdate {
    portId: string;
    portName: string;
    no: number;
    timestamp: number;
}

/** Single execution context identified by runId */
export interface RunContext {
    runId: string;
    nodeId: string;
    state: 'RUNNING' | 'COMPLETED' | 'ERROR';
    startedAt?: number;
    completedAt?: number;
    traces: TraceEntry[];
    portUpdates: RunPortUpdate[];
    error?: string;
}

// ============================================================================
// Profile API Types
// ============================================================================

/** A workspace (tenant) the session belongs to, from GET /flows/0/profile. */
export interface Workspace {
    id: string;
    name: string;
    stereo: string; // adv | dev | etc.
}

/** A project within the workspace, from GET /flows/0/profile. */
export interface Project {
    id: string;
    name: string;
    stereo: string; // adv | dev | etc.
}

/** Response from GET /flows/0/profile */
export interface ProfileResponse {
    sid: string;
    uid: string;
    geminiApiKey?: string;
    openaiApiKey?: string;
    /**
     * Whether the workspace has ≥1 AI API key configured (server-authoritative).
     * Enables the "use own API key vs use credits" run-mode choice. Server v0.26.618.
     */
    useApiKey?: boolean;
    /** Workspace the session belongs to. Server-authoritative; optional for backward compat. */
    workspace$?: Workspace;
    /** Project within the workspace. Server-authoritative; optional for backward compat. */
    project$?: Project;
}
