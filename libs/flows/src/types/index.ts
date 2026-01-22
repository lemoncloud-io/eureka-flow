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

import type { EdgeData, NodeData } from '@lemoncloud/eureka-flows-api';

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
 * NodeModel - extended node model for backend
 *
 * Execution state is managed at node level:
 * - status: IDLE → RUNNING → COMPLETED/ERROR
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
 * Backend returns array format with $$ suffix
 *
 * @see eureka-flows-api POST /flows/:id/save response
 */
export interface SaveFlowView extends FlowView {
    nodes$$: NodeView[];
    edges$$: EdgeView[];
    ports$$: NodeView[];
}

/**
 * LoadFlowResult - result of loading flow snapshot
 * GET /flows/:id/load returns SaveFlowBody format
 *
 * Uses NodeData/EdgeData from API package to match backend response format.
 * - NodeData: uses object format for config, inputData, outputData
 * - EdgeData: connection data between nodes
 */
export interface LoadFlowResult extends FlowModel {
    nodes: NodeData[];
    edges: EdgeData[];
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
