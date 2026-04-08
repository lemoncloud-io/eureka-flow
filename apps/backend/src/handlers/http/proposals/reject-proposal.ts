import { ProposalRejectParamsSchema, ProposalRejectRequestSchema } from '@flows/contracts';

import { proposalService } from '../../../services/proposal-service';
import { getBody, getPathParam, withMiddleware } from '../../../utils/middleware';
import { badRequest, conflict, notFound, ok } from '../../../utils/response';

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * POST /proposals/{proposalId}/reject
 *
 * Body: { reason?: string }
 * Returns: { proposal }
 *
 * State transition: PENDING → REJECTED
 * Side effects: SYSTEM message saved, flow NOT modified
 */
const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const proposalId = getPathParam(event, 'proposalId');
    const paramsParsed = ProposalRejectParamsSchema.safeParse({ proposalId });
    if (!paramsParsed.success) return badRequest('proposalId is required');

    const body = getBody<Record<string, unknown>>(event) ?? {};
    const bodyParsed = ProposalRejectRequestSchema.safeParse(body);

    const result = await proposalService.reject(
        paramsParsed.data.proposalId,
        bodyParsed.success ? bodyParsed.data.reason : undefined
    );

    if (!result.ok) {
        if (result.status === 404) return notFound(result.error);
        if (result.status === 409) return conflict(result.error);
        return badRequest(result.error);
    }

    return ok({ proposal: result.data.proposal });
};

export const main = withMiddleware(handler);
