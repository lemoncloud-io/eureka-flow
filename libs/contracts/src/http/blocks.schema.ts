import { z } from 'zod';

/**
 * HTTP contracts for /blocks/* endpoints.
 * BlockDefinition internal shape owned by @lemoncloud/eureka-flows-api.
 */

// ============================================================================
// GET /blocks/0/list?cores=1&limit=-1
// Caller: libs/flows/src/api/blocks.ts → listBlocks()
// ============================================================================

export const BlockListQuerySchema = z.object({
    cores: z.string().optional(), // "1"
    limit: z.string().optional(), // "-1"
});

/**
 * Single block item in list response.
 * The frontend checks `$definition.label` to filter valid blocks.
 */
export const BlockListItemSchema = z
    .object({
        $definition: z
            .object({
                id: z.string().optional(),
                type: z.string(),
                label: z.string(),
                description: z.string().optional(),
                inputs: z.array(z.record(z.unknown())).optional(),
                outputs: z.array(z.record(z.unknown())).optional(),
                configSchema: z.array(z.record(z.unknown())).optional(),
            })
            .passthrough(),
        isFrontend: z.union([z.literal(0), z.literal(1)]).optional(),
        stereo: z.enum(['input', 'process', 'output']).optional(),
        isRunnable: z.boolean().optional(),
    })
    .passthrough();

export const BlockListResponseSchema = z.object({
    list: z.array(BlockListItemSchema),
});

export type BlockListItem = z.infer<typeof BlockListItemSchema>;
export type BlockListResponse = z.infer<typeof BlockListResponseSchema>;
