import { RunCreateParamsSchema, RunCreateRequestSchema } from '@flows/contracts';

import { runService } from '../../../services/run-service';
import { getBody, getPathParam, withMiddleware } from '../../../utils/middleware';
import { accepted, badRequest, notFound } from '../../../utils/response';

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * POST /flows/{flowId}/runs
 *
 * Body: { triggerSource?: string }
 * Returns 202 Accepted: { runId, flowId, status, runType, createdAt }
 */
const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const flowId = getPathParam(event, 'flowId');
    const paramsParsed = RunCreateParamsSchema.safeParse({ flowId });
    if (!paramsParsed.success) return badRequest('flowId is required');

    const body = getBody<Record<string, unknown>>(event) ?? {};
    const bodyParsed = RunCreateRequestSchema.safeParse(body);
    const triggerSource = bodyParsed.success ? bodyParsed.data.triggerSource : 'MANUAL';

    const result = await runService.createRun(paramsParsed.data.flowId, triggerSource);

    if (!result.ok) {
        if (result.status === 404) return notFound(result.error);
        return badRequest(result.error);
    }

    const { run } = result;
    return accepted({
        runId: run.runId,
        flowId: run.flowId,
        status: run.status,
        runType: run.runType,
        createdAt: run.createdAt,
    });
};

export const main = withMiddleware(handler);
