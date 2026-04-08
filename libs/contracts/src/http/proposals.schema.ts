import { z } from 'zod';

/**
 * HTTP contracts for proposals endpoints.
 * New domain — not in existing eureka-flow frontend.
 */

// ============================================================================
// Domain enums
// ============================================================================

export const ProposalStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED']);

// ============================================================================
// Proposal model (stored in ProposalsTable)
// ============================================================================

export const ProposalSchema = z.object({
    proposalId: z.string(),
    flowId: z.string(),
    sourceMessageId: z.string(),
    status: ProposalStatusSchema,
    proposedNodes: z.array(z.record(z.unknown())),
    proposedEdges: z.array(z.record(z.unknown())),
    estimatedCost: z
        .object({
            currency: z.string(),
            total: z.number(),
            breakdown: z
                .array(
                    z.object({
                        blockType: z.string(),
                        amount: z.number(),
                    })
                )
                .optional(),
        })
        .optional(),
    approvalRequired: z.boolean(),
    decisionReason: z.string().nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
});

export type Proposal = z.infer<typeof ProposalSchema>;

// ============================================================================
// GET /flows/{flowId}/proposals
// ============================================================================

export const ProposalListParamsSchema = z.object({
    flowId: z.string().min(1),
});

export const ProposalListResponseSchema = z.object({
    items: z.array(ProposalSchema),
});

export type ProposalListParams = z.infer<typeof ProposalListParamsSchema>;
export type ProposalListResponse = z.infer<typeof ProposalListResponseSchema>;

// ============================================================================
// GET /proposals/{proposalId}
// ============================================================================

export const ProposalGetParamsSchema = z.object({
    proposalId: z.string().min(1),
});

export const ProposalGetResponseSchema = ProposalSchema;

export type ProposalGetParams = z.infer<typeof ProposalGetParamsSchema>;
export type ProposalGetResponse = z.infer<typeof ProposalGetResponseSchema>;
