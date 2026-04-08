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
// Union of all data events
// ============================================================================

export const WsDataEventSchema = z.discriminatedUnion('type', [
    WsFlowUpdatedSchema,
    WsNodeUpdatedSchema,
    WsPortUpdatedSchema,
]);

export type WsDataEvent = z.infer<typeof WsDataEventSchema>;
