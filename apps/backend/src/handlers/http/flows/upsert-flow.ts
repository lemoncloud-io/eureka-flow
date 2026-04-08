import { FlowSaveRequestSchema } from '@flows/contracts';

import { flowRepo } from '../../../repositories/flow-repository';
import { getBody, getPathParam, withMiddleware } from '../../../utils/middleware';
import { badRequest, notFound, ok } from '../../../utils/response';

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * POST /flows/{id}/upsert
 * Caller: libs/flows/src/api/flows.ts → upsertFlow()
 *
 * Batch update nodes/edges for an existing flow.
 * Same request/response shape as save.
 */
const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const id = getPathParam(event, 'id');
    if (!id) return badRequest('Missing flow ID');

    const existing = await flowRepo.get(id);
    if (!existing) return notFound(`Flow ${id} not found`);

    const body = getBody(event);
    const parsed = FlowSaveRequestSchema.safeParse(body);
    if (!parsed.success) return badRequest(`Invalid body: ${parsed.error.message}`);

    // Merge: upsert replaces nodes/edges that match by id, adds new ones
    // For simplicity in P0, treat as full replacement (same as save)
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
