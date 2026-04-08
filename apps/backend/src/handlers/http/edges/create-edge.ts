import { EdgeBodySchema } from '@flows/contracts';

import { flowRepo } from '../../../repositories/flow-repository';
import { generateNumericId } from '../../../utils/id-generator';
import { getBody, withMiddleware } from '../../../utils/middleware';
import { badRequest, created, notFound } from '../../../utils/response';

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * POST /edges/0
 * Caller: libs/flows/src/api/edges.ts → createEdge()
 *
 * Body: EdgeBody { flowId, sourceNodeId, sourcePortId, targetNodeId, targetPortId, ...rest }
 * Note: flowId comes from the body (unlike nodes where it's a query param)
 * Returns: EdgeView (the created edge with server-assigned id)
 *
 * Edges are stored inside the flow document (flow.edges[]).
 */
const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const body = getBody<Record<string, unknown>>(event);
    const parsed = EdgeBodySchema.safeParse(body);
    if (!parsed.success) return badRequest('Invalid edge body');

    const { flowId, ...rest } = parsed.data;
    if (!flowId) return badRequest('flowId is required in body');

    const flow = await flowRepo.get(flowId);
    if (!flow) return notFound(`Flow ${flowId} not found`);

    const now = new Date().toISOString();
    const newEdge: Record<string, unknown> = {
        id: generateNumericId(),
        flowId,
        createdAt: now,
        updatedAt: now,
        ...rest,
    };

    const edges = [...(flow.edges || []), newEdge];
    await flowRepo.put({ ...flow, edges, updatedAt: now });

    return created(newEdge);
};

export const main = withMiddleware(handler);
