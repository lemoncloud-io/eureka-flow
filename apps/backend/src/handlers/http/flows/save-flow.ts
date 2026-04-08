import { FlowSaveRequestSchema } from '@flows/contracts';

import { flowRepo } from '../../../repositories/flow-repository';
import { getBody, getPathParam, withMiddleware } from '../../../utils/middleware';
import { badRequest, ok } from '../../../utils/response';

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * POST /flows/{id}/save
 * Caller: libs/flows/src/api/flows.ts → saveFlow() / createFlow()
 *
 * id="0" → create new flow
 * Body: { nodes: NodeData[], edges: EdgeData[] }
 * Returns: SaveFlowView
 */
const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const id = getPathParam(event, 'id');
    if (!id) return badRequest('Missing flow ID');

    const body = getBody(event);
    const parsed = FlowSaveRequestSchema.safeParse(body);
    if (!parsed.success) return badRequest(`Invalid body: ${parsed.error.message}`);

    const flow = await flowRepo.save(id, parsed.data.nodes, parsed.data.edges);

    return ok({
        id: flow.id,
        name: flow.name,
        state: flow.state,
        nodes: flow.nodes,
        edges: flow.edges,
        ports: [],
    });
};

export const main = withMiddleware(handler);
