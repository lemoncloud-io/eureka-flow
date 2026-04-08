import { EdgeGetParamsSchema } from '@flows/contracts';

import { flowRepo } from '../../../repositories/flow-repository';
import { getPathParam, withMiddleware } from '../../../utils/middleware';
import { badRequest, notFound, ok } from '../../../utils/response';

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * GET /edges/{id}
 * Caller: libs/flows/src/api/edges.ts → getEdge()
 *
 * Scans all flows to find the edge by id.
 * Returns: EdgeView
 */
const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const rawId = getPathParam(event, 'id');
    const parsed = EdgeGetParamsSchema.safeParse({ id: rawId });
    if (!parsed.success) return badRequest('Missing edge ID');
    const { id } = parsed.data;

    const flows = await flowRepo.scan();
    for (const flow of flows) {
        const edges = (flow.edges as Array<Record<string, unknown>>) || [];
        const edge = edges.find(e => e.id === id);
        if (edge) return ok(edge);
    }

    return notFound(`Edge ${id} not found`);
};

export const main = withMiddleware(handler);
