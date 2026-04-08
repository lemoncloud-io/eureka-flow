import { EdgeGetParamsSchema } from '@flows/contracts';

import { flowRepo } from '../../../repositories/flow-repository';
import { getPathParam, withMiddleware } from '../../../utils/middleware';
import { badRequest, noContent, notFound } from '../../../utils/response';

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * DELETE /edges/{id}
 * Caller: libs/flows/src/api/edges.ts → deleteEdge()
 *
 * Scans all flows to find which flow contains the edge,
 * removes it from flow.edges[], and saves the flow back.
 *
 * Returns: 204 No Content
 */
const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const rawId = getPathParam(event, 'id');
    const parsed = EdgeGetParamsSchema.safeParse({ id: rawId });
    if (!parsed.success) return badRequest('Missing edge ID');
    const { id } = parsed.data;

    const flows = await flowRepo.scan();
    for (const flow of flows) {
        const edges = (flow.edges as Array<Record<string, unknown>>) || [];
        const idx = edges.findIndex(e => e.id === id);
        if (idx !== -1) {
            const updated = edges.filter(e => e.id !== id);
            await flowRepo.put({ ...flow, edges: updated, updatedAt: new Date().toISOString() });
            return noContent();
        }
    }

    return notFound(`Edge ${id} not found`);
};

export const main = withMiddleware(handler);
