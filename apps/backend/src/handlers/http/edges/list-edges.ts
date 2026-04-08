import { EdgeListRequestSchema } from '@flows/contracts';

import { flowRepo } from '../../../repositories/flow-repository';
import { getBody, withMiddleware } from '../../../utils/middleware';
import { badRequest, notFound, ok } from '../../../utils/response';

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * POST /edges/0/list
 * Caller: libs/flows/src/api/edges.ts → listEdges()
 *
 * Body: { flowId: string }
 * Returns: { list: EdgeView[] }
 *
 * Edges are stored inside the flow document (flow.edges[]).
 */
const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const body = getBody(event);
    const parsed = EdgeListRequestSchema.safeParse(body);
    if (!parsed.success) return badRequest('flowId is required');

    const flow = await flowRepo.get(parsed.data.flowId);
    if (!flow) return notFound(`Flow ${parsed.data.flowId} not found`);

    return ok({ list: flow.edges || [] });
};

export const main = withMiddleware(handler);
