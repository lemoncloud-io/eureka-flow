import { AssetListParamsSchema } from '@flows/contracts';

import { assetRepo } from '../../../repositories/asset-repository';
import { getPathParam, withMiddleware } from '../../../utils/middleware';
import { badRequest, ok } from '../../../utils/response';

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * GET /runs/{runId}/assets
 *
 * Returns all asset records for the given run, ordered by createdAt ascending.
 */
const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const runId = getPathParam(event, 'runId');
    const paramsParsed = AssetListParamsSchema.safeParse({ runId });
    if (!paramsParsed.success) return badRequest('runId is required');

    const items = await assetRepo.listByRun(paramsParsed.data.runId);

    return ok({ items });
};

export const main = withMiddleware(handler);
