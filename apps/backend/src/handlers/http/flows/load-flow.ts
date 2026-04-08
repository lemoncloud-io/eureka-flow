import { FlowLoadParamsSchema } from '@flows/contracts';

import { flowRepo } from '../../../repositories/flow-repository';
import { getPathParam, withMiddleware } from '../../../utils/middleware';
import { badRequest, notFound, ok } from '../../../utils/response';

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * GET /flows/{id}/load
 * Caller: libs/flows/src/api/flows.ts → loadFlow()
 *
 * Returns LoadFlowResult: { id, name, state, nodes, edges, ports?, channelId? }
 */
const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const id = getPathParam(event, 'id');
    const parsed = FlowLoadParamsSchema.safeParse({ id });
    if (!parsed.success) return badRequest('Missing or invalid flow ID');

    const flow = await flowRepo.get(parsed.data.id);
    if (!flow) return notFound(`Flow ${id} not found`);

    // Map to LoadFlowResult shape expected by frontend
    return ok({
        id: flow.id,
        name: flow.name,
        state: flow.state,
        stereo: flow.stereo,
        description: flow.description,
        nodes: flow.nodes,
        edges: flow.edges,
        ports: [], // TODO: port data from node sub-documents
        channelId: flow.channelId,
        createdAt: flow.createdAt,
        updatedAt: flow.updatedAt,
    });
};

export const main = withMiddleware(handler);
