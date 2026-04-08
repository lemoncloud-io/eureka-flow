import { z } from 'zod';

// ============================================================================
// Common response/error schemas — shared across all endpoints
// ============================================================================

/**
 * Generic list result wrapper.
 * Server returns `{ list: T[], total?, page?, limit? }`
 */
export const ListResultSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
    z.object({
        list: z.array(itemSchema),
        total: z.number().optional(),
        page: z.number().optional(),
        limit: z.number().optional(),
    });

/**
 * API error response from backend
 */
export const ApiErrorResponseSchema = z.object({
    status: z.number(),
    error: z.string(),
    message: z.string().optional(),
});

export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
