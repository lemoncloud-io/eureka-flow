import { NodeListRequestSchema } from '@flows/contracts';

import { flowRepo } from '../../../repositories/flow-repository';
import { getBody, withMiddleware } from '../../../utils/middleware';
import { badRequest, notFound, ok } from '../../../utils/response';

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * POST /nodes/0/list
 * Caller: libs/flows/src/api/nodes.ts → listNodes()
 *
 * Body: { flowId: string }
 * Returns: { list: NodeView[] }
 *
 * Nodes are stored inside the flow document (flow.nodes[]).
 */
const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const body = getBody(event);
    const parsed = NodeListRequestSchema.safeParse(body);
    if (!parsed.success) return badRequest('flowId is required');

    const flow = await flowRepo.get(parsed.data.flowId);
    if (!flow) return notFound(`Flow ${parsed.data.flowId} not found`);

    return ok({ list: flow.nodes || [] });
};

export const main = withMiddleware(handler);
