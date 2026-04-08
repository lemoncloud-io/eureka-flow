import { z } from 'zod';

/**
 * HTTP contracts for /settings/api-keys endpoints.
 * Provider API key management — store, retrieve (masked), delete, verify.
 */

export const ApiKeyProviderSchema = z.enum(['anthropic', 'nanobanana', 'openai', 'elevenlabs', 'naver']);

export type ApiKeyProvider = z.infer<typeof ApiKeyProviderSchema>;

export const API_KEY_PROVIDERS = ApiKeyProviderSchema.options;

export const ApiKeyStatusSchema = z.enum(['active', 'invalid', 'unverified', 'missing']);

// ============================================================================
// GET /settings/api-keys
// ============================================================================

export const ApiKeyInfoSchema = z.object({
    provider: ApiKeyProviderSchema,
    configured: z.boolean(),
    maskedKey: z.string().nullable(),
    status: ApiKeyStatusSchema,
    lastVerifiedAt: z.string().nullable(),
});

export const ApiKeyListResponseSchema = z.object({
    items: z.array(ApiKeyInfoSchema),
});

export type ApiKeyInfo = z.infer<typeof ApiKeyInfoSchema>;
export type ApiKeyListResponse = z.infer<typeof ApiKeyListResponseSchema>;

// ============================================================================
// PUT /settings/api-keys
// ============================================================================

export const ApiKeyPutRequestSchema = z.object({
    provider: ApiKeyProviderSchema,
    apiKey: z.string().min(1, 'API key cannot be empty'),
});

export const ApiKeyPutResponseSchema = z.object({
    provider: ApiKeyProviderSchema,
    configured: z.boolean(),
    maskedKey: z.string(),
    status: ApiKeyStatusSchema,
});

export type ApiKeyPutRequest = z.infer<typeof ApiKeyPutRequestSchema>;
export type ApiKeyPutResponse = z.infer<typeof ApiKeyPutResponseSchema>;

// ============================================================================
// DELETE /settings/api-keys/{provider}
// ============================================================================

export const ApiKeyDeleteParamsSchema = z.object({
    provider: ApiKeyProviderSchema,
});

export const ApiKeyDeleteResponseSchema = z.object({
    provider: ApiKeyProviderSchema,
    deleted: z.literal(true),
});

// ============================================================================
// POST /settings/api-keys/{provider}/verify
// ============================================================================

export const ApiKeyVerifyParamsSchema = z.object({
    provider: ApiKeyProviderSchema,
});

export const ApiKeyVerifyResponseSchema = z.object({
    provider: ApiKeyProviderSchema,
    valid: z.boolean(),
    status: ApiKeyStatusSchema,
    checkedAt: z.string(),
    message: z.string().optional(),
});

export type ApiKeyVerifyResponse = z.infer<typeof ApiKeyVerifyResponseSchema>;
