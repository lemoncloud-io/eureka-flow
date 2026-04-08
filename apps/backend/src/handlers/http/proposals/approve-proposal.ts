import { ProposalApproveParamsSchema, ProposalApproveRequestSchema } from '@flows/contracts';

import { proposalService } from '../../../services/proposal-service';
import { getBody, getPathParam, withMiddleware } from '../../../utils/middleware';
import { badRequest, conflict, notFound, ok } from '../../../utils/response';

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * POST /proposals/{proposalId}/approve
 *
 * Body: { decisionNote?: string }
 * Returns: { proposal, flow }
 *
 * State transition: PENDING → APPROVED
 * Side effects: flow nodes/edges replaced, SYSTEM message saved
 */
const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const proposalId = getPathParam(event, 'proposalId');
    const paramsParsed = ProposalApproveParamsSchema.safeParse({ proposalId });
    if (!paramsParsed.success) return badRequest('proposalId is required');

    const body = getBody<Record<string, unknown>>(event) ?? {};
    const bodyParsed = ProposalApproveRequestSchema.safeParse(body);

    const result = await proposalService.approve(
        paramsParsed.data.proposalId,
        bodyParsed.success ? bodyParsed.data.decisionNote : undefined
    );

    if (!result.ok) {
        if (result.status === 404) return notFound(result.error);
        if (result.status === 409) return conflict(result.error);
        return badRequest(result.error);
    }

    const { proposal, flow } = result.data;
    return ok({
        proposal,
        flow: {
            id: flow.id,
            name: flow.name,
            state: flow.state,
            nodes: flow.nodes,
            edges: flow.edges,
            updatedAt: flow.updatedAt,
        },
    });
};

export const main = withMiddleware(handler);
