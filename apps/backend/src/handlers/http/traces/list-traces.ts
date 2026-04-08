import { TraceListParamsSchema } from '@flows/contracts';

import { traceRepo } from '../../../repositories/trace-repository';
import { getPathParam, withMiddleware } from '../../../utils/middleware';
import { badRequest, ok } from '../../../utils/response';

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * GET /runs/{runId}/traces
 *
 * Returns all trace records for the given run, ordered by occurredAt ascending.
 */
const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const runId = getPathParam(event, 'runId');
    const paramsParsed = TraceListParamsSchema.safeParse({ runId });
    if (!paramsParsed.success) return badRequest('runId is required');

    const items = await traceRepo.listByRun(paramsParsed.data.runId);

    return ok({ items });
};

export const main = withMiddleware(handler);
