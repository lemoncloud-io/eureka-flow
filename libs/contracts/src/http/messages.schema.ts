import { z } from 'zod';

/**
 * HTTP contracts for /flows/{flowId}/messages endpoints.
 * New domain — not in existing eureka-flow frontend.
 */

// ============================================================================
// Domain enums
// ============================================================================

export const MessageRoleSchema = z.enum(['USER', 'ASSISTANT', 'SYSTEM']);
export const MessageTypeSchema = z.enum(['TEXT', 'PROPOSAL', 'STATUS']);

// ============================================================================
// Message model (stored in MessagesTable)
// ============================================================================

export const MessageSchema = z.object({
    messageId: z.string(),
    flowId: z.string(),
    role: MessageRoleSchema,
    messageType: MessageTypeSchema,
    content: z.string(),
    proposalId: z.string().nullable().optional(),
    metadata: z.record(z.unknown()).optional(),
    createdAt: z.string(),
});

export type Message = z.infer<typeof MessageSchema>;

// ============================================================================
// GET /flows/{flowId}/messages
// ============================================================================

export const MessageListParamsSchema = z.object({
    flowId: z.string().min(1),
});

export const MessageListQuerySchema = z.object({
    limit: z.coerce.number().int().positive().default(50),
    cursor: z.string().optional(),
});

export const MessageListResponseSchema = z.object({
    items: z.array(MessageSchema),
    nextCursor: z.string().nullable(),
});

export type MessageListParams = z.infer<typeof MessageListParamsSchema>;
export type MessageListQuery = z.infer<typeof MessageListQuerySchema>;
export type MessageListResponse = z.infer<typeof MessageListResponseSchema>;

// ============================================================================
// POST /flows/{flowId}/messages
// ============================================================================

export const MessageCreateParamsSchema = z.object({
    flowId: z.string().min(1),
});

export const MessageCreateRequestSchema = z.object({
    content: z.string().min(1),
});

/**
 * Response includes:
 * - The user message that was stored
 * - The proposal generated (mock or real)
 * - The assistant message describing the proposal
 */
export const MessageCreateResponseSchema = z.object({
    message: MessageSchema,
    proposal: z.object({
        proposalId: z.string(),
        flowId: z.string(),
        status: z.string(),
        estimatedCost: z
            .object({
                currency: z.string(),
                total: z.number(),
            })
            .optional(),
        proposedNodes: z.array(z.record(z.unknown())),
        proposedEdges: z.array(z.record(z.unknown())),
        approvalRequired: z.boolean(),
        createdAt: z.string(),
    }),
    assistantMessage: MessageSchema,
});

export type MessageCreateRequest = z.infer<typeof MessageCreateRequestSchema>;
export type MessageCreateResponse = z.infer<typeof MessageCreateResponseSchema>;
