import { NodeDeleteParamsSchema } from '@flows/contracts';

import { flowRepo } from '../../../repositories/flow-repository';
import { getPathParam, withMiddleware } from '../../../utils/middleware';
import { badRequest, noContent, notFound } from '../../../utils/response';

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * DELETE /nodes/{id}
 * Caller: libs/flows/src/api/nodes.ts → deleteNode()
 *
 * Scans all flows to find which flow contains the node,
 * removes it from flow.nodes[], and saves the flow back.
 *
 * Returns: 204 No Content
 */
const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const rawId = getPathParam(event, 'id');
    const parsed = NodeDeleteParamsSchema.safeParse({ id: rawId });
    if (!parsed.success) return badRequest('Missing node ID');
    const { id } = parsed.data;

    const flows = await flowRepo.scan();
    for (const flow of flows) {
        const nodes = (flow.nodes as Array<Record<string, unknown>>) || [];
        const idx = nodes.findIndex(n => n.id === id);
        if (idx !== -1) {
            const updated = nodes.filter(n => n.id !== id);
            await flowRepo.put({ ...flow, nodes: updated, updatedAt: new Date().toISOString() });
            return noContent();
        }
    }

    return notFound(`Node ${id} not found`);
};

export const main = withMiddleware(handler);
