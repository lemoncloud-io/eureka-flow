import { RunCancelParamsSchema } from '@flows/contracts';

import { runService } from '../../../services/run-service';
import { getPathParam, withMiddleware } from '../../../utils/middleware';
import { badRequest, conflict, notFound, ok } from '../../../utils/response';

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * POST /runs/{runId}/cancel
 *
 * Returns: { runId, status: 'CANCELLED' }
 * 409 if already COMPLETED/FAILED/CANCELLED
 */
const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const runId = getPathParam(event, 'runId');
    const paramsParsed = RunCancelParamsSchema.safeParse({ runId });
    if (!paramsParsed.success) return badRequest('runId is required');

    const result = await runService.cancelRun(paramsParsed.data.runId);

    if (!result.ok) {
        if (result.status === 404) return notFound(result.error);
        if (result.status === 409) return conflict(result.error);
        return badRequest(result.error);
    }

    return ok({ runId: paramsParsed.data.runId, status: 'CANCELLED' });
};

export const main = withMiddleware(handler);
