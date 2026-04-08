import { AssetGetParamsSchema } from '@flows/contracts';

import { assetRepo } from '../../../repositories/asset-repository';
import { getPathParam, withMiddleware } from '../../../utils/middleware';
import { badRequest, notFound, ok } from '../../../utils/response';

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * GET /assets/{assetId}
 *
 * Returns a single asset by ID, or 404 if not found.
 */
const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const assetId = getPathParam(event, 'assetId');
    const paramsParsed = AssetGetParamsSchema.safeParse({ assetId });
    if (!paramsParsed.success) return badRequest('assetId is required');

    const asset = await assetRepo.get(paramsParsed.data.assetId);
    if (!asset) return notFound(`Asset ${paramsParsed.data.assetId} not found`);

    return ok(asset);
};

export const main = withMiddleware(handler);
