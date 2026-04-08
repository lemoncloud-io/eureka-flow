import { NodeCreateRequestSchema } from '@flows/contracts';

import { flowRepo } from '../../../repositories/flow-repository';
import { generateNumericId } from '../../../utils/id-generator';
import { getBody, withMiddleware } from '../../../utils/middleware';
import { badRequest, created, notFound } from '../../../utils/response';

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * POST /nodes/0
 * Caller: libs/flows/src/api/nodes.ts → createNode()
 *
 * Body: NodeBody { name: string, flowId: string, blockId: string, ...rest }
 * Returns: NodeView (the created node with server-assigned id)
 *
 * Nodes are stored inside the flow document (flow.nodes[]).
 */
const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const body = getBody<Record<string, unknown>>(event);
    const parsed = NodeCreateRequestSchema.safeParse(body);
    if (!parsed.success) return badRequest('name, flowId, and blockId are required');

    const { flowId, ...rest } = parsed.data;

    const flow = await flowRepo.get(flowId);
    if (!flow) return notFound(`Flow ${flowId} not found`);

    const now = new Date().toISOString();
    const newNode: Record<string, unknown> = {
        id: generateNumericId(),
        flowId,
        createdAt: now,
        updatedAt: now,
        ...rest,
    };

    const nodes = [...(flow.nodes || []), newNode];
    await flowRepo.put({ ...flow, nodes, updatedAt: now });

    return created(newNode);
};

export const main = withMiddleware(handler);
