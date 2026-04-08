import { z } from 'zod';

/**
 * HTTP contracts for assets endpoints.
 * Assets are files (images, audio, video) produced during execution.
 */

export const AssetTypeSchema = z.enum(['IMAGE', 'AUDIO', 'VIDEO', 'JSON', 'TEXT']);

export const AssetSchema = z.object({
    assetId: z.string(),
    runId: z.string(),
    runNodeId: z.string(),
    flowId: z.string(),
    assetType: AssetTypeSchema,
    mimeType: z.string(),
    publicUrl: z.string().nullable().optional(),
    metadata: z.record(z.unknown()).optional(),
    createdAt: z.string(),
});

export type Asset = z.infer<typeof AssetSchema>;

// GET /runs/{runId}/assets
export const AssetListParamsSchema = z.object({
    runId: z.string().min(1),
});

export const AssetListResponseSchema = z.object({
    items: z.array(AssetSchema),
});

// GET /assets/{assetId}
export const AssetGetParamsSchema = z.object({
    assetId: z.string().min(1),
});

export const AssetGetResponseSchema = AssetSchema;
export type AssetGetResponse = z.infer<typeof AssetGetResponseSchema>;
