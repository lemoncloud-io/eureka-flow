import { z } from 'zod';

/**
 * HTTP contracts for /nodes/* endpoints.
 *
 * NodeView/NodeData internal shape is owned by @lemoncloud/eureka-flows-api.
 * These schemas define the HTTP envelope only.
 */

// ============================================================================
// POST /nodes/0/list
// Caller: libs/flows/src/api/nodes.ts → listNodes()
// ============================================================================

export const NodeListRequestSchema = z.object({
    flowId: z.string().min(1),
});

export const NodeListResponseSchema = z.object({
    list: z.array(z.record(z.unknown())),
    total: z.number().optional(),
});

export type NodeListRequest = z.infer<typeof NodeListRequestSchema>;
export type NodeListResponse = z.infer<typeof NodeListResponseSchema>;

// ============================================================================
// GET /nodes/{id}
// Caller: libs/flows/src/api/nodes.ts → getNode()
// ============================================================================

export const NodeGetParamsSchema = z.object({
    id: z.string().min(1),
});

// Response is a single NodeView (record)
export const NodeGetResponseSchema = z.record(z.unknown());

// ============================================================================
// POST /nodes/0 — create
// Caller: libs/flows/src/api/nodes.ts → createNode()
// ============================================================================

export const NodeCreateRequestSchema = z
    .object({
        name: z.string().min(1),
        flowId: z.string().min(1),
        blockId: z.string().min(1),
    })
    .passthrough(); // allow extra NodeBody fields

export const NodeCreateResponseSchema = z.record(z.unknown()); // NodeView

// ============================================================================
// POST /nodes/{id}/upsert?flowId={flowId}
// Caller: libs/flows/src/api/nodes.ts → upsertNode(), upsertPortNode()
// ============================================================================

export const NodeUpsertParamsSchema = z.object({
    id: z.string().min(1), // "0" for auto-assign
});

export const NodeUpsertQuerySchema = z.object({
    flowId: z.string().min(1),
});

// Body can be either:
// 1. Direct node fields: { config, output, blockId, position, ... }
// 2. Port node batch: { nodes: [{ stereo: 'port', parentId, direction, name, data$ }] }
export const NodeUpsertRequestSchema = z.record(z.unknown());

export const NodeUpsertResponseSchema = z.object({
    nodes: z.array(z.record(z.unknown())),
    edges: z.array(z.record(z.unknown())).optional(),
});

export type NodeUpsertResponse = z.infer<typeof NodeUpsertResponseSchema>;

// ============================================================================
// POST /nodes/{nodeId}/run[?async&force&propagate=0]
// Caller: libs/flows/src/api/nodes.ts → runNode()
// ============================================================================

export const NodeRunParamsSchema = z.object({
    nodeId: z.string().min(1),
});

export const NodeRunQuerySchema = z.object({
    async: z.literal('').optional(), // flag — presence means true
    force: z.literal('').optional(),
    propagate: z.enum(['0', '1']).optional(),
});

export const NodeRunRequestSchema = z
    .object({
        config: z.record(z.string()).optional(),
        output: z
            .record(
                z.object({
                    value: z.unknown(),
                    type: z.string(),
                    timestamp: z.number().optional(),
                })
            )
            .optional(),
    })
    .passthrough();

export const NodeRunResponseSchema = z.record(z.unknown()); // NodeView

// ============================================================================
// DELETE /nodes/{id}
// Caller: libs/flows/src/api/nodes.ts → deleteNode()
// ============================================================================

export const NodeDeleteParamsSchema = z.object({
    id: z.string().min(1),
});

// ============================================================================
// GET /nodes/{portId}/port?direction=in|out
// Caller: libs/flows/src/api/nodes.ts → getPortData()
// ============================================================================

export const PortGetParamsSchema = z.object({
    portId: z.string().min(1),
});

export const PortGetQuerySchema = z.object({
    direction: z.enum(['in', 'out']),
});

export const PortGetResponseSchema = z.object({
    id: z.string(),
    nodeId: z.string(),
    portId: z.string(),
    direction: z.enum(['in', 'out']),
    data: z.object({
        value: z.unknown(),
        type: z.string(),
        timestamp: z.number().optional(),
    }),
});

export type PortGetResponse = z.infer<typeof PortGetResponseSchema>;

// ============================================================================
// GET /nodes/0/image?s3Url=...
// Caller: libs/flows/src/api/nodes.ts → getImageFromS3()
// ============================================================================

export const ImageGetQuerySchema = z.object({
    s3Url: z.string().startsWith('s3://'),
});

export const ImageGetResponseSchema = z.object({
    body: z.string(), // base64
    headers: z.object({
        'Content-Type': z.string(),
    }),
});

// ============================================================================
// GET /nodes/0/image-info?s3Url=...
// Caller: libs/flows/src/api/nodes.ts → getImageInfo()
// ============================================================================

export const ImageInfoResponseSchema = z.object({
    s3Url: z.string(),
    parsed: z.object({
        bucket: z.string(),
        key: z.string(),
        md5: z.string(),
        sizeKb: z.number(),
        ext: z.string(),
        prefix: z.string().optional(),
    }),
    allowed: z.boolean(),
});
