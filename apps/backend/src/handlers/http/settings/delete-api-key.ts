import { ApiKeyDeleteParamsSchema } from '@flows/contracts';

import { settingsService } from '../../../services/settings-service';
import { getPathParam, withMiddleware } from '../../../utils/middleware';
import { badRequest, ok } from '../../../utils/response';

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * DELETE /settings/api-keys/{provider}
 *
 * Removes a stored API key for the given provider.
 */
const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const provider = getPathParam(event, 'provider');
    const parsed = ApiKeyDeleteParamsSchema.safeParse({ provider });
    if (!parsed.success) {
        return badRequest(`Invalid provider: ${parsed.error.errors.map(e => e.message).join(', ')}`);
    }

    await settingsService.deleteKey(parsed.data.provider);

    return ok({ provider: parsed.data.provider, deleted: true });
};

export const main = withMiddleware(handler);
