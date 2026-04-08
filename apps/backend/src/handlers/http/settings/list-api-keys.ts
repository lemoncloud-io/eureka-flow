import { settingsService } from '../../../services/settings-service';
import { withMiddleware } from '../../../utils/middleware';
import { ok } from '../../../utils/response';

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * GET /settings/api-keys
 *
 * Returns masked info for all configured API key providers.
 * Raw keys are NEVER returned.
 */
const handler = async (_event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const items = await settingsService.getAll();
    return ok({ items });
};

export const main = withMiddleware(handler);
