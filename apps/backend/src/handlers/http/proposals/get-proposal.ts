import { ProposalGetParamsSchema } from '@flows/contracts';

import { proposalRepo } from '../../../repositories/proposal-repository';
import { getPathParam, withMiddleware } from '../../../utils/middleware';
import { badRequest, notFound, ok } from '../../../utils/response';

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * GET /proposals/{proposalId}
 *
 * Returns: Proposal
 */
const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const proposalId = getPathParam(event, 'proposalId');
    const parsed = ProposalGetParamsSchema.safeParse({ proposalId });
    if (!parsed.success) return badRequest('proposalId is required');

    const proposal = await proposalRepo.get(parsed.data.proposalId);
    if (!proposal) return notFound(`Proposal ${proposalId} not found`);

    return ok(proposal);
};

export const main = withMiddleware(handler);
