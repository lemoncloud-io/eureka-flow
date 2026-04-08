import { RunGetParamsSchema } from '@flows/contracts';

import { runRepo } from '../../../repositories/run-repository';
import { getPathParam, withMiddleware } from '../../../utils/middleware';
import { badRequest, notFound, ok } from '../../../utils/response';

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * GET /runs/{runId}
 *
 * Returns: full Run object including flowSnapshot
 */
const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const runId = getPathParam(event, 'runId');
    const paramsParsed = RunGetParamsSchema.safeParse({ runId });
    if (!paramsParsed.success) return badRequest('runId is required');

    const run = await runRepo.getRun(paramsParsed.data.runId);
    if (!run) return notFound(`Run ${paramsParsed.data.runId} not found`);

    return ok(run);
};

export const main = withMiddleware(handler);
