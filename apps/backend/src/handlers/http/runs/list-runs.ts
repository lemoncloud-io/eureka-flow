import { RunListParamsSchema } from '@flows/contracts';

import { runRepo } from '../../../repositories/run-repository';
import { getPathParam, withMiddleware } from '../../../utils/middleware';
import { badRequest, ok } from '../../../utils/response';

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * GET /flows/{flowId}/runs
 *
 * Returns: { items: Run[] }
 */
const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const flowId = getPathParam(event, 'flowId');
    const paramsParsed = RunListParamsSchema.safeParse({ flowId });
    if (!paramsParsed.success) return badRequest('flowId is required');

    const runs = await runRepo.listByFlow(paramsParsed.data.flowId);

    return ok({
        items: runs.map(r => ({
            runId: r.runId,
            flowId: r.flowId,
            runType: r.runType,
            status: r.status,
            startedAt: r.startedAt ?? null,
            completedAt: r.completedAt ?? null,
            createdAt: r.createdAt,
        })),
    });
};

export const main = withMiddleware(handler);
