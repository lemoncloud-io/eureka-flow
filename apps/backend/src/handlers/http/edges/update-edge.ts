import { EdgeBodySchema, EdgeGetParamsSchema } from '@flows/contracts';

import { flowRepo } from '../../../repositories/flow-repository';
import { getBody, getPathParam, withMiddleware } from '../../../utils/middleware';
import { badRequest, notFound, ok } from '../../../utils/response';

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * POST /edges/{id}
 * Caller: libs/flows/src/api/edges.ts → updateEdge()
 *
 * Body: EdgeBody (partial edge fields to merge)
 * Returns: EdgeView (the updated edge)
 *
 * Scans all flows to find the edge by id, merges the body fields, and saves.
 */
const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const rawId = getPathParam(event, 'id');
    const paramsParsed = EdgeGetParamsSchema.safeParse({ id: rawId });
    if (!paramsParsed.success) return badRequest('Missing edge ID');
    const { id } = paramsParsed.data;

    const body = getBody<Record<string, unknown>>(event);
    const bodyParsed = EdgeBodySchema.safeParse(body);
    if (!bodyParsed.success) return badRequest('Invalid edge body');

    const flows = await flowRepo.scan();
    for (const flow of flows) {
        const edges = (flow.edges as Array<Record<string, unknown>>) || [];
        const idx = edges.findIndex(e => e.id === id);
        if (idx !== -1) {
            const now = new Date().toISOString();
            const updatedEdge: Record<string, unknown> = {
                ...edges[idx],
                ...bodyParsed.data,
                id,
                updatedAt: now,
            };
            const updatedEdges = edges.map((e, i) => (i === idx ? updatedEdge : e));
            await flowRepo.put({ ...flow, edges: updatedEdges, updatedAt: now });
            return ok(updatedEdge);
        }
    }

    return notFound(`Edge ${id} not found`);
};

export const main = withMiddleware(handler);
