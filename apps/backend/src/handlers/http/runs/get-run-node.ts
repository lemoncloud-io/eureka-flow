import { RunNodeGetParamsSchema } from '@flows/contracts';

import { runRepo } from '../../../repositories/run-repository';
import { getPathParam, withMiddleware } from '../../../utils/middleware';
import { badRequest, notFound, ok } from '../../../utils/response';

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * GET /runs/{runId}/nodes/{nodeId}
 *
 * Returns: full RunNode object
 */
const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const runId = getPathParam(event, 'runId');
    const nodeId = getPathParam(event, 'nodeId');
    const paramsParsed = RunNodeGetParamsSchema.safeParse({ runId, nodeId });
    if (!paramsParsed.success) return badRequest('runId and nodeId are required');

    const node = await runRepo.getRunNode(paramsParsed.data.runId, paramsParsed.data.nodeId);
    if (!node) return notFound(`RunNode ${paramsParsed.data.runId}#${paramsParsed.data.nodeId} not found`);

    return ok(node);
};

export const main = withMiddleware(handler);
