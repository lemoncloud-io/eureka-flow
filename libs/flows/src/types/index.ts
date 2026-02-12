export type {
    BlockDefinition,
    BlockView,
    ConfigField,
    ConfigFieldModel,
    ConfigFieldWithDefault,
    ConfigOption,
    Connection,
    DataPacket,
    DataType,
    doPostRunBody,
    EdgeData,
    ExecutionStats,
    ListResult,
    LogEntry,
    NodeConfigItem,
    NodeData,
    NodeDataPacketItem,
    NodeStatus,
    PortDefinition,
    ProcessBody,
    ProcessResult,
    WorkflowState,
} from '@lemoncloud/eureka-flows-api';

import type { BlockDefinition, DataPacket, EdgeData, NodeData } from '@lemoncloud/eureka-flows-api';

// ============================================================================
// Block Definition Extension (isFrontend support)
// ============================================================================

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
/**
 * BlockStereo - stereotype of block for categorization
 * Matches server's BlockStereo type
 */
export type BlockStereo = 'input' | 'process' | 'output';

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
 * FlowStereo - stereotype of flow model
 */
export type FlowStereo = '' | '#' | '#template';

/**
 * FlowState - lifecycle state of flow
 */
export type FlowState = 'draft' | 'active' | 'archived';

/**
 * FlowModel - flow model for CRUD operations
 *
 * NOTE: Execution state (running/completed/error) is managed at NODE level,
 * not flow level. Each node has its own `status` field.
 * Flow only stores lifecycle state (draft/active/archived).
 */
export interface FlowModel {
    id?: string;
    stereo?: FlowStereo;
    name?: string;
    state?: FlowState;
    description?: string;
    seq?: number;
    meta?: unknown;
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
 * EdgeStereo - stereotype of edge (connection)
 */
export type EdgeStereo = '' | '#' | '#condition' | '#transform';

/**
 * Position - position on canvas
 */
export interface Position {
    x: number;
    y: number;
}

/**
 * EdgeModel - model for edge (connection) info
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
 * NodeStereo - stereotype of node
 */
export type NodeStereo = '' | '#' | '#alias';

/**
 * ConfigItem - config key-value pair for DB serialization
 */
export interface ConfigItem {
    key: string;
    val: string;
}

/**
 * DataPacketItem - data packet with port id (OpenSearch compatible)
 */
export interface DataPacketItem {
    portId: string;
    packet: {
        value: unknown;
        type: string;
        timestamp?: number;
    };
}

/**
 * PortData - data stored in a port node
 * Server uses DynamoDB-style typed values
 */
export interface PortData {
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
 * NodeModel - extended node model for backend
 *
 * Execution state is managed at node level:
 * - status: IDLE → RUNNING → COMPLETED/ERROR
 * - autoExecutionEnabled: auto-trigger on inputData change
 */
export interface NodeModel {
    id?: string;
    stereo?: NodeStereo | 'port';
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
    config$$?: ConfigItem[];
    customLabel?: string;
    description?: string;
    status?: string;
    errorMessage?: string;
    inputData$$?: DataPacketItem[];
    outputData$$?: DataPacketItem[];
    executionStats?: {
        startTime?: number;
        duration?: number;
        progress?: number;
    };
    flowId?: string;
    runId?: string;
    lastGoodOutput$$?: DataPacketItem[];
    disabled?: boolean;
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
    data$?: PortData;
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
 * LoadFlowResult - result of loading flow snapshot
 * GET /flows/:id/load returns SaveFlowBody format
 *
 * Uses NodeData/EdgeData from API package to match backend response format.
 * - NodeData: uses object format for config, inputData, outputData
 * - EdgeData: connection data between nodes
 * - channelId: WebSocket channel for real-time updates
 */
export interface LoadFlowResult extends FlowModel {
    nodes: NodeData[];
    edges: EdgeData[];
    /** WebSocket channel ID for real-time node status updates */
    channelId?: string;
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
