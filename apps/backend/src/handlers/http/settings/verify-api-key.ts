import { ApiKeyVerifyParamsSchema } from '@flows/contracts';

import { settingsService } from '../../../services/settings-service';
import { getPathParam, withMiddleware } from '../../../utils/middleware';
import { badRequest, ok } from '../../../utils/response';

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * POST /settings/api-keys/{provider}/verify
 *
 * Performs a real lightweight HTTP check against the provider's API.
 * Updates stored status to 'active' or 'invalid' accordingly.
 * Returns: { provider, valid, status, checkedAt, message? }
 *
 * Never crashes on verify failure — always returns a structured response.
 */
const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const provider = getPathParam(event, 'provider');
    const parsed = ApiKeyVerifyParamsSchema.safeParse({ provider });
    if (!parsed.success) {
        return badRequest(`Invalid provider: ${parsed.error.errors.map(e => e.message).join(', ')}`);
    }

    const result = await settingsService.verifyKey(parsed.data.provider);
    return ok(result);
};

export const main = withMiddleware(handler);
