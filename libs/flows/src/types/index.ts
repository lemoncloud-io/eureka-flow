// Re-export types from the API package
export type {
    BlockDefinition,
    BlockView,
    ConfigField,
    Connection,
    DataPacket,
    ListResult,
    LogEntry,
    NodeData,
    PortDefinition,
    ProcessBody,
    ProcessResult,
    WorkflowState,
    // New types from PR #1
    EdgeData,
    NodeConfigItem,
    NodeDataPacketItem,
    ExecutionStats,
    DataType,
    NodeStatus,
    ConfigOption,
} from '@lemoncloud/eureka-flows-api';

// ============================================================================
// Flow Types
// ============================================================================

/**
 * FlowStereo - stereotype of flow model
 */
export type FlowStereo = '' | '#' | '#template';

/**
 * FlowState - lifecycle state of flow
 */
export type FlowState = 'draft' | 'active' | 'archived';

/**
 * FlowExecutionStatus - runtime execution status of flow
 */
export type FlowExecutionStatus = 'idle' | 'running' | 'completed' | 'error';

/**
 * FlowModel - flow model for CRUD operations
 */
export interface FlowModel {
    id?: string;
    stereo?: FlowStereo;
    name?: string;
    state?: FlowState;
    executionStatus?: FlowExecutionStatus;
    description?: string;
    activeRunId?: string;
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

// ============================================================================
// Edge Types
// ============================================================================

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

// ============================================================================
// Node Types (Extended)
// ============================================================================

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

// ============================================================================
// Execution Types
// ============================================================================

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

// ============================================================================
// Snapshot Types
// ============================================================================

/**
 * SnapShotResult - result of flow snapshot
 */
export interface SnapShotResult extends FlowModel {
    nodes: NodeView[];
    edges: EdgeView[];
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * ApiListResult - generic list result from API
 */
export interface ApiListResult<T> {
    list: T[];
    total?: number;
    page?: number;
    limit?: number;
}
