import { z } from 'zod';

/**
 * HTTP contracts for traces endpoints.
 * Traces record execution-level debug data per run/node.
 */

export const TraceTypeSchema = z.enum(['TOOL_CALL', 'TOOL_RESULT', 'STATUS', 'RETRY', 'ERROR', 'POLICY']);

export const TraceSchema = z.object({
    traceId: z.string(),
    runId: z.string(),
    runNodeId: z.string().nullable().optional(),
    traceType: TraceTypeSchema,
    message: z.string(),
    data: z.record(z.unknown()).nullable().optional(),
    occurredAt: z.string(),
});

export type Trace = z.infer<typeof TraceSchema>;

// GET /runs/{runId}/traces
export const TraceListParamsSchema = z.object({
    runId: z.string().min(1),
});

export const TraceListResponseSchema = z.object({
    items: z.array(TraceSchema),
});

export type TraceListResponse = z.infer<typeof TraceListResponseSchema>;
