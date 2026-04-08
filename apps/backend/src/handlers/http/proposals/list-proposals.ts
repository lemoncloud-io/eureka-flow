import { ProposalListParamsSchema } from '@flows/contracts';

import { proposalRepo } from '../../../repositories/proposal-repository';
import { getPathParam, withMiddleware } from '../../../utils/middleware';
import { badRequest, ok } from '../../../utils/response';

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * GET /flows/{flowId}/proposals
 *
 * Returns: { items: Proposal[] }
 */
const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const flowId = getPathParam(event, 'flowId');
    const parsed = ProposalListParamsSchema.safeParse({ flowId });
    if (!parsed.success) return badRequest('flowId is required');

    const items = await proposalRepo.listByFlow(parsed.data.flowId);
    return ok({ items });
};

export const main = withMiddleware(handler);
