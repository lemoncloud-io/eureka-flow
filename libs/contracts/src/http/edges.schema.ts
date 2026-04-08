import { z } from 'zod';

/**
 * HTTP contracts for /edges/* endpoints.
 * EdgeView internal shape owned by @lemoncloud/eureka-flows-api.
 */

// ============================================================================
// POST /edges/0/list
// Caller: libs/flows/src/api/edges.ts → listEdges()
// ============================================================================

export const EdgeListRequestSchema = z.object({
    flowId: z.string().min(1),
});

export const EdgeListResponseSchema = z.object({
    list: z.array(z.record(z.unknown())),
    total: z.number().optional(),
});

export type EdgeListRequest = z.infer<typeof EdgeListRequestSchema>;
export type EdgeListResponse = z.infer<typeof EdgeListResponseSchema>;

// ============================================================================
// GET /edges/{id}
// ============================================================================

export const EdgeGetParamsSchema = z.object({
    id: z.string().min(1),
});

export const EdgeGetResponseSchema = z.record(z.unknown()); // EdgeView

// ============================================================================
// POST /edges/0 — create
// POST /edges/{id} — update
// Body: EdgeBody (partial EdgeView)
// ============================================================================

export const EdgeBodySchema = z
    .object({
        stereo: z.string().optional(),
        label: z.string().optional(),
        flowId: z.string().optional(),
        sourceNodeId: z.string().optional(),
        sourcePortId: z.string().optional(),
        targetNodeId: z.string().optional(),
        targetPortId: z.string().optional(),
        condition: z.string().optional(),
        priority: z.number().optional(),
        position: z.object({ x: z.number(), y: z.number() }).optional(),
        disabled: z.boolean().optional(),
        meta: z.unknown().optional(),
    })
    .passthrough();

export type EdgeBody = z.infer<typeof EdgeBodySchema>;
