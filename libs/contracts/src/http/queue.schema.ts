import { z } from 'zod';

/**
 * Queue message schemas — used by the async execution engine.
 * In local mode: processed inline (synchronous fallback).
 * In prod mode: sent to SQS and processed by a Lambda worker.
 */

export const QueueMessageSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('EXECUTE_RUN'),
        runId: z.string(),
        executionId: z.string(),
        timestamp: z.string(),
    }),
    z.object({
        type: z.literal('EXECUTE_NODE'),
        runId: z.string(),
        nodeId: z.string(),
        executionId: z.string(),
        timestamp: z.string(),
    }),
]);

export type QueueMessage = z.infer<typeof QueueMessageSchema>;
