import { z } from 'zod';

/**
 * HTTP contracts for runs endpoints.
 * Run = a snapshot-based execution of a flow.
 */

// ============================================================================
// Domain enums
// ============================================================================

export const RunStatusSchema = z.enum(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED']);
export const RunTypeSchema = z.enum(['FULL_FLOW', 'SINGLE_NODE']);
export const RunNodeStatusSchema = z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED', 'CANCELLED']);

// ============================================================================
// RunNode model
// ============================================================================

export const RunNodeSchema = z.object({
    runId: z.string(),
    nodeId: z.string(),
    blockType: z.string(),
    label: z.string(),
    status: RunNodeStatusSchema,
    inputPayload: z.record(z.unknown()).nullable().optional(),
    outputPayload: z.record(z.unknown()).nullable().optional(),
    progress: z.number().min(0).max(100),
    retryCount: z.number().int().min(0),
    parentNodeIds: z.array(z.string()),
    errorCode: z.string().nullable().optional(),
    errorMessage: z.string().nullable().optional(),
    startedAt: z.string().nullable().optional(),
    completedAt: z.string().nullable().optional(),
    updatedAt: z.string(),
});

export type RunNode = z.infer<typeof RunNodeSchema>;

// ============================================================================
// Run model
// ============================================================================

export const RunSchema = z.object({
    runId: z.string(),
    flowId: z.string(),
    runType: RunTypeSchema,
    targetNodeId: z.string().nullable().optional(),
    status: RunStatusSchema,
    triggerSource: z.string(),
    flowSnapshot: z.object({
        nodes: z.array(z.record(z.unknown())),
        edges: z.array(z.record(z.unknown())),
    }),
    finalOutputSummary: z.record(z.unknown()).nullable().optional(),
    startedAt: z.string().nullable().optional(),
    completedAt: z.string().nullable().optional(),
    createdAt: z.string(),
});

export type Run = z.infer<typeof RunSchema>;

// ============================================================================
// POST /flows/{flowId}/runs
// ============================================================================

export const RunCreateParamsSchema = z.object({
    flowId: z.string().min(1),
});

export const RunCreateRequestSchema = z.object({
    triggerSource: z.string().default('MANUAL'),
});

export const RunCreateResponseSchema = z.object({
    runId: z.string(),
    flowId: z.string(),
    status: RunStatusSchema,
    runType: RunTypeSchema,
    createdAt: z.string(),
});

export type RunCreateRequest = z.infer<typeof RunCreateRequestSchema>;
export type RunCreateResponse = z.infer<typeof RunCreateResponseSchema>;

// ============================================================================
// GET /flows/{flowId}/runs
// ============================================================================

export const RunListParamsSchema = z.object({
    flowId: z.string().min(1),
});

export const RunListResponseSchema = z.object({
    items: z.array(
        z.object({
            runId: z.string(),
            flowId: z.string(),
            runType: RunTypeSchema,
            status: RunStatusSchema,
            startedAt: z.string().nullable().optional(),
            completedAt: z.string().nullable().optional(),
            createdAt: z.string(),
        })
    ),
});

export type RunListResponse = z.infer<typeof RunListResponseSchema>;

// ============================================================================
// GET /runs/{runId}
// ============================================================================

export const RunGetParamsSchema = z.object({
    runId: z.string().min(1),
});

export const RunGetResponseSchema = RunSchema;
export type RunGetResponse = z.infer<typeof RunGetResponseSchema>;

// ============================================================================
// GET /runs/{runId}/nodes
// ============================================================================

export const RunNodesListParamsSchema = z.object({
    runId: z.string().min(1),
});

export const RunNodesListResponseSchema = z.object({
    items: z.array(RunNodeSchema),
});

// ============================================================================
// GET /runs/{runId}/nodes/{nodeId}
// ============================================================================

export const RunNodeGetParamsSchema = z.object({
    runId: z.string().min(1),
    nodeId: z.string().min(1),
});

export const RunNodeGetResponseSchema = RunNodeSchema;

// ============================================================================
// POST /runs/{runId}/cancel
// ============================================================================

export const RunCancelParamsSchema = z.object({
    runId: z.string().min(1),
});

export const RunCancelResponseSchema = z.object({
    runId: z.string(),
    status: RunStatusSchema,
});

// ============================================================================
// POST /runs/{runId}/nodes/{nodeId}/retry
// ============================================================================

export const RunNodeRetryParamsSchema = z.object({
    runId: z.string().min(1),
    nodeId: z.string().min(1),
});

export const RunNodeRetryRequestSchema = z.object({
    reason: z.string().optional(),
});

export const RunNodeRetryResponseSchema = z.object({
    runId: z.string(),
    nodeId: z.string(),
    retryAccepted: z.boolean(),
});
