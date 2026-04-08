import { RunNodesListParamsSchema } from '@flows/contracts';

import { runRepo } from '../../../repositories/run-repository';
import { getPathParam, withMiddleware } from '../../../utils/middleware';
import { badRequest, notFound, ok } from '../../../utils/response';

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * GET /runs/{runId}/nodes
 *
 * Returns: { items: RunNode[] }
 */
const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const runId = getPathParam(event, 'runId');
    const paramsParsed = RunNodesListParamsSchema.safeParse({ runId });
    if (!paramsParsed.success) return badRequest('runId is required');

    // Verify run exists
    const run = await runRepo.getRun(paramsParsed.data.runId);
    if (!run) return notFound(`Run ${paramsParsed.data.runId} not found`);

    const nodes = await runRepo.listRunNodes(paramsParsed.data.runId);
    return ok({ items: nodes });
};

export const main = withMiddleware(handler);
