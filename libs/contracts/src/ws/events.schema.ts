import { z } from 'zod';

/**
 * WebSocket event schemas.
 * These define the `data` field inside the raw wrapper:
 *   { action: 'message', ts, data: <event>, channel }
 */

// ============================================================================
// Raw WebSocket message wrapper (server → client)
// ============================================================================

export const RawWsMessageSchema = z.object({
    action: z.enum(['message', 'info', 'ping', 'pong']),
    ts: z.string().optional(),
    data: z.unknown().optional(),
    channel: z.string().optional(),
});

export type RawWsMessage = z.infer<typeof RawWsMessageSchema>;

// ============================================================================
// Flow update — client should reload via GET /flows/{id}/load
// ============================================================================

export const WsFlowUpdatedSchema = z.object({
    type: z.literal('flow'),
    id: z.string(),
    timestamp: z.number(),
});

export type WsFlowUpdated = z.infer<typeof WsFlowUpdatedSchema>;

// ============================================================================
// Node update — execution state change
// ============================================================================

export const NodeStateEnum = z.enum(['IDLE', 'READY', 'RUNNING', 'COMPLETED', 'ERROR']);

export const WsNodeUpdatedSchema = z.object({
    type: z.literal('node'),
    id: z.string(),
    flowId: z.string().optional(),
    timestamp: z.number().optional(),
    no: z.number().optional(), // sequence number
    state: NodeStateEnum.optional(),
    prevState: NodeStateEnum.optional(),
    progress: z.number().min(0).max(100).optional(),
    stereo: z.number().optional(), // 0 = no additional API fetch needed
    // deprecated — still sent for compat
    status: z.string().optional(),
    prevStatus: z.string().optional(),
});

export type WsNodeUpdated = z.infer<typeof WsNodeUpdatedSchema>;

// ============================================================================
// Port update — port data changed, client fetches via GET /nodes/{portId}/port
// ============================================================================

export const WsPortUpdatedSchema = z.object({
    type: z.literal('node/port'),
    id: z.string(), // "nodeId:direction@portName"
    flowId: z.string().optional(),
    timestamp: z.number().optional(),
    no: z.number().optional(),
});

export type WsPortUpdated = z.infer<typeof WsPortUpdatedSchema>;

// ============================================================================
// Run execution events (server → client, broadcast during async execution)
// These are higher-level events on top of the low-level node updates.
// ============================================================================

export const WsRunStartedSchema = z.object({
    type: z.literal('run.started'),
    runId: z.string(),
    flowId: z.string(),
    status: z.literal('RUNNING'),
    timestamp: z.number(),
});

export const WsRunCompletedSchema = z.object({
    type: z.literal('run.completed'),
    runId: z.string(),
    flowId: z.string(),
    status: z.literal('COMPLETED'),
    timestamp: z.number(),
});

export const WsRunFailedSchema = z.object({
    type: z.literal('run.failed'),
    runId: z.string(),
    flowId: z.string(),
    status: z.literal('FAILED'),
    failedNodeId: z.string().optional(),
    errorMessage: z.string().optional(),
    timestamp: z.number(),
});

export const WsNodeStartedSchema = z.object({
    type: z.literal('node.started'),
    runId: z.string(),
    nodeId: z.string(),
    status: z.literal('RUNNING'),
    timestamp: z.number(),
});

export const WsNodeProgressSchema = z.object({
    type: z.literal('node.progress'),
    runId: z.string(),
    nodeId: z.string(),
    progress: z.number().min(0).max(100),
    message: z.string().optional(),
    timestamp: z.number(),
});

export const WsNodeCompletedSchema = z.object({
    type: z.literal('node.completed'),
    runId: z.string(),
    nodeId: z.string(),
    status: z.literal('COMPLETED'),
    timestamp: z.number(),
});

export const WsNodeFailedSchema = z.object({
    type: z.literal('node.failed'),
    runId: z.string(),
    nodeId: z.string(),
    status: z.literal('FAILED'),
    errorCode: z.string().optional(),
    errorMessage: z.string().optional(),
    timestamp: z.number(),
});

export const WsAssetCreatedSchema = z.object({
    type: z.literal('asset.created'),
    runId: z.string(),
    nodeId: z.string(),
    assetId: z.string(),
    assetType: z.string(),
    publicUrl: z.string().optional(),
    timestamp: z.number(),
});

export type WsRunStarted = z.infer<typeof WsRunStartedSchema>;
export type WsRunCompleted = z.infer<typeof WsRunCompletedSchema>;
export type WsRunFailed = z.infer<typeof WsRunFailedSchema>;
export type WsNodeStarted = z.infer<typeof WsNodeStartedSchema>;
export type WsNodeProgress = z.infer<typeof WsNodeProgressSchema>;
export type WsNodeCompleted = z.infer<typeof WsNodeCompletedSchema>;
export type WsNodeFailed = z.infer<typeof WsNodeFailedSchema>;
export type WsAssetCreated = z.infer<typeof WsAssetCreatedSchema>;

// ============================================================================
// Union of all data events
// ============================================================================

export const WsDataEventSchema = z.discriminatedUnion('type', [
    WsFlowUpdatedSchema,
    WsNodeUpdatedSchema,
    WsPortUpdatedSchema,
    WsRunStartedSchema,
    WsRunCompletedSchema,
    WsRunFailedSchema,
    WsNodeStartedSchema,
    WsNodeProgressSchema,
    WsNodeCompletedSchema,
    WsNodeFailedSchema,
    WsAssetCreatedSchema,
]);

export type WsDataEvent = z.infer<typeof WsDataEventSchema>;
