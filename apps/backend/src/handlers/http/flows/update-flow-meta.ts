import { FlowUpdateMetaRequestSchema } from '@flows/contracts';

import { flowRepo } from '../../../repositories/flow-repository';
import { getBody, getPathParam, withMiddleware } from '../../../utils/middleware';
import { badRequest, notFound, ok } from '../../../utils/response';

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * POST /flows/{id}
 * Caller: libs/flows/src/api/flows.ts → updateFlowMetadata()
 *
 * Body: { name?: string }
 * Returns: FlowView
 */
const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const id = getPathParam(event, 'id');
    if (!id) return badRequest('Missing flow ID');

    const body = getBody(event);
    const parsed = FlowUpdateMetaRequestSchema.safeParse(body);
    if (!parsed.success) return badRequest(`Invalid body: ${parsed.error.message}`);

    const flow = await flowRepo.updateMeta(id, parsed.data);
    if (!flow) return notFound(`Flow ${id} not found`);

    return ok({
        id: flow.id,
        name: flow.name,
        state: flow.state,
        createdAt: flow.createdAt,
        updatedAt: flow.updatedAt,
    });
};

export const main = withMiddleware(handler);
