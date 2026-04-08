import { flowRepo } from '../../../repositories/flow-repository';
import { getPathParam, withMiddleware } from '../../../utils/middleware';
import { badRequest, notFound, ok } from '../../../utils/response';

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * GET /nodes/{id}
 * Caller: libs/flows/src/api/nodes.ts → getNode()
 *
 * Nodes are embedded in flows. Scan all flows to find the node.
 * TODO P1: Consider a separate node index for performance.
 */
const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const id = getPathParam(event, 'id');
    if (!id) return badRequest('Missing node ID');

    const flows = await flowRepo.scan();
    for (const flow of flows) {
        const nodes = (flow.nodes as Array<Record<string, unknown>>) || [];
        const node = nodes.find(n => n.id === id);
        if (node) return ok(node);
    }

    return notFound(`Node ${id} not found`);
};

export const main = withMiddleware(handler);
