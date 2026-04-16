export * from './graph';
export * from './permissions';

export type {
    BlockDefinition,
    BlockView,
    BoolFlag,
    ConfigField,
    ConfigFieldModel,
    ConfigFieldWithDefault,
    ConfigOption,
    Connection,
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

import type {
    BlockDefinition,
    DataPacket,
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
// Node Execution State (state field - replacing status)
// ============================================================================

/**
 * NodeState - execution state of a node (frontend subset of NodeStatusType)
 *
 * Values:
 * - IDLE: Initial state, no execution started
 * - READY: All inputs ready, waiting for execution
 * - RUNNING: Currently executing
 * - COMPLETED: Execution finished successfully
 * - ERROR: Execution failed
 *
 * @note API package's NodeStatusType also includes WAITING and SKIPPED.
 * Frontend uses this narrower type for UI state management.
 */
export type NodeState = 'IDLE' | 'READY' | 'RUNNING' | 'COMPLETED' | 'ERROR';

const NODE_STATES: ReadonlySet<string> = new Set<NodeState>(['IDLE', 'READY', 'RUNNING', 'COMPLETED', 'ERROR']);

/** Type guard: narrows NodeStatusType (or any string) to frontend NodeState */
export const isNodeState = (value: string): value is NodeState => NODE_STATES.has(value);

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

// ============================================================================
// Block Definition Extension (isFrontend support)
// ============================================================================

/**
 * BlockStereo - stereotype of block for categorization (frontend subset)
 *
 * NOTE: API package's BlockStereo includes additional values ('' | '#' | '#alias').
 * Frontend uses this narrower type for UI block categorization in the Sidebar.
 */
export type BlockStereo = 'input' | 'process' | 'output';

/**
 * BlockDefinitionWithFrontend - extends BlockDefinition with isFrontend flag
 *
 * This type extends the API package's BlockDefinition to include the `isFrontend`
 * flag from the server response. When the API package is updated, this can be removed.
 *
 * @see /blocks/0/list API response
 *
 * Execution logic:
 * - `isFrontend: true` → Execute on client (use `execute` function)
 * - `isFrontend: false` → Execute on server (call POST /nodes/:id/run)
 * - `isFrontend: undefined` → Fallback to legacy BACKEND_PROCESSOR_TYPES check
 */
export interface BlockDefinitionWithFrontend extends BlockDefinition {
    /**
     * Indicates whether this block should be executed on the frontend (client-side)
     * or requires backend processing (server-side).
     *
     * - `true`: Client-side execution using the `execute` function
     * - `false`: Server-side execution via POST /nodes/:id/run API
     * - `undefined`: Use legacy fallback (BACKEND_PROCESSOR_TYPES check)
     */
    isFrontend?: boolean;

    /**
     * Block stereotype for categorization (input, process, output)
     * Used by Sidebar for grouping blocks
     */
    stereo?: BlockStereo;

    /**
     * Indicates whether this block can be executed (shows run button)
     * - `true` or `undefined`: Run button is visible (default behavior)
     * - `false`: Run button is hidden
     */
    isRunnable?: boolean;

    /**
     * The function that runs when the block triggers (client-side only)
     * This is attached by the frontend when `isFrontend: true`
     */
    execute?: (
        inputs: Record<string, DataPacket>,
        config: Record<string, unknown>,
        onProgress?: (progress: number) => void
    ) => Promise<Record<string, DataPacket>>;
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
 */
export interface FlowView extends Partial<FlowModel> {}

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
 * EdgeBody - body for edge creation/update
 */
export interface EdgeBody extends Partial<EdgeView> {}

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
 * NodeBody - body for node creation/update
 */
export interface NodeBody extends Partial<NodeView> {
    name: string;
    flowId: string;
    blockId: string;
}

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
 * Unlike PortDataResponse (from GET /nodes/:portId/port), this type
 * has nullable data field because the server may return data: null
 * when port data hasn't been populated yet.
 *
 * @example
 * {
 *   "id": "1004298:in",
 *   "nodeId": "1004298",
 *   "portId": "in",
 *   "data": null  // or { value, type, timestamp }
 * }
 */
export interface LoadFlowPortData {
    /** Full port ID (e.g., "1004298:in") */
    id: string;
    /** Parent node ID (e.g., "1004298") */
    nodeId: string;
    /** Port name/key (e.g., "in" or "out") */
    portId: string;
    /** Port data - null when not populated, DataPacket when available */
    data: DataPacket | null;
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
    /** Whether the current user can edit this flow (owner = true, guest = false) */
    isEditable?: boolean;
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
